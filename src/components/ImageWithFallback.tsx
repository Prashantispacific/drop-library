import React, { useState } from 'react';
import type { PlatformType } from '../types/library';
import { Globe, FileText, Image as ImageIcon } from 'lucide-react';
import { InstagramIcon, YoutubeIcon } from './icons';

interface ImageWithFallbackProps {
  src?: string;
  alt: string;
  platform: PlatformType;
  className?: string;
  aspectRatio?: 'video' | 'square' | 'wide';
}

export const ImageWithFallback: React.FC<ImageWithFallbackProps> = ({
  src,
  alt,
  platform,
  className = '',
  aspectRatio = 'wide',
}) => {
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const getPlatformIcon = () => {
    switch (platform) {
      case 'instagram':
        return <InstagramIcon className="w-6 h-6 text-pink-400" />;
      case 'youtube':
        return <YoutubeIcon className="w-6 h-6 text-red-400" />;
      case 'text':
        return <FileText className="w-6 h-6 text-blue-400" />;
      case 'image':
        return <ImageIcon className="w-6 h-6 text-emerald-400" />;
      default:
        return <Globe className="w-6 h-6 text-neutral-400" />;
    }
  };

  const aspectClass =
    aspectRatio === 'video'
      ? 'aspect-video'
      : aspectRatio === 'square'
      ? 'aspect-square'
      : 'aspect-[16/9]';

  // If no src or error loading (e.g. expired social CDN token), render graceful degradation
  if (!src || error) {
    return (
      <div
        className={`w-full ${aspectClass} bg-neutral-900/60 border-b border-white/[0.06] flex flex-col items-center justify-center p-4 text-center select-none ${className}`}
      >
        <div className="p-2.5 rounded-full bg-white/[0.04] border border-white/[0.08] mb-2">
          {getPlatformIcon()}
        </div>
        <span className="text-xs uppercase tracking-wider text-neutral-500 font-medium">
          {platform}
        </span>
      </div>
    );
  }

  return (
    <div className={`relative w-full ${aspectClass} overflow-hidden bg-neutral-900/40 ${className}`}>
      {!loaded && (
        <div className="absolute inset-0 bg-neutral-900 animate-pulse flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
        </div>
      )}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        className={`w-full h-full object-cover transition-opacity duration-300 ${
          loaded ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </div>
  );
};
