import React, { useState, useRef } from 'react';
import { queueWorker } from '../services/queueWorker';
import { triggerHaptic } from '../native/bridge';
import type { LibraryItem } from '../types/library';
import { fileToDataUrl, fileToText } from '../utils/file';
import {
  Plus,
  Clipboard,
  X,
  Sparkles,
  Image as ImageIcon,
  FileCode,
  FileText,
  Maximize2,
  Minimize2,
} from 'lucide-react';

interface QuickDropBarProps {
  onItemDropped: (item: LibraryItem) => void;
}

const PRESET_INTENT_CHIPS = [
  '#toread',
  '#inspo',
  '#tool',
  '#code',
  '#quote',
  '#project',
];

export const QuickDropBar: React.FC<QuickDropBarProps> = ({ onItemDropped }) => {
  const [inputVal, setInputVal] = useState('');
  const [quickNote, setQuickNote] = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMultiLine, setIsMultiLine] = useState(false);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = inputVal.trim();
    if (!text && !attachedImage) return;
    if (isSubmitting) return;

    setIsSubmitting(true);
    triggerHaptic('light');

    try {
      const isMd =
        text.startsWith('#') ||
        text.includes('\n#') ||
        text.includes('```') ||
        text.includes('- ') ||
        text.includes('**');

      const item = await queueWorker.enqueueDrop({
        rawText: text || undefined,
        quickNote: quickNote.trim() || undefined,
        thumbnailUrl: attachedImage || undefined,
        platform: attachedImage && !text ? 'image' : undefined,
        noteContent: text && !/https?:\/\//i.test(text) ? text : undefined,
        isMarkdown: isMd,
      });

      setInputVal('');
      setQuickNote('');
      setShowNoteInput(false);
      setAttachedImage(null);
      setIsMultiLine(false);
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
        const trimmed = text.trim();
        setInputVal(trimmed);
        if (trimmed.includes('\n')) {
          setIsMultiLine(true);
        }
      }
    } catch {
      // Clipboard permission denied or unavailable
    }
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    triggerHaptic('light');
    try {
      const dataUrl = await fileToDataUrl(file);
      setAttachedImage(dataUrl);
    } catch (err) {
      console.error('Failed to read image file:', err);
    } finally {
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    triggerHaptic('light');
    try {
      const text = await fileToText(file);
      setInputVal(text);
      setIsMultiLine(true);
    } catch (err) {
      console.error('Failed to read text/markdown file:', err);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleToggleChip = (chip: string) => {
    triggerHaptic('light');
    if (quickNote === chip) {
      setQuickNote('');
    } else {
      setQuickNote(chip);
    }
  };

  return (
    <div className="w-full bg-[#121212]/95 backdrop-blur-md border border-white/[0.1] rounded-2xl p-3 shadow-xl space-y-2.5">
      {/* Hidden file inputs for image attachment & Markdown/Text file upload */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageSelect}
        className="hidden"
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".md,.markdown,.txt,text/plain,text/markdown"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Image Preview thumbnail if image is attached */}
      {attachedImage && (
        <div className="relative inline-block rounded-xl overflow-hidden border border-white/20 shadow-md">
          <img
            src={attachedImage}
            alt="Attached"
            className="w-20 h-20 object-cover rounded-xl"
          />
          <button
            type="button"
            onClick={() => setAttachedImage(null)}
            className="absolute top-1 right-1 p-1 rounded-full bg-black/70 text-white hover:bg-black transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <form onSubmit={handleDrop} className="space-y-2">
        <div className="relative flex items-center">
          {isMultiLine ? (
            <textarea
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              rows={4}
              autoComplete="on"
              autoCorrect="on"
              spellCheck={true}
              autoCapitalize="sentences"
              placeholder="Type or paste text note, markdown, thoughts, or quote..."
              className="w-full bg-white/[0.04] border border-white/[0.1] focus:border-white/30 focus:outline-none rounded-xl p-3 text-sm text-[#E2E2E2] placeholder-neutral-500 font-sans leading-relaxed resize-y transition-colors"
            />
          ) : (
            <input
              type="text"
              value={inputVal}
              onChange={(e) => {
                const val = e.target.value;
                setInputVal(val);
                if (val.includes('\n')) setIsMultiLine(true);
              }}
              autoComplete="on"
              autoCorrect="on"
              spellCheck={true}
              autoCapitalize="sentences"
              placeholder="Drop any link, Reel, YouTube, or note..."
              className="w-full bg-white/[0.04] border border-white/[0.1] focus:border-white/30 focus:outline-none rounded-xl px-3.5 py-2.5 text-sm text-[#E2E2E2] placeholder-neutral-500 pr-24 transition-colors"
            />
          )}

          <div
            className={`absolute right-2 flex items-center space-x-1 ${
              isMultiLine ? 'bottom-2' : ''
            }`}
          >
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
                className="px-2 py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-neutral-300 hover:text-white text-xs flex items-center space-x-1 border border-white/[0.08] transition-colors"
                title="Paste from clipboard"
              >
                <Clipboard className="w-3.5 h-3.5" />
                <span className="text-[11px] font-medium">Paste</span>
              </button>
            )}

            <button
              type="submit"
              disabled={(!inputVal.trim() && !attachedImage) || isSubmitting}
              className="p-1.5 rounded-lg bg-white text-black hover:bg-neutral-200 disabled:opacity-30 disabled:pointer-events-none transition-all duration-150"
              title="Save Item"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>
        </div>

        {/* Action Toolbar: Multi-line Note toggle, Image Picker, Markdown File Upload */}
        <div className="flex items-center justify-between text-xs px-1 pt-0.5">
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setIsMultiLine(!isMultiLine);
              }}
              className={`p-1 rounded-md transition-colors flex items-center space-x-1 text-[11px] ${
                isMultiLine
                  ? 'bg-white/15 text-white border border-white/20'
                  : 'text-neutral-400 hover:text-white'
              }`}
              title={isMultiLine ? 'Single line mode' : 'Big text / Note editor mode'}
            >
              {isMultiLine ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              <span>{isMultiLine ? 'Compact' : 'Note'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                imageInputRef.current?.click();
              }}
              className="p-1 rounded-md text-neutral-400 hover:text-emerald-300 transition-colors flex items-center space-x-1 text-[11px]"
              title="Add Image or Screenshot"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Image</span>
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                fileInputRef.current?.click();
              }}
              className="p-1 rounded-md text-neutral-400 hover:text-blue-300 transition-colors flex items-center space-x-1 text-[11px]"
              title="Upload .md or .txt note"
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>.md</span>
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setShowNoteInput(!showNoteInput);
              }}
              className={`flex items-center space-x-1 text-[11px] transition-colors p-1 rounded-md ${
                showNoteInput || quickNote
                  ? 'text-amber-300 bg-amber-500/10 border border-amber-500/20'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>{quickNote || '+ Intent tag'}</span>
            </button>
          </div>

          <span className="text-[10px] text-neutral-500 select-none hidden sm:inline">
            Auto-syncs offline
          </span>
        </div>

        {/* 1-Tap Intent Chip Presets & Custom Tag Input */}
        {showNoteInput && (
          <div className="pt-2 border-t border-white/[0.06] space-y-2 animate-in fade-in duration-150">
            <div className="flex flex-wrap gap-1.5 items-center">
              {PRESET_INTENT_CHIPS.map((chip) => {
                const isSelected = quickNote === chip;
                return (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => handleToggleChip(chip)}
                    className={`text-[11px] px-2.5 py-0.5 rounded-full transition-all duration-150 ${
                      isSelected
                        ? 'bg-amber-400 text-black font-semibold shadow-sm'
                        : 'bg-white/[0.05] hover:bg-white/[0.1] text-neutral-300 border border-white/[0.08]'
                    }`}
                  >
                    {chip}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={quickNote}
                onChange={(e) => setQuickNote(e.target.value)}
                autoComplete="on"
                autoCorrect="on"
                spellCheck={true}
                placeholder="Or type custom tag (e.g. #design, #thesis)..."
                className="flex-1 bg-white/[0.03] border border-white/[0.08] rounded-lg px-2.5 py-1 text-xs text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-white/20"
              />
              {quickNote && (
                <button
                  type="button"
                  onClick={() => setQuickNote('')}
                  className="p-1 rounded text-neutral-500 hover:text-white"
                  title="Clear tag"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}
      </form>
    </div>
  );
};
