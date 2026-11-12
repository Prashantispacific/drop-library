import Fuse, { type IFuseOptions } from 'fuse.js';
import type { FilterState, LibraryItem } from '../types/library';

const FUSE_OPTIONS: IFuseOptions<LibraryItem> = {
  includeScore: true,
  threshold: 0.38, // Balance between typo tolerance and precision
  ignoreLocation: true,
  keys: [
    { name: 'meta.title', weight: 2.0 },
    { name: 'meta.tags', weight: 1.8 },
    { name: 'meta.searchSynonyms', weight: 1.6 },
    { name: 'meta.tldr', weight: 1.4 },
    { name: 'meta.authorOrHandle', weight: 1.2 },
    { name: 'quickNote', weight: 1.0 },
    { name: 'rawShareText', weight: 0.8 },
    { name: 'url', weight: 0.5 },
  ],
};

export class SearchEngine {
  private fuse: Fuse<LibraryItem> | null = null;
  private items: LibraryItem[] = [];

  constructor(initialItems: LibraryItem[] = []) {
    this.updateItems(initialItems);
  }

  updateItems(newItems: LibraryItem[]) {
    this.items = newItems;
    this.fuse = new Fuse(this.items, FUSE_OPTIONS);
  }

  filterAndSearch(filter: FilterState): LibraryItem[] {
    let result = this.items;

    // 1. Text search via Fuse.js if query provided
    const query = filter.searchQuery.trim();
    if (query && this.fuse) {
      const fuseResults = this.fuse.search(query);
      result = fuseResults.map((r) => r.item);
    }

    // 2. Category filter
    if (filter.category !== 'all') {
      result = result.filter((item) => item.meta?.category === filter.category);
    }

    // 3. Platform filter
    if (filter.platform !== 'all') {
      result = result.filter((item) => item.platform === filter.platform);
    }

    // 4. Status filter
    if (filter.status !== 'all') {
      result = result.filter((item) => item.status === filter.status);
    }

    return result;
  }
}
