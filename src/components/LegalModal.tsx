import React, { useEffect } from 'react';
import { X, Shield, FileText, ExternalLink } from 'lucide-react';
import { openExternalUrl, registerBackButtonHandler } from '../native/bridge';

export type LegalTab = 'privacy' | 'terms';

interface LegalModalProps {
  isOpen: boolean;
  activeTab: LegalTab;
  onTabChange: (tab: LegalTab) => void;
  onClose: () => void;
}

const GITHUB_URL = 'https://github.com/Prashantispacific/drop-library';

export const LegalModal: React.FC<LegalModalProps> = ({
  isOpen,
  activeTab,
  onTabChange,
  onClose,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    return registerBackButtonHandler(() => {
      onClose();
      return true;
    });
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg max-h-[85vh] overflow-y-auto no-scrollbar rounded-t-3xl sm:rounded-2xl bg-[#121212] border border-white/[0.1] shadow-2xl text-[#E2E2E2] flex flex-col"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#121212]/95 backdrop-blur-md px-5 py-4 border-b border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => onTabChange('privacy')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition-colors ${
                activeTab === 'privacy'
                  ? 'bg-white text-black'
                  : 'bg-white/[0.04] text-neutral-400 hover:text-white'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Privacy Policy</span>
            </button>
            <button
              type="button"
              onClick={() => onTabChange('terms')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition-colors ${
                activeTab === 'terms'
                  ? 'bg-white text-black'
                  : 'bg-white/[0.04] text-neutral-400 hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Terms & Conditions</span>
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-neutral-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 text-xs text-neutral-300 leading-relaxed">
          {activeTab === 'privacy' ? (
            <>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-white">Local-First Privacy</h3>
                <p className="text-neutral-400">
                  Drop Library is built on a strict local-first, Bring Your Own Key (BYOK) architecture.
                </p>
              </div>
              <ul className="space-y-2.5 list-disc pl-4 text-neutral-300">
                <li>
                  <strong className="text-white">On-Device Storage:</strong> All saved links, notes, PDFs, images, and API keys are stored solely in your device&apos;s IndexedDB storage. We operate no user accounts, analytics trackers, or central database.
                </li>
                <li>
                  <strong className="text-white">Direct AI Calls:</strong> Metadata enrichment requests are sent directly from your device to Google AI Studio (Gemma / Gemini) or your configured custom AI endpoint using your own key.
                </li>
                <li>
                  <strong className="text-white">URL Unfurling:</strong> When saving a web link, the optional serverless unfurler fetches only public OpenGraph metadata and does not log or retain your library items.
                </li>
                <li>
                  <strong className="text-white">Local PDF & File Parsing:</strong> Uploaded PDFs and documents are parsed locally on your device. Only a compact distilled text digest is sent for AI tagging.
                </li>
              </ul>
            </>
          ) : (
            <>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-white">Terms & Conditions</h3>
                <p className="text-neutral-400">
                  By using Drop Library, you agree to the following open-source terms.
                </p>
              </div>
              <ul className="space-y-2.5 list-disc pl-4 text-neutral-300">
                <li>
                  <strong className="text-white">Open Source (MIT):</strong> Drop Library is free, open-source software provided &ldquo;as is&rdquo; without warranty of any kind.
                </li>
                <li>
                  <strong className="text-white">API Keys & Quotas:</strong> You are responsible for safeguarding your own API keys and complying with the terms and rate limits of your chosen AI provider (Google AI Studio, OpenRouter, NVIDIA NIM, Groq, or local Ollama).
                </li>
                <li>
                  <strong className="text-white">Data Backups:</strong> Because all data lives locally on your device, clearing app data or uninstalling will remove your vault unless you export a JSON backup from Settings.
                </li>
              </ul>
            </>
          )}

          {/* Subtle Footer */}
          <div className="pt-4 border-t border-white/[0.08] flex items-center justify-between text-[11px] text-neutral-500">
            <span>Made by Prashant</span>
            <button
              type="button"
              onClick={() => openExternalUrl(GITHUB_URL)}
              className="flex items-center space-x-1 text-neutral-400 hover:text-white transition-colors"
            >
              <span>Open Source on GitHub</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
