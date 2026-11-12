import React, { useEffect, useState } from 'react';
import type { LibraryItem } from '../types/library';
import { ImageWithFallback } from './ImageWithFallback';
import { ConfirmModal } from './ConfirmModal';
import { MarkdownViewer } from './MarkdownViewer';
import { openExternalUrl, registerBackButtonHandler, triggerHaptic } from '../native/bridge';
import { queueWorker } from '../services/queueWorker';
import { storage } from '../services/storage';
import {
  X,
  ExternalLink,
  Copy,
  Trash2,
  RotateCw,
  Clock,
  User,
  Tag,
  Search,
  Check,
  Sparkles,
  Maximize2,
} from 'lucide-react';

interface ItemDetailModalProps {
  item: LibraryItem | null;
  onClose: () => void;
  onDeleted: (id: string) => void;
}

const PRESET_INTENT_CHIPS = [
  '#toread',
  '#inspo',
  '#tool',
  '#code',
  '#quote',
  '#project',
];

export const ItemDetailModal: React.FC<ItemDetailModalProps> = ({
  item,
  onClose,
  onDeleted,
}) => {
  const [copied, setCopied] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isFullscreenImage, setIsFullscreenImage] = useState(false);
  const [isEditingTag, setIsEditingTag] = useState(false);

  // Register hardware back-button listener to close modal or full-screen view before exiting app
  useEffect(() => {
    if (!item) return;
    const unregister = registerBackButtonHandler(() => {
      if (isFullscreenImage) {
        setIsFullscreenImage(false);
        return true;
      }
      if (showDeleteConfirm) {
        setShowDeleteConfirm(false);
        return true;
      }
      onClose();
      return true; // back handled
    });
    return unregister;
  }, [item, isFullscreenImage, showDeleteConfirm, onClose]);

  if (!item) return null;

  const meta = item.meta;
  const title = meta?.title || item.rawShareText || item.url || 'Untitled Drop';
  const tldr = meta?.tldr || 'No summary available yet';
  const isTextOrNote = item.platform === 'text' || Boolean(item.noteContent);

  const handleCopyLink = async () => {
    const textToCopy = item.url || item.noteContent || item.rawShareText || '';
    if (!textToCopy) return;
    triggerHaptic('light');
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  const handleOpenBrowser = () => {
    if (item.url) {
      triggerHaptic('light');
      openExternalUrl(item.url);
    }
  };

  const handleReEnrich = async () => {
    setIsEnriching(true);
    triggerHaptic('light');
    try {
      await queueWorker.retryItem(item.id);
    } finally {
      setTimeout(() => setIsEnriching(false), 600);
    }
  };

  const handleConfirmDelete = async () => {
    await storage.deleteItem(item.id);
    setShowDeleteConfirm(false);
    onDeleted(item.id);
    onClose();
  };

  const handleSaveNote = async (newContent: string) => {
    await storage.updateItem(item.id, {
      noteContent: newContent,
      rawShareText: newContent,
    });
  };

  const handleToggleIntentChip = async (chip: string) => {
    triggerHaptic('light');
    const newTag = item.quickNote === chip ? undefined : chip;
    await storage.updateItem(item.id, { quickNote: newTag });
  };

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md transition-opacity duration-200"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full sm:max-w-xl max-h-[92vh] overflow-y-auto no-scrollbar rounded-t-3xl sm:rounded-2xl bg-[#121212] border border-white/[0.1] shadow-2xl text-[#E2E2E2] flex flex-col"
        >
          {/* Cover Media Header */}
          {(item.thumbnailUrl || item.platform === 'instagram' || item.platform === 'youtube' || item.platform === 'image') && (
            <div className="relative bg-black/60 border-b border-white/[0.08]">
              <ImageWithFallback
                src={item.thumbnailUrl}
                alt={title}
                platform={item.platform}
                aspectRatio={item.platform === 'image' ? 'square' : 'wide'}
                className="max-h-72 w-full object-contain bg-black/90"
              />

              {item.thumbnailUrl && (
                <button
                  type="button"
                  onClick={() => setIsFullscreenImage(true)}
                  className="absolute bottom-3 right-3 p-1.5 rounded-lg bg-black/70 hover:bg-black/90 backdrop-blur-md border border-white/15 text-white transition-colors"
                  title="View Fullscreen"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              )}

              <button
                onClick={onClose}
                className="absolute top-3 right-3 p-1.5 rounded-full bg-black/70 hover:bg-black/90 backdrop-blur-md border border-white/15 text-white transition-colors shadow-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Modal Content */}
          <div className="p-5 space-y-4">
            {!item.thumbnailUrl && item.platform !== 'instagram' && item.platform !== 'youtube' && item.platform !== 'image' && (
              <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
                <span className="text-xs uppercase tracking-wider text-neutral-400 font-semibold">
                  {item.platform === 'text' ? 'Note / Markdown' : item.platform}
                </span>
                <button
                  onClick={onClose}
                  className="p-1 rounded-lg hover:bg-white/[0.08] text-neutral-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Title & Author / Platform info */}
            <div>
              <div className="flex items-center space-x-2 mb-2">
                {meta?.category && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-semibold bg-white/[0.08] border border-white/[0.12] text-white">
                    {meta.category}
                  </span>
                )}
                {meta?.estimatedReadMinutes && (
                  <span className="flex items-center space-x-1 text-xs text-neutral-400">
                    <Clock className="w-3 h-3" />
                    <span>{meta.estimatedReadMinutes} min read</span>
                  </span>
                )}
              </div>

              <h2 className="text-lg font-semibold text-white leading-snug">
                {title}
              </h2>

              {meta?.authorOrHandle && (
                <div className="flex items-center space-x-1.5 text-xs text-neutral-400 mt-1.5">
                  <User className="w-3.5 h-3.5" />
                  <span>{meta.authorOrHandle}</span>
                </div>
              )}
            </div>

            {/* Note & Markdown Reader / Editor */}
            {isTextOrNote && (
              <div className="rounded-xl bg-black/40 border border-white/[0.08] p-3.5 space-y-2">
                <MarkdownViewer
                  content={item.noteContent || item.rawShareText || ''}
                  isEditable={true}
                  onSave={handleSaveNote}
                />
              </div>
            )}

            {/* TL;DR Summary (Only when distinct from note) */}
            {!isTextOrNote && (
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.08] p-3.5 space-y-1">
                <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-400">
                  TL;DR
                </span>
                <p className="text-xs text-neutral-200 leading-relaxed">
                  {tldr}
                </p>
              </div>
            )}

            {/* Intent Note & 1-Tap Chip Selector */}
            <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-neutral-400 flex items-center space-x-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Intent Tag</span>
                </span>
                <button
                  type="button"
                  onClick={() => setIsEditingTag(!isEditingTag)}
                  className="text-[11px] text-neutral-400 hover:text-white"
                >
                  {isEditingTag ? 'Done' : 'Change tag'}
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5 pt-1">
                {PRESET_INTENT_CHIPS.map((chip) => {
                  const isSelected = item.quickNote === chip;
                  return (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => handleToggleIntentChip(chip)}
                      className={`text-[11px] px-2.5 py-1 rounded-full transition-all duration-150 ${
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
            </div>

            {/* Tags */}
            {meta?.tags && meta.tags.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[11px] font-medium text-neutral-400 flex items-center space-x-1">
                  <Tag className="w-3 h-3" />
                  <span>AI Tags</span>
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {meta.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs px-2.5 py-0.5 rounded-full bg-white/[0.05] border border-white/[0.08] text-neutral-300"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* AI Search Synonyms */}
            {meta?.searchSynonyms && meta.searchSynonyms.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[11px] font-medium text-neutral-400 flex items-center space-x-1">
                  <Search className="w-3 h-3 text-cyan-400" />
                  <span>AI Search Synonyms (Indexed for Fuzzy Search)</span>
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {meta.searchSynonyms.map((synonym) => (
                    <span
                      key={synonym}
                      className="text-[11px] px-2 py-0.5 rounded-md bg-cyan-500/[0.08] border border-cyan-500/20 text-cyan-300"
                    >
                      {synonym}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Canonical URL preview */}
            {item.url && (
              <div className="p-2.5 rounded-xl bg-black/40 border border-white/[0.06] flex items-center justify-between text-xs font-mono text-neutral-400">
                <span className="truncate mr-2">{item.url}</span>
                <div className="flex items-center space-x-1 flex-shrink-0">
                  <button
                    onClick={handleCopyLink}
                    className="p-1 rounded hover:bg-white/[0.1] text-neutral-300 hover:text-white transition-colors"
                    title="Copy link"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={handleOpenBrowser}
                    className="p-1 rounded hover:bg-white/[0.1] text-neutral-300 hover:text-white transition-colors"
                    title="Open in browser"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Status & Error notice */}
            {item.errorMessage && (
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
                <span className="font-semibold">Processing error: </span>
                <span>{item.errorMessage}</span>
              </div>
            )}

            {/* Action Footer Buttons */}
            <div className="pt-3 border-t border-white/[0.08] flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="px-3 py-1.5 rounded-xl text-xs text-rose-400 hover:bg-rose-500/15 flex items-center space-x-1.5 transition-colors border border-rose-500/20"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleReEnrich}
                  disabled={isEnriching}
                  className="px-3 py-1.5 rounded-xl text-xs bg-white/[0.06] hover:bg-white/[0.12] text-neutral-200 border border-white/[0.08] flex items-center space-x-1.5 transition-colors disabled:opacity-50"
                >
                  <RotateCw className={`w-3.5 h-3.5 ${isEnriching ? 'animate-spin' : ''}`} />
                  <span>Re-enrich</span>
                </button>

                {item.url && (
                  <button
                    type="button"
                    onClick={handleOpenBrowser}
                    className="px-4 py-1.5 rounded-xl text-xs bg-white text-black font-semibold hover:bg-neutral-200 flex items-center space-x-1.5 transition-colors shadow-sm"
                  >
                    <span>Open</span>
                    <ExternalLink className="w-3 h-3 stroke-[2.5]" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Fullscreen Image Overlay */}
      {isFullscreenImage && item.thumbnailUrl && (
        <div
          onClick={() => setIsFullscreenImage(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-lg p-2"
        >
          <button
            onClick={() => setIsFullscreenImage(false)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={item.thumbnailUrl}
            alt={title}
            className="max-h-full max-w-full object-contain rounded-lg"
          />
        </div>
      )}

      {/* OLED Dark Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        title="Delete Item?"
        message={`Are you sure you want to delete "${title.slice(0, 45)}"? This cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        isDanger={true}
        onConfirm={handleConfirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </>
  );
};
