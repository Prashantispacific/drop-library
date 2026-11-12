import React from 'react';
import type { FilterState, ItemCategory, PlatformType, ItemStatus } from '../types/library';
import { triggerHaptic } from '../native/bridge';
import { Search, X } from 'lucide-react';

interface FilterBarProps {
  filter: FilterState;
  onChange: (filter: FilterState) => void;
  totalCount: number;
}

const CATEGORIES: Array<{ key: 'all' | ItemCategory; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'reel', label: 'Reels' },
  { key: 'article', label: 'Articles' },
  { key: 'essay', label: 'Essays' },
  { key: 'tool', label: 'Tools' },
  { key: 'quote', label: 'Quotes' },
  { key: 'inspo', label: 'Inspo' },
];

const PLATFORMS: Array<{ key: 'all' | PlatformType; label: string }> = [
  { key: 'all', label: 'All Platforms' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'web', label: 'Web' },
  { key: 'text', label: 'Notes' },
  { key: 'image', label: 'Images' },
];

const STATUSES: Array<{ key: 'all' | ItemStatus; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'enriched', label: 'Enriched' },
  { key: 'pending', label: 'Pending' },
  { key: 'failed', label: 'Failed' },
];

export const FilterBar: React.FC<FilterBarProps> = ({ filter, onChange, totalCount }) => {
  const handleCategoryClick = (category: 'all' | ItemCategory) => {
    triggerHaptic('light');
    onChange({ ...filter, category });
  };

  const handlePlatformClick = (platform: 'all' | PlatformType) => {
    triggerHaptic('light');
    onChange({ ...filter, platform });
  };

  const handleStatusClick = (status: 'all' | ItemStatus) => {
    triggerHaptic('light');
    onChange({ ...filter, status });
  };

  return (
    <div className="w-full space-y-3 py-2">
      {/* Search Input */}
      <div className="relative">
        <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={filter.searchQuery}
          onChange={(e) => onChange({ ...filter, searchQuery: e.target.value })}
          placeholder={`Search ${totalCount} items (fuzzy title, tags, synonyms)...`}
          className="w-full bg-[#141414] border border-white/[0.08] focus:border-white/20 focus:outline-none rounded-xl pl-10 pr-9 py-2 text-sm text-[#E2E2E2] placeholder-neutral-500 transition-colors"
        />
        {filter.searchQuery && (
          <button
            type="button"
            onClick={() => onChange({ ...filter, searchQuery: '' })}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Horizontal Scrollable Category Pills */}
      <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar pb-1">
        {CATEGORIES.map(({ key, label }) => {
          const isSelected = filter.category === key;
          return (
            <button
              key={key}
              onClick={() => handleCategoryClick(key)}
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-150 ${
                isSelected
                  ? 'bg-white text-black font-semibold shadow-sm'
                  : 'bg-white/[0.04] text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.08] border border-white/[0.06]'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Secondary filter chips row: Platform & Status */}
      <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar text-xs">
        <div className="flex items-center space-x-1.5 flex-nowrap">
          {PLATFORMS.map(({ key, label }) => {
            const isSelected = filter.platform === key;
            return (
              <button
                key={key}
                onClick={() => handlePlatformClick(key)}
                className={`px-2.5 py-0.5 rounded-md text-[11px] whitespace-nowrap transition-colors ${
                  isSelected
                    ? 'bg-neutral-800 text-white border border-neutral-700'
                    : 'text-neutral-500 hover:text-neutral-300'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center space-x-1 flex-nowrap border-l border-white/[0.08] pl-2">
          {STATUSES.map(({ key, label }) => {
            const isSelected = filter.status === key;
            return (
              <button
                key={key}
                onClick={() => handleStatusClick(key)}
                className={`px-2 py-0.5 rounded text-[11px] whitespace-nowrap transition-colors ${
                  isSelected
                    ? 'text-white font-medium underline underline-offset-4'
                    : 'text-neutral-600 hover:text-neutral-400'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
