import { get, set, del } from 'idb-keyval';
import type { LibraryItem, UserSettings } from '../types/library';
import { UserSettingsSchema } from '../types/schema';

const ITEMS_KEY = 'drop_library_items_v1';
const SETTINGS_KEY = 'drop_library_settings_v1';

const DEFAULT_SETTINGS: UserSettings = {
  geminiApiKey: import.meta.env.VITE_GEMINI_API_KEY || '',
  geminiModel: 'gemini-2.5-flash',
  unfurlEndpoint: import.meta.env.VITE_UNFURL_ENDPOINT || '',
  themeMode: 'oled',
  autoEnrich: true,
  hapticFeedback: true,
};

type StorageChangeListener = (items: LibraryItem[]) => void;
type SettingsChangeListener = (settings: UserSettings) => void;

class StorageService {
  private itemListeners: Set<StorageChangeListener> = new Set();
  private settingsListeners: Set<SettingsChangeListener> = new Set();
  private cachedItems: LibraryItem[] | null = null;
  private cachedSettings: UserSettings | null = null;

  /**
   * Subscribe to library items changes.
   */
  subscribeItems(listener: StorageChangeListener): () => void {
    this.itemListeners.add(listener);
    // If cached, immediately notify
    if (this.cachedItems) {
      listener(this.cachedItems);
    } else {
      this.getAllItems().then((items) => listener(items));
    }
    return () => {
      this.itemListeners.delete(listener);
    };
  }

  /**
   * Subscribe to user settings changes.
   */
  subscribeSettings(listener: SettingsChangeListener): () => void {
    this.settingsListeners.add(listener);
    if (this.cachedSettings) {
      listener(this.cachedSettings);
    } else {
      this.getSettings().then((settings) => listener(settings));
    }
    return () => {
      this.settingsListeners.delete(listener);
    };
  }

  private notifyItems(items: LibraryItem[]) {
    this.cachedItems = items;
    for (const listener of this.itemListeners) {
      try {
        listener(items);
      } catch (err) {
        console.error('Error in storage items listener:', err);
      }
    }
  }

  private notifySettings(settings: UserSettings) {
    this.cachedSettings = settings;
    for (const listener of this.settingsListeners) {
      try {
        listener(settings);
      } catch (err) {
        console.error('Error in storage settings listener:', err);
      }
    }
  }

  /**
   * Returns all library items sorted descending by creation time.
   */
  async getAllItems(): Promise<LibraryItem[]> {
    try {
      const items = (await get<LibraryItem[]>(ITEMS_KEY)) || [];
      const sorted = [...items].sort((a, b) => b.createdAt - a.createdAt);
      this.cachedItems = sorted;
      return sorted;
    } catch (err) {
      console.error('Failed to load items from IndexedDB:', err);
      return this.cachedItems || [];
    }
  }

  /**
   * Retrieves a single item by ID.
   */
  async getItemById(id: string): Promise<LibraryItem | null> {
    const items = await this.getAllItems();
    return items.find((i) => i.id === id) || null;
  }

  /**
   * Saves or updates an item immediately in IndexedDB.
   */
  async saveItem(item: LibraryItem): Promise<void> {
    const items = await this.getAllItems();
    const existingIndex = items.findIndex((i) => i.id === item.id);
    let updated: LibraryItem[];

    if (existingIndex >= 0) {
      updated = [...items];
      updated[existingIndex] = { ...item, updatedAt: Date.now() };
    } else {
      updated = [item, ...items];
    }

    await set(ITEMS_KEY, updated);
    this.notifyItems(updated);
  }

  /**
   * Partially updates an existing item.
   */
  async updateItem(
    id: string,
    updates: Partial<Omit<LibraryItem, 'id' | 'createdAt'>>
  ): Promise<LibraryItem | null> {
    const items = await this.getAllItems();
    const index = items.findIndex((i) => i.id === id);
    if (index === -1) return null;

    const updatedItem: LibraryItem = {
      ...items[index],
      ...updates,
      updatedAt: Date.now(),
    };

    const newItems = [...items];
    newItems[index] = updatedItem;
    await set(ITEMS_KEY, newItems);
    this.notifyItems(newItems);
    return updatedItem;
  }

  /**
   * Deletes an item by ID.
   */
  async deleteItem(id: string): Promise<void> {
    const items = await this.getAllItems();
    const updated = items.filter((i) => i.id !== id);
    await set(ITEMS_KEY, updated);
    this.notifyItems(updated);
  }

  /**
   * Clears the entire library.
   */
  async clearAllItems(): Promise<void> {
    await del(ITEMS_KEY);
    this.notifyItems([]);
  }

  /**
   * Retrieves pending items requiring unfurling/enrichment.
   */
  async getPendingItems(): Promise<LibraryItem[]> {
    const items = await this.getAllItems();
    return items.filter(
      (item) => item.status === 'pending' || (item.status === 'failed' && item.retryCount < 3)
    );
  }

  /**
   * Loads user settings from IndexedDB.
   */
  async getSettings(): Promise<UserSettings> {
    if (this.cachedSettings) return this.cachedSettings;
    try {
      const raw = await get<Partial<UserSettings>>(SETTINGS_KEY);
      const parsed = UserSettingsSchema.parse({
        ...DEFAULT_SETTINGS,
        ...(raw || {}),
      });
      this.cachedSettings = parsed;
      return parsed;
    } catch {
      this.cachedSettings = DEFAULT_SETTINGS;
      return DEFAULT_SETTINGS;
    }
  }

  /**
   * Saves user settings to IndexedDB.
   */
  async saveSettings(partial: Partial<UserSettings>): Promise<UserSettings> {
    const current = await this.getSettings();
    const merged = { ...current, ...partial };
    const validated = UserSettingsSchema.parse(merged);
    await set(SETTINGS_KEY, validated);
    this.notifySettings(validated);
    return validated;
  }

  /**
   * Exports entire library and settings as formatted JSON string.
   */
  async exportBackup(): Promise<string> {
    const items = await this.getAllItems();
    const settings = await this.getSettings();
    // Exclude API key from exported backup for security!
    const safeSettings = { ...settings, geminiApiKey: '' };

    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        version: 1,
        items,
        settings: safeSettings,
      },
      null,
      2
    );
  }

  /**
   * Imports items from JSON backup, merging by item ID.
   */
  async importBackup(jsonString: string): Promise<number> {
    const data = JSON.parse(jsonString);
    if (!Array.isArray(data.items)) {
      throw new Error('Invalid backup file: "items" array missing');
    }

    const currentItems = await this.getAllItems();
    const itemMap = new Map<string, LibraryItem>();

    for (const item of currentItems) {
      itemMap.set(item.id, item);
    }

    let addedCount = 0;
    for (const rawItem of data.items) {
      if (rawItem && rawItem.id) {
        if (!itemMap.has(rawItem.id)) {
          addedCount++;
        }
        itemMap.set(rawItem.id, rawItem);
      }
    }

    const merged = Array.from(itemMap.values()).sort((a, b) => b.createdAt - a.createdAt);
    await set(ITEMS_KEY, merged);
    this.notifyItems(merged);
    return addedCount;
  }
}

export const storage = new StorageService();
