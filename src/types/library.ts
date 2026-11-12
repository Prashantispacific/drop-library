import { z } from 'zod';

export type PlatformType = 'instagram' | 'youtube' | 'web' | 'text' | 'image';
export type ItemCategory = 'reel' | 'article' | 'essay' | 'tool' | 'quote' | 'inspo';
export type ItemStatus = 'pending' | 'unfurling' | 'enriched' | 'failed';

export interface LibraryItemMeta {
  title: string;
  tldr: string;
  category: ItemCategory;
  tags: string[];               // 3–5 normalized lowercase tags
  searchSynonyms: string[];     // Related concepts so vague queries match
  authorOrHandle?: string;
  estimatedReadMinutes?: number;
}

export interface LibraryItem {
  id: string;                     // crypto.randomUUID()
  schemaVersion: 1;
  createdAt: number;
  updatedAt: number;
  status: ItemStatus;
  retryCount: number;
  errorMessage?: string;

  // 1. Raw Capture (Saved immediately offline)
  url?: string;                   // Canonical URL stripped of tracking params
  platform: PlatformType;
  rawShareText?: string;          // Raw text/title from Android Share Sheet
  quickNote?: string;             // Optional 1-tap tag/note added on capture
  thumbnailUrl?: string;          // Extracted og:image URL

  // 2. AI-Structured Metadata (Validated JSON from Gemini)
  meta?: LibraryItemMeta;
}

export interface UserSettings {
  geminiApiKey: string;
  geminiModel: string;
  unfurlEndpoint: string;
  themeMode: 'oled' | 'true-black';
  autoEnrich: boolean;
  hapticFeedback: boolean;
  autoReturnAfterShare: boolean;
  returnDelaySeconds: number; // 0 = instant, 1 = 1s HUD, 2 = 2s HUD
}

export interface UnfurlResult {
  success: boolean;
  url: string;
  canonicalUrl?: string;
  platform?: PlatformType;
  title?: string;
  description?: string;
  content?: string;
  author?: string;
  thumbnailUrl?: string;
  thumbnailBase64?: string;
  siteName?: string;
  error?: string;
}

export interface FilterState {
  searchQuery: string;
  category: 'all' | ItemCategory;
  platform: 'all' | PlatformType;
  status: 'all' | ItemStatus;
}
