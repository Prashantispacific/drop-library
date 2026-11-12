import React from 'react';
import type { LibraryItem } from '../types/library';
import { ImageWithFallback } from './ImageWithFallback';
import { openExternalUrl, triggerHaptic } from '../native/bridge';
import { queueWorker } from '../services/queueWorker';
import { InstagramIcon, YoutubeIcon } from './icons';
import {
  Globe,
  FileText,
  Image as ImageIcon,
  ExternalLink,
  RotateCw,
  Clock,
  User,
} from 'lucide-react';

interface LibraryCardProps {
  item: LibraryItem;
  onClick: () => void;
}

export const LibraryCard: React.FC<LibraryCardProps> = ({ item, onClick }) => {
  const meta = item.meta;
  const title = meta?.title || item.rawShareText || item.url || 'Untitled Drop';
  const tldr = meta?.tldr || item.quickNote || (item.url ? item.url : 'No preview available');

  const getPlatformIcon = () => {
    switch (item.platform) {
      case 'instagram':
        return <InstagramIcon className="w-3.5 h-3.5 text-pink-400" />;
      case 'youtube':
        return <YoutubeIcon className="w-3.5 h-3.5 text-red-400" />;
      case 'text':
        return <FileText className="w-3.5 h-3.5 text-blue-400" />;
      case 'image':
        return <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />;
      default:
        return <Globe className="w-3.5 h-3.5 text-neutral-400" />;
    }
  };

  const getCategoryColor = (cat?: string) => {
    switch (cat) {
      case 'reel':
        return 'bg-pink-500/10 text-pink-300 border-pink-500/20';
      case 'article':
        return 'bg-blue-500/10 text-blue-300 border-blue-500/20';
      case 'essay':
        return 'bg-purple-500/10 text-purple-300 border-purple-500/20';
      case 'tool':
        return 'bg-amber-500/10 text-amber-300 border-amber-500/20';
      case 'quote':
        return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
      case 'inspo':
        return 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20';
      default:
        return 'bg-white/[0.05] text-neutral-400 border-white/[0.08]';
    }
  };

  const formatTimeAgo = (timestamp: number) => {
    const elapsed = Date.now() - timestamp;
    const mins = Math.floor(elapsed / (1000 * 60));
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const handleRetry = async (e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic('light');
    await queueWorker.retryItem(item.id);
  };

  const handleOpenLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic('light');
    if (item.url) {
      openExternalUrl(item.url);
    }
  };

  return (
    <div
      onClick={onClick}
      className="group relative rounded-2xl bg-[#121212] border border-white/[0.08] hover:border-white/20 transition-all duration-200 overflow-hidden cursor-pointer flex flex-col justify-between shadow-sm active:scale-[0.99]"
    >
      {/* Top Media / Thumbnail */}
      {(item.thumbnailUrl || item.platform === 'instagram' || item.platform === 'youtube' || item.platform === 'image') && (
        <div className="relative bg-black/40">
          <ImageWithFallback
            src={item.thumbnailUrl}
            alt={title}
            platform={item.platform}
            aspectRatio={item.platform === 'image' ? 'video' : 'wide'}
            className="w-full object-cover"
          />

          {/* Floating Platform Badge */}
          <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-md border border-white/10 flex items-center space-x-1.5 text-[11px] text-white">
            {getPlatformIcon()}
            <span className="capitalize text-neutral-300 font-medium text-[10px]">
              {item.platform}
            </span>
          </div>

          {/* Status Indicator Pill */}
          <div className="absolute top-2.5 right-2.5">
            {item.status === 'pending' && (
              <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-amber-500/20 backdrop-blur-md border border-amber-500/30 text-amber-300 text-[10px]">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                <span>Pending</span>
              </span>
            )}
            {item.status === 'unfurling' && (
              <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-cyan-500/20 backdrop-blur-md border border-cyan-500/30 text-cyan-300 text-[10px]">
                <RotateCw className="w-2.5 h-2.5 animate-spin" />
                <span>Enriching</span>
              </span>
            )}
            {item.status === 'failed' && (
              <button
                onClick={handleRetry}
                className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-rose-500/20 backdrop-blur-md border border-rose-500/30 text-rose-300 hover:bg-rose-500/30 text-[10px] transition-colors"
                title="Tap to retry"
              >
                <RotateCw className="w-2.5 h-2.5" />
                <span>Retry</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Card Content Body */}
      <div className="p-4 flex-1 flex flex-col justify-between">
        <div>
          {/* Header row: Category & Read Time (if no thumbnail) */}
          {(!item.thumbnailUrl && item.platform !== 'instagram' && item.platform !== 'youtube') && (
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/[0.08] text-[11px] text-white">
                {getPlatformIcon()}
                <span className="capitalize text-neutral-300 text-[10px]">{item.platform}</span>
              </div>

              {item.status === 'pending' && (
                <span className="flex items-center space-x-1 text-[10px] text-amber-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  <span>Pending</span>
                </span>
              )}
              {item.status === 'failed' && (
                <button
                  onClick={handleRetry}
                  className="flex items-center space-x-1 text-[10px] text-rose-400 hover:underline"
                >
                  <RotateCw className="w-2.5 h-2.5" />
                  <span>Retry</span>
                </button>
              )}
            </div>
          )}

          {/* Title */}
          <h3 className="text-sm font-medium text-[#E2E2E2] line-clamp-2 mb-1.5 group-hover:text-white transition-colors">
            {title}
          </h3>

          {/* Quick Intent Tag */}
          {item.quickNote && (
            <div className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-300 text-[10px] font-medium mb-2">
              <span>{item.quickNote}</span>
            </div>
          )}

          {/* TL;DR summary */}
          <p className="text-xs text-neutral-400 line-clamp-2 leading-relaxed mb-3">
            {tldr}
          </p>

          {/* Tags */}
          {meta?.tags && meta.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {meta.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] text-neutral-400"
                >
                  #{tag}
                </span>
              ))}
              {meta.tags.length > 3 && (
                <span className="text-[10px] text-neutral-600 px-1">
                  +{meta.tags.length - 3}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Footer Meta Row */}
        <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-neutral-500">
          <div className="flex items-center space-x-2 truncate">
            {meta?.category && (
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold border ${getCategoryColor(
                  meta.category
                )}`}
              >
                {meta.category}
              </span>
            )}

            {meta?.authorOrHandle && (
              <span className="flex items-center space-x-1 truncate max-w-[110px]">
                <User className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{meta.authorOrHandle}</span>
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2 flex-shrink-0">
            <span className="flex items-center space-x-1">
              <Clock className="w-3 h-3" />
              <span>{formatTimeAgo(item.createdAt)}</span>
            </span>

            {item.url && (
              <button
                onClick={handleOpenLink}
                className="p-1 rounded hover:bg-white/[0.08] text-neutral-400 hover:text-white transition-colors"
                title="Open canonical link"
              >
                <ExternalLink className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
