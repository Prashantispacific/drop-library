import React, { useEffect, useState, useRef } from 'react';
import type { UserSettings, LibraryItem } from '../types/library';
import { storage } from '../services/storage';
import { queueWorker } from '../services/queueWorker';
import { registerBackButtonHandler, setupStatusBar, triggerHaptic } from '../native/bridge';
import { ConfirmModal } from './ConfirmModal';
import {
  X,
  Key,
  Cpu,
  Globe,
  Moon,
  Vibrate,
  Sparkles,
  Download,
  Upload,
  Trash2,
  ExternalLink,
  Check,
  RefreshCw,
  CornerUpLeft,
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: LibraryItem[];
}

const SUPPORTED_MODELS = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Recommended - Fast & Free)' },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite (Ultra-low latency)' },
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash (Deep reasoning)' },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  items,
}) => {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gemini-2.5-flash');
  const [unfurlEndpoint, setUnfurlEndpoint] = useState('');
  const [themeMode, setThemeMode] = useState<'oled' | 'true-black'>('oled');
  const [autoEnrich, setAutoEnrich] = useState(true);
  const [hapticFeedback, setHapticFeedback] = useState(true);
  const [autoReturnAfterShare, setAutoReturnAfterShare] = useState(true);
  const [returnDelaySeconds, setReturnDelaySeconds] = useState(1);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const showFeedback = (msg: string) => {
    setFeedbackMessage(msg);
    setTimeout(() => setFeedbackMessage(null), 3000);
  };

  useEffect(() => {
    if (!isOpen) return;
    storage.getSettings().then((s) => {
      setSettings(s);
      setApiKey(s.geminiApiKey || '');
      setModel(s.geminiModel || 'gemini-2.5-flash');
      setUnfurlEndpoint(s.unfurlEndpoint || '');
      setThemeMode(s.themeMode || 'oled');
      setAutoEnrich(s.autoEnrich ?? true);
      setHapticFeedback(s.hapticFeedback ?? true);
      setAutoReturnAfterShare(s.autoReturnAfterShare ?? true);
      setReturnDelaySeconds(s.returnDelaySeconds ?? 1);
    });

    const unregister = registerBackButtonHandler(() => {
      onClose();
      return true;
    });
    return unregister;
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    triggerHaptic('light');

    const updated = await storage.saveSettings({
      geminiApiKey: apiKey.trim(),
      geminiModel: model.trim(),
      unfurlEndpoint: unfurlEndpoint.trim(),
      themeMode,
      autoEnrich,
      hapticFeedback,
      autoReturnAfterShare,
      returnDelaySeconds,
    });

    setupStatusBar(themeMode === 'true-black');
    setSettings(updated);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const handleProcessQueue = async () => {
    setIsProcessingQueue(true);
    triggerHaptic('light');
    try {
      await queueWorker.processQueue();
    } finally {
      setIsProcessingQueue(false);
    }
  };

  const handleExport = async () => {
    triggerHaptic('light');
    try {
      const json = await storage.exportBackup();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `drop-library-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showFeedback('Backup exported successfully');
    } catch (err) {
      showFeedback('Export failed: ' + String(err));
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const count = await storage.importBackup(text);
      triggerHaptic('success');
      showFeedback(`Successfully imported ${count} items!`);
    } catch (err) {
      showFeedback('Import failed: ' + String(err));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirmClearAll = async () => {
    triggerHaptic('warning');
    await storage.clearAllItems();
    setShowClearConfirm(false);
    showFeedback('Library completely cleared.');
  };

  const pendingCount = items.filter((i) => i.status === 'pending').length;
  const enrichedCount = items.filter((i) => i.status === 'enriched').length;
  const failedCount = items.filter((i) => i.status === 'failed').length;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[92vh] overflow-y-auto no-scrollbar rounded-2xl bg-[#121212] border border-white/[0.08] shadow-2xl text-[#E2E2E2] flex flex-col"
      >
        {/* Header */}
        <div className="p-4 border-b border-white/[0.08] flex items-center justify-between sticky top-0 bg-[#121212]/90 backdrop-blur-md z-10">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-base text-white">Settings & Vault</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/[0.08] text-neutral-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-5 space-y-6">
          {/* BYOK: Google AI Studio API Key */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300 flex items-center space-x-1.5">
                <Key className="w-3.5 h-3.5 text-amber-400" />
                <span>Google AI Studio Key (BYOK)</span>
              </label>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-neutral-400 hover:text-white flex items-center space-x-1 underline"
              >
                <span>Get Free Key</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Paste your AI Studio API key (AIza...)"
              className="w-full bg-white/[0.04] border border-white/[0.08] focus:border-white/20 focus:outline-none rounded-xl px-3 py-2 text-xs font-mono text-[#E2E2E2] placeholder-neutral-600 transition-colors"
            />
            <p className="text-[11px] text-neutral-500 leading-relaxed">
              Public repo safe: Kept strictly on-device in IndexedDB. Never transmitted to third parties.
            </p>
          </div>

          {/* Model Selection */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300 flex items-center space-x-1.5">
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              <span>Gemini Model</span>
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full bg-[#181818] border border-white/[0.08] focus:border-white/20 focus:outline-none rounded-xl px-3 py-2 text-xs text-[#E2E2E2] transition-colors"
            >
              {SUPPORTED_MODELS.map((m) => (
                <option key={m.id} value={m.id} className="bg-[#181818] text-white">
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {/* Unfurl Server Endpoint */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300 flex items-center space-x-1.5">
              <Globe className="w-3.5 h-3.5 text-blue-400" />
              <span>Netlify Unfurl Endpoint</span>
            </label>
            <input
              type="text"
              value={unfurlEndpoint}
              onChange={(e) => setUnfurlEndpoint(e.target.value)}
              placeholder="Default: /.netlify/functions/unfurl"
              className="w-full bg-white/[0.04] border border-white/[0.08] focus:border-white/20 focus:outline-none rounded-xl px-3 py-2 text-xs font-mono text-[#E2E2E2] placeholder-neutral-600 transition-colors"
            />
            <p className="text-[11px] text-neutral-500">
              For Android APK, point to your deployed Netlify domain (e.g. https://your-app.netlify.app/.netlify/functions/unfurl).
            </p>
          </div>

          {/* Appearance & Behavior */}
          <div className="space-y-3 pt-2 border-t border-white/[0.06]">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
              Preferences
            </span>

            {/* OLED vs True Black */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <div className="flex items-center space-x-2">
                <Moon className="w-4 h-4 text-neutral-300" />
                <div>
                  <span className="text-xs text-neutral-200 block font-medium">True Black (#000000)</span>
                  <span className="text-[10px] text-neutral-500">Max battery saving on AMOLED</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setThemeMode(themeMode === 'oled' ? 'true-black' : 'oled')}
                className={`w-11 h-6 rounded-full transition-colors p-0.5 ${
                  themeMode === 'true-black' ? 'bg-white' : 'bg-neutral-800'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-[#121212] transition-transform ${
                    themeMode === 'true-black' ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Auto Enrich */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <div>
                  <span className="text-xs text-neutral-200 block font-medium">Auto AI Enrichment</span>
                  <span className="text-[10px] text-neutral-500">Automatically generate TL;DR & tags</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAutoEnrich(!autoEnrich)}
                className={`w-11 h-6 rounded-full transition-colors p-0.5 ${
                  autoEnrich ? 'bg-white' : 'bg-neutral-800'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-[#121212] transition-transform ${
                    autoEnrich ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Auto Return After Share */}
            <div className="space-y-2 p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <CornerUpLeft className="w-4 h-4 text-emerald-400" />
                  <div>
                    <span className="text-xs text-neutral-200 block font-medium">Auto-Return After Share</span>
                    <span className="text-[10px] text-neutral-500">Return to Instagram/YouTube immediately</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAutoReturnAfterShare(!autoReturnAfterShare)}
                  className={`w-11 h-6 rounded-full transition-colors p-0.5 ${
                    autoReturnAfterShare ? 'bg-white' : 'bg-neutral-800'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-[#121212] transition-transform ${
                      autoReturnAfterShare ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {autoReturnAfterShare && (
                <div className="pt-2 border-t border-white/[0.04] flex items-center justify-between text-xs">
                  <span className="text-[11px] text-neutral-400">Return Delay:</span>
                  <div className="flex items-center space-x-1">
                    {[
                      { delay: 0, label: 'Instant (0s)' },
                      { delay: 1, label: 'Quick (1s)' },
                      { delay: 2, label: 'Relaxed (2s)' },
                    ].map(({ delay, label }) => (
                      <button
                        key={delay}
                        type="button"
                        onClick={() => setReturnDelaySeconds(delay)}
                        className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                          returnDelaySeconds === delay
                            ? 'bg-white text-black font-semibold'
                            : 'bg-white/[0.04] text-neutral-400 hover:text-white'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Haptics */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <div className="flex items-center space-x-2">
                <Vibrate className="w-4 h-4 text-neutral-300" />
                <div>
                  <span className="text-xs text-neutral-200 block font-medium">Haptic Feedback</span>
                  <span className="text-[10px] text-neutral-500">Subtle vibration on drops and taps</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setHapticFeedback(!hapticFeedback)}
                className={`w-11 h-6 rounded-full transition-colors p-0.5 ${
                  hapticFeedback ? 'bg-white' : 'bg-neutral-800'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-[#121212] transition-transform ${
                    hapticFeedback ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Offline Queue Status & Trigger */}
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-neutral-300">Offline Queue</span>
              <div className="flex items-center space-x-2 text-[11px]">
                <span className="text-emerald-400 font-medium">{enrichedCount} enriched</span>
                <span className="text-amber-400 font-medium">{pendingCount} pending</span>
                {failedCount > 0 && <span className="text-rose-400 font-medium">{failedCount} failed</span>}
              </div>
            </div>

            <button
              type="button"
              onClick={handleProcessQueue}
              disabled={isProcessingQueue || pendingCount === 0}
              className="w-full py-1.5 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-xs text-neutral-200 flex items-center justify-center space-x-1.5 transition-colors disabled:opacity-40"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isProcessingQueue ? 'animate-spin' : ''}`} />
              <span>Process Pending Queue ({pendingCount})</span>
            </button>
          </div>

          {/* Backup & Data Actions */}
          <div className="pt-2 border-t border-white/[0.06] space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400 block">
              Data Management
            </span>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleExport}
                className="py-2 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-xs text-neutral-300 flex items-center justify-center space-x-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export JSON</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="py-2 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-xs text-neutral-300 flex items-center justify-center space-x-1.5 transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Import JSON</span>
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImport}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => setShowClearConfirm(true)}
              className="w-full py-2 px-3 rounded-xl text-xs text-rose-400 hover:bg-rose-500/10 flex items-center justify-center space-x-1.5 transition-colors mt-1 border border-rose-500/20"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Entire Library</span>
            </button>
          </div>

          {/* Feedback banner */}
          {feedbackMessage && (
            <div className="p-2.5 rounded-xl bg-white/[0.08] border border-white/20 text-xs text-center text-white font-medium animate-in fade-in duration-150">
              {feedbackMessage}
            </div>
          )}

          {/* Save Button */}
          <div className="pt-2">
            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-white text-black font-semibold text-sm hover:bg-neutral-200 flex items-center justify-center space-x-1.5 transition-all shadow-md"
            >
              {saveSuccess ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600 stroke-[3]" />
                  <span>Saved Settings</span>
                </>
              ) : (
                <span>Save Changes</span>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* OLED Clear All Confirmation Modal */}
      <ConfirmModal
        isOpen={showClearConfirm}
        title="Clear Entire Library?"
        message="This will permanently delete all drops, links, and notes from IndexedDB. This action cannot be undone."
        confirmLabel="Clear Library"
        cancelLabel="Cancel"
        isDanger={true}
        onConfirm={handleConfirmClearAll}
        onCancel={() => setShowClearConfirm(false)}
      />
    </div>
  );
};
