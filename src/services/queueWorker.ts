import type { LibraryItem, PlatformType } from '../types/library';
import { storage } from './storage';
import { fetchUnfurl } from './unfurlClient';
import { enrichWithGemini, createFallbackMeta } from './gemini';
import { normalizeUrl, detectPlatform, extractUrlFromText } from '../utils/url';

class QueueWorker {
  private isProcessing = false;
  private intervalId: number | null = null;
  private queueChangeListeners: Set<() => void> = new Set();

  constructor() {
    this.initListeners();
  }

  private initListeners() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log('[QueueWorker] Network online detected. Processing queue...');
        this.processQueue();
      });

      // Periodic check every 20 seconds for pending items
      this.intervalId = window.setInterval(() => {
        if (navigator.onLine && !this.isProcessing) {
          this.processQueue();
        }
      }, 20000);
    }
  }

  public subscribe(listener: () => void): () => void {
    this.queueChangeListeners.add(listener);
    return () => this.queueChangeListeners.delete(listener);
  }

  private notify() {
    for (const l of this.queueChangeListeners) {
      try {
        l();
      } catch (err) {
        console.error('[QueueWorker] listener error:', err);
      }
    }
  }

  /**
   * Enqueue a new raw drop immediately to IndexedDB.
   * Guarantees sub-2-second capture: writes locally first before any network activity.
   */
  async enqueueDrop(input: {
    rawText?: string;
    url?: string;
    quickNote?: string;
    platform?: PlatformType;
    thumbnailUrl?: string;
    noteContent?: string;
    isMarkdown?: boolean;
  }): Promise<LibraryItem> {
    const rawText = input.rawText?.trim() || '';
    let targetUrl = input.url?.trim() || '';

    // If no explicit URL, attempt extraction from raw text
    if (!targetUrl && rawText) {
      const extracted = extractUrlFromText(rawText);
      if (extracted.url) {
        targetUrl = extracted.url;
      }
    }

    const canonicalUrl = targetUrl ? normalizeUrl(targetUrl) : undefined;
    const platform =
      input.platform ||
      detectPlatform({
        url: canonicalUrl,
        rawText,
      });

    const isMd =
      input.isMarkdown ??
      (platform === 'text' &&
        Boolean(
          rawText.startsWith('#') ||
            rawText.includes('\n#') ||
            rawText.includes('```') ||
            rawText.includes('- ') ||
            rawText.includes('**')
        ));

    const newItem: LibraryItem = {
      id: crypto.randomUUID(),
      schemaVersion: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'pending',
      retryCount: 0,
      url: canonicalUrl,
      platform,
      rawShareText: rawText || undefined,
      quickNote: input.quickNote?.trim() || undefined,
      thumbnailUrl: input.thumbnailUrl,
      noteContent: input.noteContent || (platform === 'text' ? rawText : undefined),
      isMarkdown: isMd,
    };

    // 1. Immediately persist offline to IndexedDB
    await storage.saveItem(newItem);
    this.notify();

    // 2. Trigger asynchronous background processing (non-blocking)
    setTimeout(() => {
      this.processQueue();
    }, 100);

    return newItem;
  }

  /**
   * Process all pending items in the queue with exponential backoff.
   */
  async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      console.log('[QueueWorker] Offline. Skipping queue processing.');
      return;
    }

    this.isProcessing = true;
    this.notify();

    try {
      const pendingItems = await storage.getPendingItems();

      for (const item of pendingItems) {
        try {
          await this.processSingleItem(item);
        } catch (itemErr) {
          console.error(`[QueueWorker] Failed to process item ${item.id}:`, itemErr);
          const newRetryCount = item.retryCount + 1;
          const errorMessage =
            itemErr instanceof Error ? itemErr.message : 'Unknown processing error';

          await storage.updateItem(item.id, {
            status: newRetryCount >= 3 ? 'failed' : 'pending',
            retryCount: newRetryCount,
            errorMessage,
          });
        }
      }
    } finally {
      this.isProcessing = false;
      this.notify();
    }
  }

  /**
   * Processes a single item:
   * 1. Status -> 'unfurling'
   * 2. Calls Unfurler if item has a URL
   * 3. Calls Gemini for AI Structuring
   * 4. Validates and saves as 'enriched'
   */
  async processSingleItem(item: LibraryItem): Promise<void> {
    await storage.updateItem(item.id, {
      status: 'unfurling',
      errorMessage: undefined,
    });

    let unfurlData: Partial<Awaited<ReturnType<typeof fetchUnfurl>>> | undefined;

    // 1. Unfurl metadata if item contains a URL
    if (item.url) {
      try {
        const result = await fetchUnfurl(item.url);
        if (result.success) {
          unfurlData = result;
          if (result.thumbnailUrl && !item.thumbnailUrl) {
            item.thumbnailUrl = result.thumbnailUrl;
          }
        }
      } catch (unfurlErr) {
        console.warn(`[QueueWorker] Unfurl error for ${item.url}:`, unfurlErr);
      }
    }

    // 2. AI structuring (Gemini or Custom Provider)
    const settings = await storage.getSettings();
    let meta = item.meta;

    const hasAiConfigured = Boolean(
      settings.geminiApiKey?.trim() || settings.customApiUrl?.trim()
    );

    if (hasAiConfigured && settings.autoEnrich) {
      try {
        meta = await enrichWithGemini({
          platform: item.platform,
          url: item.url,
          rawShareText: item.noteContent || item.rawShareText,
          quickNote: item.quickNote,
          thumbnailUrl: item.thumbnailUrl,
          unfurlData,
        });
      } catch (geminiErr) {
        console.warn(`[QueueWorker] Gemini enrichment error:`, geminiErr);
        // If Gemini error is quota or missing key, use fallback meta so user isn't stuck
        meta = createFallbackMeta({
          platform: item.platform,
          url: item.url,
          rawShareText: item.noteContent || item.rawShareText,
          quickNote: item.quickNote,
          thumbnailUrl: item.thumbnailUrl,
          unfurlData,
        });
      }
    } else {
      // Heuristic fallback metadata if no Gemini key configured
      meta = createFallbackMeta({
        platform: item.platform,
        url: item.url,
        rawShareText: item.noteContent || item.rawShareText,
        quickNote: item.quickNote,
        thumbnailUrl: item.thumbnailUrl,
        unfurlData,
      });
    }

    // 3. Mark as enriched and save
    await storage.updateItem(item.id, {
      status: 'enriched',
      thumbnailUrl: item.thumbnailUrl || unfurlData?.thumbnailUrl,
      meta,
      errorMessage: undefined,
    });
  }

  /**
   * Manually trigger re-enrichment of a failed or existing item.
   */
  async retryItem(id: string): Promise<void> {
    const item = await storage.getItemById(id);
    if (!item) return;

    await storage.updateItem(id, {
      status: 'pending',
      retryCount: 0,
      errorMessage: undefined,
    });

    this.processQueue();
  }

  public getIsProcessing(): boolean {
    return this.isProcessing;
  }
}

export const queueWorker = new QueueWorker();
