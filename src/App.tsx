import { useEffect, useState, useMemo, useCallback } from 'react';
import type { LibraryItem, FilterState, UserSettings } from './types/library';
import { storage } from './services/storage';
import { queueWorker } from './services/queueWorker';
import { SearchEngine } from './services/search';
import { coldStartBuffer, type IncomingSharePayload } from './native/coldStartBuffer';
import { setupStatusBar, triggerHaptic } from './native/bridge';

import { QuickDropBar } from './components/QuickDropBar';
import { FilterBar } from './components/FilterBar';
import { LibraryCard } from './components/LibraryCard';
import { SavedOverlay } from './components/SavedOverlay';
import { ItemDetailModal } from './components/ItemDetailModal';
import { SettingsModal } from './components/SettingsModal';

import {
  Layers,
  Settings as SettingsIcon,
  RotateCw,
  Sparkles,
  Inbox,
} from 'lucide-react';

export default function App() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [filter, setFilter] = useState<FilterState>({
    searchQuery: '',
    category: 'all',
    platform: 'all',
    status: 'all',
  });

  const [selectedItem, setSelectedItem] = useState<LibraryItem | null>(null);
  const [overlayItem, setOverlayItem] = useState<LibraryItem | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isWorkerActive, setIsWorkerActive] = useState(false);

  // Initialize search engine
  const searchEngine = useMemo(() => new SearchEngine(items), [items]);

  // Filtered and searched items
  const filteredItems = useMemo(
    () => searchEngine.filterAndSearch(filter),
    [searchEngine, filter]
  );

  // Handle incoming native / web share
  const handleIncomingShare = useCallback(async (payload: IncomingSharePayload) => {
    console.log('[App] Received share payload:', payload);

    let rawText = '';
    let targetUrl: string | undefined;

    if (payload.texts && payload.texts.length > 0) {
      // Find URL if present
      for (const t of payload.texts) {
        if (/https?:\/\//i.test(t)) {
          targetUrl = t;
        } else {
          rawText += (rawText ? ' ' : '') + t;
        }
      }
      if (!targetUrl && payload.texts.length > 0) {
        rawText = payload.texts.join(' ');
      }
    }

    if (payload.title && !rawText.includes(payload.title)) {
      rawText = payload.title + (rawText ? ` - ${rawText}` : '');
    }

    // Single or multiple image file shares
    let platform: LibraryItem['platform'] | undefined;
    if (payload.files && payload.files.length > 0) {
      const firstFile = payload.files[0];
      if (firstFile.mimeType.startsWith('image/')) {
        platform = 'image';
      }
    }

    try {
      const item = await queueWorker.enqueueDrop({
        rawText: rawText || undefined,
        url: targetUrl,
        platform,
      });

      // Display Sub-2-Second Confirmation HUD
      setOverlayItem(item);
    } catch (err) {
      console.error('[App] Failed to enqueue incoming share:', err);
    }
  }, []);

  // Subscribe to storage & native share target
  useEffect(() => {
    // 1. Subscribe to library items
    const unsubsItems = storage.subscribeItems((newItems) => {
      setItems(newItems);
    });

    // 2. Subscribe to user settings
    const unsubsSettings = storage.subscribeSettings((newSettings) => {
      setSettings(newSettings);
      setupStatusBar(newSettings.themeMode === 'true-black');
    });

    // 3. Register native / web share target listener with cold-start buffer
    const unsubsShare = coldStartBuffer.registerHandler(handleIncomingShare);

    // 4. Subscribe to queue worker active state
    const unsubsWorker = queueWorker.subscribe(() => {
      setIsWorkerActive(queueWorker.getIsProcessing());
    });

    // Initial load
    storage.getAllItems().then(setItems);
    storage.getSettings().then((s) => {
      setSettings(s);
      setupStatusBar(s.themeMode === 'true-black');
    });

    return () => {
      unsubsItems();
      unsubsSettings();
      unsubsShare();
      unsubsWorker();
    };
  }, [handleIncomingShare]);

  const isTrueBlack = settings?.themeMode === 'true-black';
  const pendingCount = items.filter((i) => i.status === 'pending').length;

  return (
    <div
      className={`min-h-screen min-h-[100dvh] transition-colors duration-200 ${
        isTrueBlack ? 'bg-black text-[#E2E2E2]' : 'bg-[#0A0A0A] text-[#E2E2E2]'
      }`}
    >
      {/* Top Sticky Header */}
      <header
        className={`sticky top-0 z-30 px-4 py-3 border-b border-white/[0.08] backdrop-blur-xl ${
          isTrueBlack ? 'bg-black/85' : 'bg-[#0A0A0A]/85'
        }`}
      >
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/[0.08] border border-white/[0.1] flex items-center justify-center text-white shadow-sm">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-tight text-white flex items-center space-x-1.5">
                <span>Drop Library</span>
                <span className="text-[10px] font-mono text-neutral-500 font-normal">v1.0</span>
              </h1>
              <p className="text-[10px] text-neutral-400">Zero-friction mobile vault</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Sync status indicator */}
            {(isWorkerActive || pendingCount > 0) && (
              <div
                onClick={() => queueWorker.processQueue()}
                className="px-2 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center space-x-1.5 cursor-pointer hover:bg-amber-500/20 transition-colors"
                title="Pending background sync"
              >
                <RotateCw className={`w-3 h-3 ${isWorkerActive ? 'animate-spin' : ''}`} />
                <span className="text-[11px] font-medium">{pendingCount}</span>
              </div>
            )}

            {/* Missing BYOK key alert pill */}
            {!settings?.geminiApiKey && (
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="hidden sm:flex items-center space-x-1 px-2.5 py-1 rounded-full bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-300 text-xs transition-colors"
              >
                <Sparkles className="w-3 h-3" />
                <span className="text-[11px]">Set API Key</span>
              </button>
            )}

            {/* Settings button */}
            <button
              onClick={() => {
                triggerHaptic('light');
                setIsSettingsOpen(true);
              }}
              className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-neutral-300 hover:text-white transition-colors"
              title="Settings"
            >
              <SettingsIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-4xl mx-auto px-4 py-4 space-y-4 pb-20">
        {/* Quick Drop Bar */}
        <QuickDropBar
          onItemDropped={(item) => {
            setOverlayItem(item);
          }}
        />

        {/* Search & Filters */}
        <FilterBar
          filter={filter}
          onChange={setFilter}
          totalCount={items.length}
        />

        {/* Library Items Grid */}
        {filteredItems.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-1">
            {filteredItems.map((item) => (
              <LibraryCard
                key={item.id}
                item={item}
                onClick={() => {
                  triggerHaptic('light');
                  setSelectedItem(item);
                }}
              />
            ))}
          </div>
        ) : (
          /* Empty State */
          <div className="py-16 text-center space-y-3 max-w-sm mx-auto">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-center mx-auto text-neutral-600">
              <Inbox className="w-6 h-6 stroke-[1.5]" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-medium text-neutral-300">
                {items.length === 0 ? 'Your library is empty' : 'No matching drops found'}
              </h3>
              <p className="text-xs text-neutral-500 leading-relaxed">
                {items.length === 0
                  ? 'Share an Instagram Reel, YouTube link, or article from your phone—or paste a link above.'
                  : 'Try clearing your search query or switching category filters.'}
              </p>
            </div>
          </div>
        )}
      </main>

      {/* Instant Sub-2-Second Capture HUD Overlay */}
      <SavedOverlay
        item={overlayItem}
        onDismiss={() => setOverlayItem(null)}
      />

      {/* Item Reader / Detail Drawer Modal */}
      <ItemDetailModal
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onDeleted={() => {
          setSelectedItem(null);
        }}
      />

      {/* Settings Modal (BYOK Gemini, Themes, Backups) */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        items={items}
      />
    </div>
  );
}
