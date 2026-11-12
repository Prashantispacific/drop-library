import React, { useState, useMemo } from 'react';
import { marked } from 'marked';
import { Edit3, Eye, Check, X, Copy } from 'lucide-react';
import { triggerHaptic } from '../native/bridge';

interface MarkdownViewerProps {
  content: string;
  isEditable?: boolean;
  onSave?: (newContent: string) => Promise<void> | void;
}

export const MarkdownViewer: React.FC<MarkdownViewerProps> = ({
  content,
  isEditable = true,
  onSave,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(content);
  const [copied, setCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Render markdown to safe HTML
  const renderedHtml = useMemo(() => {
    try {
      return marked.parse(content || '', { gfm: true, breaks: true });
    } catch (e) {
      console.warn('Markdown parse error:', e);
      return `<p>${content}</p>`;
    }
  }, [content]);

  const handleCopy = async () => {
    try {
      triggerHaptic('light');
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  const handleStartEdit = () => {
    triggerHaptic('light');
    setDraft(content);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    triggerHaptic('light');
    setDraft(content);
    setIsEditing(false);
  };

  const handleSaveEdit = async () => {
    if (!onSave) return;
    setIsSaving(true);
    triggerHaptic('success');
    try {
      await onSave(draft);
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to save note edits:', err);
    } finally {
      setIsSaving(false);
    }
  };

  if (isEditing) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-neutral-400">
          <span className="font-medium flex items-center space-x-1.5 text-neutral-300">
            <Edit3 className="w-3.5 h-3.5 text-amber-400" />
            <span>Editing Note (Markdown supported)</span>
          </span>
          <div className="flex items-center space-x-1.5">
            <button
              type="button"
              onClick={handleCancelEdit}
              className="px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-neutral-300 text-xs flex items-center space-x-1 transition-colors"
            >
              <X className="w-3 h-3" />
              <span>Cancel</span>
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={handleSaveEdit}
              className="px-3 py-1 rounded-lg bg-white text-black hover:bg-neutral-200 text-xs font-semibold flex items-center space-x-1 transition-colors disabled:opacity-50"
            >
              <Check className="w-3 h-3 stroke-[2.5]" />
              <span>{isSaving ? 'Saving...' : 'Save'}</span>
            </button>
          </div>
        </div>

        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={10}
          autoComplete="on"
          autoCorrect="on"
          spellCheck={true}
          autoCapitalize="sentences"
          placeholder="Write your note in Markdown..."
          className="w-full bg-black/60 border border-white/15 focus:border-white/30 focus:outline-none rounded-xl p-3 text-xs sm:text-sm font-mono text-[#E2E2E2] leading-relaxed resize-y min-h-[160px] transition-colors"
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-neutral-400 pb-1 border-b border-white/[0.06]">
        <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-400">
          Note Content
        </span>
        <div className="flex items-center space-x-1">
          <button
            type="button"
            onClick={handleCopy}
            className="p-1 rounded hover:bg-white/[0.08] text-neutral-400 hover:text-white transition-colors"
            title="Copy Note"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          {isEditable && onSave && (
            <button
              type="button"
              onClick={handleStartEdit}
              className="px-2 py-0.5 rounded bg-white/[0.05] hover:bg-white/[0.1] text-neutral-300 text-[11px] flex items-center space-x-1 transition-colors border border-white/[0.06]"
            >
              <Edit3 className="w-3 h-3 text-neutral-400" />
              <span>Edit</span>
            </button>
          )}
        </div>
      </div>

      <div
        className="prose prose-invert max-w-none text-xs sm:text-sm text-neutral-200 leading-relaxed space-y-2.5 overflow-x-auto select-text break-words"
        dangerouslySetInnerHTML={{ __html: typeof renderedHtml === 'string' ? renderedHtml : '' }}
      />
    </div>
  );
};
