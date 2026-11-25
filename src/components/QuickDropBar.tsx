import React, { useState, useRef, useEffect } from 'react';
import { queueWorker } from '../services/queueWorker';
import { triggerHaptic } from '../native/bridge';
import type { FileMeta, LibraryItem } from '../types/library';
import {
  fileToDataUrl,
  compressImageDataUrl,
  readFileWithMetadata,
  formatFileSize,
} from '../utils/file';
import {
  Plus,
  X,
  Sparkles,
  Image as ImageIcon,
  FileText,
  Loader2,
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

interface AttachedDocument {
  text: string;
  fileMeta: FileMeta;
  isMarkdown: boolean;
}

export const QuickDropBar: React.FC<QuickDropBarProps> = ({ onItemDropped }) => {
  const [inputVal, setInputVal] = useState('');
  const [quickNote, setQuickNote] = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [attachedDoc, setAttachedDoc] = useState<AttachedDocument | null>(null);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize unified textarea without unmounting (prevents Android IME/cursor corruption)
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const nextHeight = Math.min(200, Math.max(44, el.scrollHeight));
    el.style.height = `${nextHeight}px`;
  }, [inputVal]);

  const handleDrop = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = inputVal.trim();
    if (!text && !attachedImage && !attachedDoc) return;
    if (isSubmitting || isReadingFile) return;

    setIsSubmitting(true);
    triggerHaptic('light');

    try {
      const isMd =
        attachedDoc?.isMarkdown ||
        text.startsWith('#') ||
        text.includes('\n#') ||
        text.includes('```') ||
        text.includes('- ') ||
        text.includes('**');

      const hasUrl = /https?:\/\//i.test(text);
      const rawText = attachedDoc
        ? text || attachedDoc.fileMeta.fileName
        : text || undefined;
      const noteContent = attachedDoc
        ? attachedDoc.text
        : text && !hasUrl
        ? text
        : undefined;

      const item = await queueWorker.enqueueDrop({
        rawText,
        quickNote: quickNote.trim() || undefined,
        thumbnailUrl: attachedImage || undefined,
        platform: attachedImage && !text && !attachedDoc ? 'image' : attachedDoc ? 'text' : undefined,
        noteContent,
        isMarkdown: isMd,
        fileMeta: attachedDoc?.fileMeta,
      });

      setInputVal('');
      setQuickNote('');
      setShowNoteInput(false);
      setAttachedImage(null);
      setAttachedDoc(null);
      setFileError(null);
      onItemDropped(item);
    } catch (err) {
      console.error('Drop error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Enter when single-line (Shift+Enter inserts newline)
    if (e.key === 'Enter' && !e.shiftKey && !inputVal.includes('\n')) {
      e.preventDefault();
      handleDrop();
    }
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    triggerHaptic('light');
    setFileError(null);
    setIsReadingFile(true);
    try {
      const rawDataUrl = await fileToDataUrl(file);
      const compressed = await compressImageDataUrl(rawDataUrl, 1280, 0.82);
      setAttachedImage(compressed);
    } catch (err) {
      console.error('Failed to read image file:', err);
      setFileError('Could not load image file.');
    } finally {
      setIsReadingFile(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    triggerHaptic('light');
    setFileError(null);
    setIsReadingFile(true);
    try {
      const parsed = await readFileWithMetadata(file);
      setAttachedDoc({
        text: parsed.text,
        isMarkdown: parsed.isMarkdown,
        fileMeta: {
          fileName: parsed.fileName,
          mimeType: parsed.mimeType,
          fileSize: parsed.fileSize,
          pageCount: parsed.pageCount,
          wordCount: parsed.wordCount,
        },
      });
    } catch (err) {
      console.error('Failed to read document file:', err);
      setFileError(
        err instanceof Error ? `File error: ${err.message}` : 'Failed to parse document.'
      );
    } finally {
      setIsReadingFile(false);
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

  const canSubmit = Boolean(inputVal.trim() || attachedImage || attachedDoc) && !isSubmitting && !isReadingFile;

  return (
    <div className="w-full bg-[#121212]/95 backdrop-blur-md border border-white/[0.1] rounded-2xl p-3 shadow-xl space-y-2.5">
      {/* Hidden file inputs for image & multi-extension documents (PDF, MD, TXT, JSON, CSV, Code) */}
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
        accept=".pdf,.md,.markdown,.txt,.csv,.json,.html,.xml,.yaml,.yml,.log,.ts,.tsx,.js,.jsx,.py,application/pdf,text/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Image Preview thumbnail if image is attached */}
      {attachedImage && (
        <div className="relative inline-block rounded-xl overflow-hidden border border-white/20 shadow-md mr-2">
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

      {/* Attached Document Chip (PDF, Markdown, TXT, JSON, etc.) */}
      {attachedDoc && (
        <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-blue-500/10 border border-blue-500/25 text-xs">
          <div className="flex items-center space-x-2 min-w-0">
            <FileText className="w-4 h-4 text-blue-400 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-neutral-200 font-medium truncate">
                {attachedDoc.fileMeta.fileName}
              </p>
              <p className="text-[10px] text-neutral-400">
                {formatFileSize(attachedDoc.fileMeta.fileSize)}
                {attachedDoc.fileMeta.pageCount
                  ? ` · ${attachedDoc.fileMeta.pageCount} pages`
                  : ''}
                {attachedDoc.fileMeta.wordCount
                  ? ` · ${attachedDoc.fileMeta.wordCount.toLocaleString()} words (distilled for AI)`
                  : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setAttachedDoc(null)}
            className="p-1 rounded-md text-neutral-400 hover:text-white ml-2 flex-shrink-0"
            title="Remove file"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {fileError && (
        <div className="text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg px-2.5 py-1.5 flex items-center justify-between">
          <span>{fileError}</span>
          <button type="button" onClick={() => setFileError(null)} className="text-rose-200 ml-2">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      <form onSubmit={handleDrop} className="space-y-2">
        <div className="relative flex items-center">
          {/* Unified auto-growing textarea prevents focus/IME corruption when switching line modes */}
          <textarea
            ref={textareaRef}
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={
              attachedDoc
                ? 'Optional note about this file...'
                : 'Drop a link, PDF, or note...'
            }
            className="w-full bg-white/[0.04] border border-white/[0.08] focus:border-white/25 focus:outline-none rounded-xl pl-3.5 pr-16 py-2.5 text-base sm:text-sm text-[#E2E2E2] placeholder-neutral-500 font-sans leading-relaxed resize-none overflow-y-auto transition-colors"
          />

          <div className="absolute right-2 flex items-center space-x-1">
            {inputVal && (
              <button
                type="button"
                onClick={() => setInputVal('')}
                className="p-1 rounded-md text-neutral-400 hover:text-white transition-colors"
                title="Clear"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="p-1.5 rounded-lg bg-white text-black hover:bg-neutral-200 disabled:opacity-30 disabled:pointer-events-none transition-all duration-150"
              title="Save Item"
            >
              {isReadingFile ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 stroke-[2.5]" />
              )}
            </button>
          </div>
        </div>

        {/* Quiet Action Toolbar: Image, PDF / File, Intent Tag */}
        <div className="flex items-center space-x-1.5 text-xs px-0.5">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              imageInputRef.current?.click();
            }}
            className="px-2.5 py-1.5 rounded-lg text-neutral-400 hover:text-emerald-300 hover:bg-white/[0.04] transition-colors flex items-center space-x-1.5 text-xs"
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
            className="px-2.5 py-1.5 rounded-lg text-neutral-400 hover:text-blue-300 hover:bg-white/[0.04] transition-colors flex items-center space-x-1.5 text-xs"
            title="Upload PDF, Markdown, TXT, JSON, CSV, or Code file"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>PDF / File</span>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setShowNoteInput(!showNoteInput);
            }}
            className={`flex items-center space-x-1.5 text-xs transition-colors px-2.5 py-1.5 rounded-lg ${
              showNoteInput || quickNote
                ? 'text-amber-300 bg-amber-500/10'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.04]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>{quickNote || 'Tag'}</span>
          </button>
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
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
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
