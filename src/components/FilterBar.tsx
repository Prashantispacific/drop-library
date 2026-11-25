import React, { useState } from 'react';
import type { FilterState, ItemCategory, PlatformType, ItemStatus } from '../types/library';
import { triggerHaptic } from '../native/bridge';
import { Search, X, SlidersHorizontal } from 'lucide-react';

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
  { key: 'all', label: 'All Sources' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'web', label: 'Web' },
  { key: 'text', label: 'Notes & Files' },
  { key: 'image', label: 'Images' },
];

const STATUSES: Array<{ key: 'all' | ItemStatus; label: string }> = [
  { key: 'all', label: 'Any' },
  { key: 'enriched', label: 'Ready' },
  { key: 'pending', label: 'Pending' },
  { key: 'failed', label: 'Failed' },
];

export const FilterBar: React.FC<FilterBarProps> = ({ filter, onChange, totalCount }) => {
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  const hasSecondaryFilter = filter.platform !== 'all' || filter.status !== 'all';
  const isSecondaryOpen = showMoreFilters || hasSecondaryFilter;

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
    <div className="w-full space-y-2.5 pt-1">
      {/* Search Input + Compact Filter Toggle */}
      <div className="relative flex items-center">
        <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 pointer-events-none" />
        <input
          type="text"
          value={filter.searchQuery}
          onChange={(e) => onChange({ ...filter, searchQuery: e.target.value })}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={`Search ${totalCount} items...`}
          className="w-full bg-[#141414] border border-white/[0.07] focus:border-white/20 focus:outline-none rounded-xl pl-10 pr-16 py-2.5 text-base sm:text-sm text-[#E2E2E2] placeholder-neutral-500 transition-colors"
        />
        <div className="absolute right-2 flex items-center space-x-1">
          {filter.searchQuery && (
            <button
              type="button"
              onClick={() => onChange({ ...filter, searchQuery: '' })}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-white transition-colors"
              title="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setShowMoreFilters(!showMoreFilters);
            }}
            className={`p-1.5 rounded-lg transition-colors relative ${
              isSecondaryOpen
                ? 'bg-white/12 text-white'
                : 'text-neutral-500 hover:text-neutral-300'
            }`}
            title="Source & status filters"
          >
            <SlidersHorizontal className="w-4 h-4" />
            {hasSecondaryFilter && (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-blue-400" />
            )}
          </button>
        </div>
      </div>

      {/* Category Pills */}
      <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar pb-0.5">
        {CATEGORIES.map(({ key, label }) => {
          const isSelected = filter.category === key;
          return (
            <button
              key={key}
              onClick={() => handleCategoryClick(key)}
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-150 ${
                isSelected
                  ? 'bg-white text-black font-semibold'
                  : 'bg-white/[0.04] text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.08]'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Collapsible Source & Status Row */}
      {isSecondaryOpen && (
        <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar pt-0.5 text-xs">
          <div className="flex items-center space-x-1 flex-nowrap">
            {PLATFORMS.map(({ key, label }) => {
              const isSelected = filter.platform === key;
              return (
                <button
                  key={key}
                  onClick={() => handlePlatformClick(key)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] whitespace-nowrap transition-colors ${
                    isSelected
                      ? 'bg-white/[0.1] text-white font-medium'
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
                  className={`px-2 py-1 rounded-lg text-[11px] whitespace-nowrap transition-colors ${
                    isSelected
                      ? 'text-white font-medium bg-white/[0.08]'
                      : 'text-neutral-500 hover:text-neutral-300'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
