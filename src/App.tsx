import { useEffect, useState, useMemo, useCallback } from 'react';
import type { LibraryItem, FilterState, UserSettings } from './types/library';
import { storage } from './services/storage';
import { queueWorker } from './services/queueWorker';
import { SearchEngine } from './services/search';
import { coldStartBuffer, type IncomingSharePayload } from './native/coldStartBuffer';
import { setupStatusBar, triggerHaptic, returnToPreviousApp, openExternalUrl } from './native/bridge';
import {
  readSharedFileAsBase64,
  readSharedFileAsBuffer,
  extractTextFromPdfBuffer,
} from './utils/file';
import { cleanExtractedText } from './utils/textDistiller';

import { QuickDropBar } from './components/QuickDropBar';
import { FilterBar } from './components/FilterBar';
import { LibraryCard } from './components/LibraryCard';
import { SavedOverlay } from './components/SavedOverlay';
import { ItemDetailModal } from './components/ItemDetailModal';
import { SettingsModal } from './components/SettingsModal';
import { LegalModal, type LegalTab } from './components/LegalModal';

import {
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

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [overlayItem, setOverlayItem] = useState<LibraryItem | null>(null);
  const [isFromShareSheet, setIsFromShareSheet] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [legalModalTab, setLegalModalTab] = useState<LegalTab | null>(null);
  const [isWorkerActive, setIsWorkerActive] = useState(false);

  // Derive live selectedItem from items so background enrichment & edits update immediately
  const selectedItem = useMemo(
    () => (selectedItemId ? items.find((i) => i.id === selectedItemId) ?? null : null),
    [items, selectedItemId]
  );

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

    // Single or multiple file shares (images, PDFs, text/markdown documents)
    let platform: LibraryItem['platform'] | undefined;
    let thumbnailUrl: string | undefined;
    let noteContent: string | undefined;
    let fileMeta: LibraryItem['fileMeta'] | undefined;

    if (payload.files && payload.files.length > 0) {
      const firstFile = payload.files[0];
      const mime = (firstFile.mimeType || '').toLowerCase();
      const lowerName = (firstFile.name || '').toLowerCase();

      if (mime.startsWith('image/')) {
        platform = 'image';
        try {
          thumbnailUrl = await readSharedFileAsBase64(firstFile.uri, firstFile.mimeType);
        } catch (e) {
          console.warn('[App] Failed to read shared image file:', e);
        }
      } else if (mime === 'application/pdf' || lowerName.endsWith('.pdf')) {
        platform = 'text';
        try {
          const buffer = await readSharedFileAsBuffer(firstFile.uri);
          if (buffer) {
            const { text, pageCount } = await extractTextFromPdfBuffer(buffer);
            noteContent = text || `[PDF "${firstFile.name}" (${pageCount} pages) contains no selectable text]`;
            const wordCount = noteContent.split(/\s+/).filter(Boolean).length;
            fileMeta = {
              fileName: firstFile.name || 'shared.pdf',
              mimeType: 'application/pdf',
              fileSize: buffer.byteLength,
              pageCount,
              wordCount,
            };
            if (!rawText) rawText = firstFile.name || 'Shared PDF';
          }
        } catch (e) {
          console.warn('[App] Failed to parse shared PDF:', e);
        }
      } else if (mime.startsWith('text/') || /\.(md|txt|json|csv|log)$/i.test(lowerName)) {
        platform = 'text';
        try {
          const buffer = await readSharedFileAsBuffer(firstFile.uri);
          if (buffer) {
            const decoded = cleanExtractedText(new TextDecoder().decode(buffer));
            noteContent = decoded;
            const wordCount = decoded ? decoded.split(/\s+/).filter(Boolean).length : 0;
            fileMeta = {
              fileName: firstFile.name || 'shared.txt',
              mimeType: firstFile.mimeType || 'text/plain',
              fileSize: buffer.byteLength,
              wordCount,
            };
            if (!rawText) rawText = firstFile.name || 'Shared Document';
          }
        } catch (e) {
          console.warn('[App] Failed to read shared text file:', e);
        }
      }
    }

    try {
      const item = await queueWorker.enqueueDrop({
        rawText: rawText || undefined,
        url: targetUrl,
        platform,
        thumbnailUrl,
        noteContent,
        fileMeta,
      });

      const currentSettings = await storage.getSettings();
      const autoReturn = currentSettings.autoReturnAfterShare ?? true;
      const delaySec = currentSettings.returnDelaySeconds ?? 0;

      // If user configured instant return (0s delay), minimize immediately
      if (autoReturn && delaySec === 0) {
        console.log('[App] Zero delay return: returning immediately to source app');
        returnToPreviousApp('Saved to Drop Library ✓');
        return;
      }

      setIsFromShareSheet(true);
      // Display minimal confirmation HUD
      setOverlayItem(item);
    } catch (err) {
      console.error('[App] Failed to enqueue incoming share:', err);
    }
  }, []);

  const handleDismissOverlay = useCallback(() => {
    setOverlayItem(null);
    setIsFromShareSheet(false);
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
        className={`sticky top-0 z-30 px-4 border-b border-white/[0.08] backdrop-blur-xl ${
          isTrueBlack ? 'bg-black/85' : 'bg-[#0A0A0A]/85'
        }`}
        style={{
          paddingTop: 'calc(max(env(safe-area-inset-top, 0px), var(--status-bar-height, 0px)) + 0.75rem)',
          paddingBottom: '0.75rem',
        }}
      >
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <img
              src="/icon.svg"
              alt="Drop Library"
              className="w-8 h-8 rounded-xl border border-white/[0.12] shadow-sm"
            />
            <h1 className="text-base font-semibold tracking-tight text-white">
              Drop Library
            </h1>
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
      <main
        className="max-w-4xl mx-auto px-4 py-4 space-y-4"
        style={{
          paddingBottom: 'calc(max(env(safe-area-inset-bottom, 0px), 0px) + 5rem)',
        }}
      >
        {/* Quick Drop Bar */}
        <QuickDropBar
          onItemDropped={(item) => {
            setIsFromShareSheet(false);
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
                  setSelectedItemId(item.id);
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

      {/* Subtle Production Footer */}
      <footer className="max-w-4xl mx-auto px-4 pb-8 pt-2 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-2 text-[11px] text-neutral-500">
        <span>Made by Prashant</span>
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={() => setLegalModalTab('privacy')}
            className="hover:text-neutral-300 transition-colors"
          >
            Privacy
          </button>
          <span className="text-neutral-700">·</span>
          <button
            type="button"
            onClick={() => setLegalModalTab('terms')}
            className="hover:text-neutral-300 transition-colors"
          >
            Terms
          </button>
          <span className="text-neutral-700">·</span>
          <button
            type="button"
            onClick={() => openExternalUrl('https://github.com/Prashantispacific/drop-library')}
            className="hover:text-neutral-300 transition-colors"
          >
            Open Source
          </button>
        </div>
      </footer>

      {/* Instant Sub-2-Second Capture HUD Overlay */}
      <SavedOverlay
        item={overlayItem}
        onDismiss={handleDismissOverlay}
        isFromShareSheet={isFromShareSheet}
        autoReturn={settings?.autoReturnAfterShare ?? true}
        returnDelaySeconds={settings?.returnDelaySeconds ?? 0}
      />

      {/* Item Reader / Detail Drawer Modal */}
      <ItemDetailModal
        item={selectedItem}
        onClose={() => setSelectedItemId(null)}
        onDeleted={() => {
          setSelectedItemId(null);
        }}
      />

      {/* Settings Modal (BYOK Gemini, Themes, Backups) */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        items={items}
      />

      {/* Privacy & Terms Modal */}
      <LegalModal
        isOpen={legalModalTab !== null}
        activeTab={legalModalTab || 'privacy'}
        onTabChange={setLegalModalTab}
        onClose={() => setLegalModalTab(null)}
      />
    </div>
  );
}
