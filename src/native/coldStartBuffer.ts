import { Capacitor } from '@capacitor/core';
import { CapacitorShareTarget } from '@capgo/capacitor-share-target';

export interface IncomingSharePayload {
  title?: string;
  texts?: string[];
  files?: Array<{
    name: string;
    uri: string;
    mimeType: string;
  }>;
}

type ShareHandler = (payload: IncomingSharePayload) => void;

class ColdStartShareBuffer {
  private bufferedShares: IncomingSharePayload[] = [];
  private activeHandler: ShareHandler | null = null;
  private initialized = false;

  /**
   * Initializes early at app boot (in main.tsx before React mounts).
   */
  public init() {
    if (this.initialized) return;
    this.initialized = true;

    // 1. Android / iOS Native Share Target Listener
    if (Capacitor.isNativePlatform()) {
      try {
        CapacitorShareTarget.addListener('shareReceived', (event) => {
          console.log('[ColdStartBuffer] Native shareReceived:', event);
          this.handleIncoming(event);
        });
      } catch (err) {
        console.error('[ColdStartBuffer] Failed to attach native shareReceived listener:', err);
      }
    }

    // 2. Web Share Target PWA query param listener
    if (typeof window !== 'undefined') {
      this.checkWebShareTargetQuery();
    }
  }

  private checkWebShareTargetQuery() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const title = urlParams.get('title') || undefined;
      const text = urlParams.get('text') || undefined;
      const url = urlParams.get('url') || undefined;

      const texts: string[] = [];
      if (url) texts.push(url);
      if (text && text !== url) texts.push(text);

      if (title || texts.length > 0) {
        // Clean URL to prevent re-processing on page reload
        window.history.replaceState({}, document.title, window.location.pathname);
        this.handleIncoming({ title, texts });
      }
    } catch (e) {
      console.warn('[ColdStartBuffer] Web share target parse error:', e);
    }
  }

  private handleIncoming(payload: IncomingSharePayload) {
    if (this.activeHandler) {
      this.activeHandler(payload);
    } else {
      console.log('[ColdStartBuffer] Buffering share event until React listener mounts');
      this.bufferedShares.push(payload);
    }
  }

  /**
   * Called by React capture controller to receive buffered and future shares.
   */
  public registerHandler(handler: ShareHandler): () => void {
    this.activeHandler = handler;

    // Flush any buffered shares captured during cold start
    if (this.bufferedShares.length > 0) {
      console.log(`[ColdStartBuffer] Flushing ${this.bufferedShares.length} buffered shares`);
      const queued = [...this.bufferedShares];
      this.bufferedShares = [];
      for (const share of queued) {
        handler(share);
      }
    }

    return () => {
      if (this.activeHandler === handler) {
        this.activeHandler = null;
      }
    };
  }
}

export const coldStartBuffer = new ColdStartShareBuffer();
