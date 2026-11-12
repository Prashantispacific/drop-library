import React, { useState } from 'react';
import { queueWorker } from '../services/queueWorker';
import { triggerHaptic } from '../native/bridge';
import type { LibraryItem } from '../types/library';
import { Plus, Clipboard, X, Sparkles } from 'lucide-react';

interface QuickDropBarProps {
  onItemDropped: (item: LibraryItem) => void;
}

export const QuickDropBar: React.FC<QuickDropBarProps> = ({ onItemDropped }) => {
  const [inputVal, setInputVal] = useState('');
  const [quickNote, setQuickNote] = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleDrop = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = inputVal.trim();
    if (!text || isSubmitting) return;

    setIsSubmitting(true);
    triggerHaptic('light');

    try {
      const item = await queueWorker.enqueueDrop({
        rawText: text,
        quickNote: quickNote.trim() || undefined,
      });

      setInputVal('');
      setQuickNote('');
      setShowNoteInput(false);
      onItemDropped(item);
    } catch (err) {
      console.error('Drop error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasteClipboard = async () => {
    try {
      triggerHaptic('light');
      const text = await navigator.clipboard.readText();
      if (text) {
        setInputVal(text.trim());
      }
    } catch {
      // Clipboard permission denied or unavailable
    }
  };

  return (
    <div className="w-full bg-[#121212]/80 backdrop-blur-md border border-white/[0.08] rounded-2xl p-3 shadow-lg">
      <form onSubmit={handleDrop} className="space-y-2">
        <div className="relative flex items-center">
          <input
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder="Drop any link, Reel, YouTube, or note..."
            className="w-full bg-white/[0.04] border border-white/[0.08] focus:border-white/20 focus:outline-none rounded-xl px-3.5 py-2.5 text-sm text-[#E2E2E2] placeholder-neutral-500 pr-20 transition-colors"
          />

          <div className="absolute right-2 flex items-center space-x-1">
            {inputVal ? (
              <button
                type="button"
                onClick={() => setInputVal('')}
                className="p-1 rounded-md text-neutral-400 hover:text-white transition-colors"
                title="Clear"
              >
                <X className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePasteClipboard}
                className="px-2 py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.1] text-neutral-400 hover:text-neutral-200 text-xs flex items-center space-x-1 border border-white/[0.06] transition-colors"
                title="Paste from clipboard"
              >
                <Clipboard className="w-3.5 h-3.5" />
                <span className="hidden sm:inline text-[11px]">Paste</span>
              </button>
            )}

            <button
              type="submit"
              disabled={!inputVal.trim() || isSubmitting}
              className="p-1.5 rounded-lg bg-white text-black hover:bg-neutral-200 disabled:opacity-30 disabled:pointer-events-none transition-all duration-150"
              title="Save Item"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>
        </div>

        {/* Quick Note / Tag Row */}
        <div className="flex items-center justify-between text-xs px-1">
          {showNoteInput ? (
            <div className="flex items-center space-x-2 w-full">
              <input
                type="text"
                value={quickNote}
                onChange={(e) => setQuickNote(e.target.value)}
                placeholder="Optional tag (e.g. #toread, #code)..."
                className="flex-1 bg-white/[0.03] border border-white/[0.06] rounded-lg px-2.5 py-1 text-xs text-neutral-300 placeholder-neutral-600 focus:outline-none focus:border-white/20"
              />
              <button
                type="button"
                onClick={() => setShowNoteInput(false)}
                className="text-neutral-500 hover:text-neutral-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setShowNoteInput(true)}
                className="text-neutral-500 hover:text-neutral-300 flex items-center space-x-1 transition-colors"
              >
                <Sparkles className="w-3 h-3 text-amber-400/80" />
                <span>+ Add quick intent tag</span>
              </button>
            </div>
          )}

          <span className="text-[11px] text-neutral-600 select-none">
            Auto-syncs offline
          </span>
        </div>
      </form>
    </div>
  );
};
