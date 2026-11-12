import React, { useEffect, useState } from 'react';
import type { LibraryItem } from '../types/library';
import { triggerHaptic } from '../native/bridge';
import { storage } from '../services/storage';
import { InstagramIcon, YoutubeIcon } from './icons';
import { Check, Globe, FileText, Image as ImageIcon } from 'lucide-react';

interface SavedOverlayProps {
  item: LibraryItem | null;
  onDismiss: () => void;
}

const INTENT_CHIPS = [
  '#toread',
  '#inspo',
  '#tool',
  '#code',
  '#quote',
  '#project',
];

export const SavedOverlay: React.FC<SavedOverlayProps> = ({ item, onDismiss }) => {
  const [selectedChip, setSelectedChip] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (item) {
      setVisible(true);
      setSelectedChip(item.quickNote || null);
      triggerHaptic('success');

      // Auto dismiss timer (1.8s)
      const timer = setTimeout(() => {
        handleClose();
      }, 2000);

      return () => clearTimeout(timer);
    } else {
      setVisible(false);
    }
  }, [item]);

  if (!item || !visible) return null;

  const handleChipClick = async (chip: string) => {
    triggerHaptic('light');
    const newNote = selectedChip === chip ? undefined : chip;
    setSelectedChip(newNote || null);
    await storage.updateItem(item.id, { quickNote: newNote });

    // Close quickly after 1-tap intent selection
    setTimeout(() => {
      handleClose();
    }, 400);
  };

  const handleClose = () => {
    setVisible(false);
    setTimeout(onDismiss, 200);
  };

  const renderPlatformIcon = () => {
    switch (item.platform) {
      case 'instagram':
        return <InstagramIcon className="w-4 h-4 text-pink-400" />;
      case 'youtube':
        return <YoutubeIcon className="w-4 h-4 text-red-400" />;
      case 'text':
        return <FileText className="w-4 h-4 text-blue-400" />;
      case 'image':
        return <ImageIcon className="w-4 h-4 text-emerald-400" />;
      default:
        return <Globe className="w-4 h-4 text-neutral-400" />;
    }
  };

  return (
    <div
      onClick={handleClose}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-[#121212]/95 border border-white/10 shadow-2xl p-4 text-[#E2E2E2] transform transition-transform duration-200"
      >
        {/* Header row: Checkmark + Saved ✓ + Platform */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
            </div>
            <span className="font-semibold text-sm tracking-tight text-white">Saved to Library</span>
          </div>

          <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/[0.08] text-xs">
            {renderPlatformIcon()}
            <span className="capitalize text-neutral-400 text-[11px]">{item.platform}</span>
          </div>
        </div>

        {/* Content snippet preview */}
        <p className="text-xs text-neutral-400 truncate mb-3 font-mono">
          {item.url || item.rawShareText || 'Captured snippet'}
        </p>

        {/* 1-tap quick intent chips */}
        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-white/[0.06]">
          {INTENT_CHIPS.map((chip) => {
            const isSelected = selectedChip === chip;
            return (
              <button
                key={chip}
                onClick={() => handleChipClick(chip)}
                className={`text-[11px] px-2.5 py-1 rounded-full transition-all duration-150 ${
                  isSelected
                    ? 'bg-white text-black font-semibold shadow-sm'
                    : 'bg-white/[0.05] hover:bg-white/[0.1] text-neutral-300 border border-white/[0.06]'
                }`}
              >
                {chip}
              </button>
            );
          })}
        </div>

        {/* Progress bar indicating auto-dismiss */}
        <div className="w-full h-0.5 bg-white/[0.05] rounded-full overflow-hidden mt-3">
          <div className="h-full bg-emerald-500/80 animate-[shrink_1.8s_linear_forwards]" />
        </div>
      </div>
    </div>
  );
};
