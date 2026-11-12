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
  Plus,
  Server,
  Bot,
  Zap,
  Layers,
  Activity,
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Bookmark,
} from 'lucide-react';
import { enrichWithGemini } from '../services/gemini';
import { enrichWithCustomAi } from '../services/customAi';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: LibraryItem[];
}

interface ModelOption {
  id: string;
  name: string;
  tag: string;
  badgeClass: string;
  description: string;
}

const SUPPORTED_MODELS: ModelOption[] = [
  {
    id: 'gemini-3.5-flash-lite',
    name: 'Gemini 3.5 Flash-Lite',
    tag: 'Recommended / Fast',
    badgeClass: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
    description: 'Fastest, most cost-effective model for high-throughput structuring.',
  },
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    tag: 'High Reasoning',
    badgeClass: 'text-purple-400 bg-purple-500/10 border-purple-500/25',
    description: 'Flagship Flash for complex structuring, nuanced tags & article synthesis.',
  },
  {
    id: 'gemini-4-hydrogen',
    name: 'Gemini 4 Hydrogen',
    tag: 'Gemini 4 Frontier',
    badgeClass: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/25',
    description: 'Speed and efficiency for everyday coding and agentic workflows (1M context).',
  },
  {
    id: 'gemini-4-argon',
    name: 'Gemini 4 Argon',
    tag: 'Efficient Reasoning',
    badgeClass: 'text-amber-400 bg-amber-500/10 border-amber-500/25',
    description: 'Frontier reasoning with lower token spend per turn across complex tasks.',
  },
  {
    id: 'gemini-4-carbon',
    name: 'Gemini 4 Carbon',
    tag: 'Flagship Reasoning',
    badgeClass: 'text-rose-400 bg-rose-500/10 border-rose-500/25',
    description: 'Strongest reasoning model for complex engineering & multimodal knowledge work.',
  },
  {
    id: 'gemini-3.6-flash',
    name: 'Gemini 3.6 Flash',
    tag: 'Stable Multimodal',
    badgeClass: 'text-blue-400 bg-blue-500/10 border-blue-500/25',
    description: 'Balances speed and multimodal capabilities across everyday tasks.',
  },
];

interface CustomPreset {
  name: string;
  url: string;
  model: string;
  badge: string;
}

const CUSTOM_PRESETS: CustomPreset[] = [
  {
    name: 'OpenRouter',
    url: 'https://openrouter.ai/api/v1',
    model: 'meta-llama/llama-3.3-70b-instruct',
    badge: 'Multi-Model',
  },
  {
    name: 'NVIDIA NIM',
    url: 'https://integrate.api.nvidia.com/v1',
    model: 'meta/llama-3.1-70b-instruct',
    badge: 'Ultra Fast',
  },
  {
    name: 'Groq',
    url: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    badge: 'LPU Speed',
  },
  {
    name: 'Ollama (Local)',
    url: 'http://localhost:11434/v1',
    model: 'llama3.2',
    badge: 'Offline',
  },
];

interface PopularCustomModel {
  id: string;
  name: string;
  badge: string;
}

const POPULAR_CUSTOM_MODELS: PopularCustomModel[] = [
  { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', badge: 'Llama 3.3' },
  { id: 'meta/llama-3.1-70b-instruct', name: 'NVIDIA Llama 3.1 70B', badge: 'NIM' },
  { id: 'llama-3.3-70b-versatile', name: 'Groq Llama 3.3', badge: 'Groq LPU' },
  { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1', badge: 'Reasoning' },
  { id: 'qwen/qwen-2.5-72b-instruct', name: 'Qwen 2.5 72B', badge: 'Qwen 2.5' },
  { id: 'mistralai/mistral-large-2411', name: 'Mistral Large', badge: 'Mistral' },
  { id: 'llama3.2', name: 'Llama 3.2', badge: 'Ollama' },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  items,
}) => {
  const [_settings, setSettings] = useState<UserSettings | null>(null);
  const [aiProvider, setAiProvider] = useState<'gemini' | 'custom'>('gemini');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('gemini-3.5-flash-lite');
  const [customApiUrl, setCustomApiUrl] = useState('');
  const [customApiKey, setCustomApiKey] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [savedGeminiModels, setSavedGeminiModels] = useState<string[]>([]);
  const [savedCustomModels, setSavedCustomModels] = useState<string[]>([]);
  const [isGeminiModelsExpanded, setIsGeminiModelsExpanded] = useState(false);
  const [isCustomModelsExpanded, setIsCustomModelsExpanded] = useState(false);
  const [newGeminiModelInput, setNewGeminiModelInput] = useState('');
  const [newCustomModelInput, setNewCustomModelInput] = useState('');
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
  const [testStatus, setTestStatus] = useState<{
    loading: boolean;
    success?: boolean;
    message?: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleTestConnection = async () => {
    setTestStatus({ loading: true, message: 'Sending test request...' });
    triggerHaptic('light');

    try {
      if (aiProvider === 'custom') {
        if (!customApiUrl.trim()) {
          throw new Error('Please enter a Custom API Endpoint URL first.');
        }
        await enrichWithCustomAi(
          {
            platform: 'text',
            rawShareText: 'Quick integration test for Drop Library custom AI provider',
          },
          {
            apiUrl: customApiUrl.trim(),
            apiKey: customApiKey.trim(),
            model: customModel.trim() || 'meta-llama/llama-3.3-70b-instruct',
          }
        );
        setTestStatus({
          loading: false,
          success: true,
          message: `Connected successfully! Provider responded with valid metadata.`,
        });
        triggerHaptic('success');
      } else {
        if (!apiKey.trim()) {
          throw new Error('Please enter your Google AI Studio API key first.');
        }
        await enrichWithGemini({
          platform: 'text',
          rawShareText: 'Quick integration test for Drop Library Gemini AI',
        });
        setTestStatus({
          loading: false,
          success: true,
          message: `Connected successfully! ${model} responded with valid metadata.`,
        });
        triggerHaptic('success');
      }
    } catch (err: unknown) {
      console.error('[SettingsModal] Test connection failed:', err);
      setTestStatus({
        loading: false,
        success: false,
        message: (err as Error)?.message || String(err),
      });
      triggerHaptic('error');
    }
  };

  const showFeedback = (msg: string) => {
    setFeedbackMessage(msg);
    setTimeout(() => setFeedbackMessage(null), 3000);
  };

  useEffect(() => {
    if (!isOpen) return;
    storage.getSettings().then((s) => {
      setSettings(s);
      setAiProvider(s.aiProvider || 'gemini');
      setApiKey(s.geminiApiKey || '');
      setBaseUrl(s.geminiBaseUrl || '');
      const loadedModel = s.geminiModel || 'gemini-3.5-flash-lite';
      setModel(loadedModel);
      setCustomApiUrl(s.customApiUrl || '');
      setCustomApiKey(s.customApiKey || '');
      setCustomModel(s.customModel || '');
      setSavedGeminiModels(s.savedGeminiModels || []);
      setSavedCustomModels(s.savedCustomModels || []);
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

  const handleAddGeminiModel = async (modelToAdd?: string) => {
    const targetModel = (modelToAdd || newGeminiModelInput).trim();
    if (!targetModel) return;

    if (!savedGeminiModels.includes(targetModel) && !SUPPORTED_MODELS.some((m) => m.id === targetModel)) {
      const updated = [...savedGeminiModels, targetModel];
      setSavedGeminiModels(updated);
      setModel(targetModel);
      setNewGeminiModelInput('');
      triggerHaptic('success');
      showFeedback(`Saved Gemini model "${targetModel}"`);
      await storage.saveSettings({ savedGeminiModels: updated, geminiModel: targetModel });
    } else {
      setModel(targetModel);
      setNewGeminiModelInput('');
      triggerHaptic('light');
    }
  };

  const handleDeleteGeminiModel = async (modelToDelete: string, e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic('light');
    const updated = savedGeminiModels.filter((m) => m !== modelToDelete);
    setSavedGeminiModels(updated);
    let nextModel = model;
    if (model === modelToDelete) {
      nextModel = SUPPORTED_MODELS[0].id;
      setModel(nextModel);
    }
    showFeedback(`Removed "${modelToDelete}"`);
    await storage.saveSettings({ savedGeminiModels: updated, geminiModel: nextModel });
  };

  const handleAddCustomModel = async (modelToAdd?: string) => {
    const targetModel = (modelToAdd || newCustomModelInput).trim();
    if (!targetModel) return;

    if (!savedCustomModels.includes(targetModel)) {
      const updated = [...savedCustomModels, targetModel];
      setSavedCustomModels(updated);
      setCustomModel(targetModel);
      setNewCustomModelInput('');
      triggerHaptic('success');
      showFeedback(`Saved custom model "${targetModel}"`);
      await storage.saveSettings({ savedCustomModels: updated, customModel: targetModel });
    } else {
      setCustomModel(targetModel);
      setNewCustomModelInput('');
      triggerHaptic('light');
    }
  };

  const handleDeleteCustomModel = async (modelToDelete: string, e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic('light');
    const updated = savedCustomModels.filter((m) => m !== modelToDelete);
    setSavedCustomModels(updated);
    let nextModel = customModel;
    if (customModel === modelToDelete) {
      nextModel = updated[0] || 'meta-llama/llama-3.3-70b-instruct';
      setCustomModel(nextModel);
    }
    showFeedback(`Removed "${modelToDelete}"`);
    await storage.saveSettings({ savedCustomModels: updated, customModel: nextModel });
  };

  if (!isOpen) return null;

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    triggerHaptic('light');

    const updated = await storage.saveSettings({
      aiProvider,
      geminiApiKey: apiKey.trim(),
      geminiBaseUrl: baseUrl.trim(),
      geminiModel: model.trim(),
      savedGeminiModels,
      customApiUrl: customApiUrl.trim(),
      customApiKey: customApiKey.trim(),
      customModel: customModel.trim(),
      savedCustomModels,
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
          {/* AI Provider Mode Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300 flex items-center space-x-1.5">
                <Bot className="w-3.5 h-3.5 text-cyan-400" />
                <span>Primary AI Engine</span>
              </label>
              <span className="text-[10px] text-cyan-400/80 font-mono">
                {aiProvider === 'gemini' ? 'Google Gemini (Default)' : 'Custom / OpenAI-Compatible'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setAiProvider('gemini');
                  triggerHaptic('light');
                }}
                className={`p-3 rounded-xl border text-left transition-all ${
                  aiProvider === 'gemini'
                    ? 'bg-cyan-500/[0.08] border-cyan-500/40 text-white ring-1 ring-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.1)]'
                    : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04] text-neutral-400'
                }`}
              >
                <div className="flex items-center space-x-1.5 font-semibold text-xs text-cyan-300">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Google Gemini</span>
                </div>
                <p className="text-[10px] text-neutral-400 mt-1 leading-snug">
                  Fast native multimodal OCR & free-tier structuring.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAiProvider('custom');
                  triggerHaptic('light');
                }}
                className={`p-3 rounded-xl border text-left transition-all ${
                  aiProvider === 'custom'
                    ? 'bg-amber-500/[0.08] border-amber-500/40 text-white ring-1 ring-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.1)]'
                    : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04] text-neutral-400'
                }`}
              >
                <div className="flex items-center space-x-1.5 font-semibold text-xs text-amber-300">
                  <Server className="w-3.5 h-3.5" />
                  <span>Custom Provider</span>
                </div>
                <p className="text-[10px] text-neutral-400 mt-1 leading-snug">
                  NVIDIA NIM, Llama, OpenRouter, Groq, or Ollama.
                </p>
              </button>
            </div>
          </div>

          {/* SECTION 1: Google Gemini Configuration */}
          <div className={`space-y-4 p-4 rounded-2xl border transition-all ${
            aiProvider === 'gemini'
              ? 'bg-cyan-500/[0.02] border-cyan-500/20'
              : 'bg-white/[0.01] border-white/[0.06]'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-cyan-300 flex items-center space-x-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span>{aiProvider === 'gemini' ? 'Google Gemini Settings (Primary)' : 'Google Gemini Settings (Fallback)'}</span>
              </span>
              <span className="text-[10px] text-neutral-500 font-mono">Official SDK</span>
            </div>

            {/* BYOK: Google AI Studio API Key */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-medium text-neutral-300 flex items-center space-x-1.5">
                  <Key className="w-3 h-3 text-amber-400" />
                  <span>Google AI Studio Key (BYOK)</span>
                </label>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-neutral-400 hover:text-white flex items-center space-x-1 underline"
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
                className="w-full bg-black/40 border border-white/[0.08] focus:border-cyan-500/40 focus:outline-none rounded-xl px-3 py-2 text-xs font-mono text-[#E2E2E2] placeholder-neutral-600 transition-colors"
              />
              <p className="text-[10px] text-neutral-500 leading-relaxed">
                Public repo safe: Kept strictly on-device in IndexedDB. Never transmitted to third parties.
              </p>
            </div>

            {/* Custom Gemini API URL / Gateway (Optional) */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-medium text-neutral-300 flex items-center space-x-1.5">
                  <Server className="w-3 h-3 text-amber-400" />
                  <span>Custom Gemini Proxy URL (Optional)</span>
                </label>
                <span className="text-[10px] text-amber-400/80 font-mono">
                  {baseUrl ? 'Proxy Active' : 'Official Google AI'}
                </span>
              </div>
              <input
                type="url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="e.g. https://gateway.ai.cloudflare.com/... or https://my-proxy.com"
                className="w-full bg-black/40 border border-white/[0.08] focus:border-amber-400/40 focus:outline-none rounded-xl px-3 py-2 text-xs font-mono text-[#E2E2E2] placeholder-neutral-600 transition-colors"
              />
              <p className="text-[10px] text-neutral-500">
                Leave blank for official Google AI. Custom proxy will automatically fall back to Google if unreachable.
              </p>
            </div>

            {/* Model Selection - Collapsible OLED Card Selector */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-medium text-neutral-300 flex items-center space-x-1.5">
                  <Cpu className="w-3 h-3 text-cyan-400" />
                  <span>Gemini Model</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setIsGeminiModelsExpanded(!isGeminiModelsExpanded);
                    triggerHaptic('light');
                  }}
                  className="text-[10px] text-cyan-400 hover:text-cyan-300 font-medium flex items-center space-x-1 py-0.5 px-1.5 rounded-md hover:bg-cyan-500/10 transition-colors"
                >
                  <span>{isGeminiModelsExpanded ? 'Collapse' : 'Expand / Switch'}</span>
                  {isGeminiModelsExpanded ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                </button>
              </div>

              {/* Collapsed Active Preview */}
              {!isGeminiModelsExpanded && (
                <button
                  type="button"
                  onClick={() => {
                    setIsGeminiModelsExpanded(true);
                    triggerHaptic('light');
                  }}
                  className="w-full text-left p-2.5 rounded-xl border bg-cyan-500/[0.06] border-cyan-500/30 text-white flex items-center justify-between gap-3 hover:bg-cyan-500/[0.1] transition-all"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-semibold text-cyan-300 truncate">
                        {SUPPORTED_MODELS.find((m) => m.id === model)?.name || model}
                      </span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded border font-mono tracking-tight text-cyan-400 bg-cyan-500/10 border-cyan-500/25 shrink-0">
                        {SUPPORTED_MODELS.find((m) => m.id === model)?.tag || 'Custom Model'}
                      </span>
                    </div>
                    <p className="text-[10px] text-neutral-400 mt-0.5 truncate font-mono">
                      {model}
                    </p>
                  </div>
                  <div className="shrink-0 flex items-center space-x-1 text-xs text-cyan-400">
                    <span className="text-[10px] text-neutral-400">Switch</span>
                    <ChevronDown className="w-3.5 h-3.5" />
                  </div>
                </button>
              )}

              {/* Expanded Model Picker */}
              {isGeminiModelsExpanded && (
                <div className="space-y-2 pt-0.5">
                  <div className="space-y-1.5">
                    {SUPPORTED_MODELS.map((m) => {
                      const isSelected = model === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setModel(m.id);
                            triggerHaptic('light');
                          }}
                          className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                            isSelected
                              ? 'bg-cyan-500/[0.08] border-cyan-500/40 text-white shadow-[0_0_15px_rgba(6,182,212,0.1)] ring-1 ring-cyan-500/20'
                              : 'bg-black/30 border-white/[0.06] hover:bg-white/[0.04] text-neutral-300'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2">
                              <span className={`text-xs font-semibold ${isSelected ? 'text-cyan-300' : 'text-neutral-200'}`}>
                                {m.name}
                              </span>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono tracking-tight ${m.badgeClass}`}>
                                {m.tag}
                              </span>
                            </div>
                            <p className="text-[10px] text-neutral-400 mt-0.5 leading-snug">
                              {m.description}
                            </p>
                          </div>
                          <div className="shrink-0 flex items-center justify-center">
                            {isSelected ? (
                              <div className="w-4 h-4 rounded-full bg-cyan-400 text-black flex items-center justify-center shadow-[0_0_8px_rgba(6,182,212,0.6)]">
                                <Check className="w-2.5 h-2.5 stroke-[3]" />
                              </div>
                            ) : (
                              <div className="w-4 h-4 rounded-full border border-neutral-700 bg-neutral-900/40" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Stored Custom Models List */}
                  {savedGeminiModels.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <div className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider flex items-center space-x-1">
                        <Bookmark className="w-2.5 h-2.5 text-cyan-400" />
                        <span>Your Stored Models</span>
                      </div>
                      <div className="space-y-1">
                        {savedGeminiModels.map((mId) => {
                          const isSelected = model === mId;
                          return (
                            <div
                              key={mId}
                              onClick={() => {
                                setModel(mId);
                                triggerHaptic('light');
                              }}
                              className={`w-full text-left p-2 rounded-xl border transition-all flex items-center justify-between gap-2 cursor-pointer ${
                                isSelected
                                  ? 'bg-cyan-500/[0.08] border-cyan-500/40 text-white ring-1 ring-cyan-500/20'
                                  : 'bg-black/30 border-white/[0.06] hover:bg-white/[0.04] text-neutral-300'
                              }`}
                            >
                              <div className="flex-1 min-w-0 flex items-center space-x-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
                                <span className="text-xs font-mono truncate">{mId}</span>
                              </div>
                              <div className="flex items-center space-x-1.5 shrink-0">
                                {isSelected && (
                                  <span className="text-[9px] text-cyan-400 font-mono">Active</span>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => handleDeleteGeminiModel(mId, e)}
                                  title="Remove stored model"
                                  className="p-1 rounded-lg text-neutral-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Add & Store Custom Model Input */}
                  <div className="p-2.5 rounded-xl bg-black/40 border border-white/[0.08] space-y-2 mt-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-neutral-300 flex items-center space-x-1">
                        <Plus className="w-3 h-3 text-cyan-400" />
                        <span>Add & Store Custom Model</span>
                      </span>
                      <span className="text-[9px] text-neutral-500 font-mono">Saved for 1-tap switch</span>
                    </div>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={newGeminiModelInput}
                        onChange={(e) => setNewGeminiModelInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddGeminiModel();
                          }
                        }}
                        placeholder="e.g. gemini-4-carbon or experimental"
                        className="flex-1 bg-[#161616] border border-white/[0.08] focus:border-cyan-500/40 focus:outline-none rounded-lg px-2.5 py-1.5 text-xs font-mono text-white placeholder-neutral-600 transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddGeminiModel()}
                        disabled={!newGeminiModelInput.trim()}
                        className="px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 text-xs font-medium transition-colors disabled:opacity-40 shrink-0"
                      >
                        + Store
                      </button>
                    </div>
                  </div>

                  {/* Collapse Helper Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsGeminiModelsExpanded(false);
                      triggerHaptic('light');
                    }}
                    className="w-full py-1.5 text-center text-[10px] text-neutral-400 hover:text-white flex items-center justify-center space-x-1 transition-colors"
                  >
                    <span>Collapse model list</span>
                    <ChevronUp className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* SECTION 2: Custom Provider (OpenRouter, NVIDIA NIM, Groq, Ollama, Llama) */}
          <div className={`space-y-3.5 p-4 rounded-2xl border transition-all ${
            aiProvider === 'custom'
              ? 'bg-amber-500/[0.02] border-amber-500/30'
              : 'bg-white/[0.01] border-white/[0.06]'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-300 flex items-center space-x-1.5">
                <Layers className="w-3.5 h-3.5" />
                <span>
                  {aiProvider === 'custom'
                    ? 'Custom Provider (Primary: NVIDIA, Llama, OpenRouter)'
                    : 'Alternative / Fallback Provider (NVIDIA, Llama, OpenRouter)'}
                </span>
              </span>
              <span className="text-[10px] text-amber-400/80 font-mono">OpenAI-Compatible</span>
            </div>

            {/* Quick 1-tap Presets */}
            <div className="space-y-1.5">
              <div className="text-[10px] font-medium text-neutral-400 flex items-center space-x-1">
                <Zap className="w-3 h-3 text-amber-400" />
                <span>Quick 1-Tap Presets:</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {CUSTOM_PRESETS.map((p) => {
                  const isPresetActive = customApiUrl === p.url;
                  return (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => {
                        setCustomApiUrl(p.url);
                        setCustomModel(p.model);
                        triggerHaptic('light');
                      }}
                      className={`p-2 rounded-xl text-left border transition-all ${
                        isPresetActive
                          ? 'bg-amber-500/[0.1] border-amber-500/50 text-white ring-1 ring-amber-500/30'
                          : 'bg-black/30 hover:bg-white/[0.04] border-white/[0.06] text-neutral-300'
                      }`}
                    >
                      <div className="text-[11px] font-semibold text-neutral-200">{p.name}</div>
                      <div className="text-[9px] text-amber-400/80 font-mono mt-0.5">{p.badge}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom API Base URL */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-neutral-300 flex items-center space-x-1">
                <span>API Endpoint URL</span>
                <span className="text-neutral-500 text-[10px]">(e.g. /v1)</span>
              </label>
              <input
                type="url"
                value={customApiUrl}
                onChange={(e) => setCustomApiUrl(e.target.value)}
                placeholder="https://openrouter.ai/api/v1 or https://integrate.api.nvidia.com/v1"
                className="w-full bg-black/40 border border-white/[0.08] focus:border-amber-400/50 focus:outline-none rounded-xl px-3 py-2 text-xs font-mono text-[#E2E2E2] placeholder-neutral-600 transition-colors"
              />
            </div>

            {/* Custom API Key */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-neutral-300 flex items-center space-x-1">
                <span>API Key</span>
                <span className="text-neutral-500 text-[10px]">(BYOK: saved on-device)</span>
              </label>
              <input
                type="password"
                value={customApiKey}
                onChange={(e) => setCustomApiKey(e.target.value)}
                placeholder="sk-or-... or nvapi-... (leave empty for local Ollama)"
                className="w-full bg-black/40 border border-white/[0.08] focus:border-amber-400/50 focus:outline-none rounded-xl px-3 py-2 text-xs font-mono text-[#E2E2E2] placeholder-neutral-600 transition-colors"
              />
            </div>

            {/* Model Selection - Collapsible Custom Model Selector & Stored Models */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-medium text-neutral-300 flex items-center space-x-1.5">
                  <Cpu className="w-3 h-3 text-amber-400" />
                  <span>Model Selection</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomModelsExpanded(!isCustomModelsExpanded);
                    triggerHaptic('light');
                  }}
                  className="text-[10px] text-amber-400 hover:text-amber-300 font-medium flex items-center space-x-1 py-0.5 px-1.5 rounded-md hover:bg-amber-500/10 transition-colors"
                >
                  <span>{isCustomModelsExpanded ? 'Collapse' : 'Expand / Switch'}</span>
                  {isCustomModelsExpanded ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                </button>
              </div>

              {/* Collapsed Active Preview */}
              {!isCustomModelsExpanded && (
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomModelsExpanded(true);
                    triggerHaptic('light');
                  }}
                  className="w-full text-left p-2.5 rounded-xl border bg-amber-500/[0.06] border-amber-500/30 text-white flex items-center justify-between gap-3 hover:bg-amber-500/[0.1] transition-all"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-semibold text-amber-300 truncate font-mono">
                        {customModel || 'None Selected'}
                      </span>
                      {customModel && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded border font-mono tracking-tight text-amber-400 bg-amber-500/10 border-amber-500/25 shrink-0">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-neutral-400 mt-0.5 truncate">
                      {POPULAR_CUSTOM_MODELS.find((p) => p.id === customModel)?.name || 'Custom / Preset Model'}
                    </p>
                  </div>
                  <div className="shrink-0 flex items-center space-x-1 text-xs text-amber-400">
                    <span className="text-[10px] text-neutral-400">Switch</span>
                    <ChevronDown className="w-3.5 h-3.5" />
                  </div>
                </button>
              )}

              {/* Expanded Model Picker */}
              {isCustomModelsExpanded && (
                <div className="space-y-2.5 pt-0.5">
                  {/* Direct Model ID Input */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-neutral-400">Active Model ID:</span>
                      <span className="text-[9px] text-neutral-500 font-mono">Editable directly</span>
                    </div>
                    <input
                      type="text"
                      value={customModel}
                      onChange={(e) => setCustomModel(e.target.value)}
                      placeholder="e.g. meta-llama/llama-3.3-70b-instruct or meta/llama-3.1-70b-instruct"
                      className="w-full bg-black/40 border border-white/[0.08] focus:border-amber-400/50 focus:outline-none rounded-xl px-3 py-2 text-xs font-mono text-[#E2E2E2] placeholder-neutral-600 transition-colors"
                    />
                  </div>

                  {/* Popular / Tested Models for 1-Tap Switch */}
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-medium text-neutral-400 flex items-center space-x-1">
                      <Zap className="w-3 h-3 text-amber-400" />
                      <span>Popular Open-Source Models:</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {POPULAR_CUSTOM_MODELS.map((p) => {
                        const isSelected = customModel === p.id;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setCustomModel(p.id);
                              triggerHaptic('light');
                            }}
                            className={`p-2 rounded-xl text-left border transition-all flex items-center justify-between ${
                              isSelected
                                ? 'bg-amber-500/[0.1] border-amber-500/50 text-white ring-1 ring-amber-500/30'
                                : 'bg-black/30 hover:bg-white/[0.04] border-white/[0.06] text-neutral-300'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="text-[11px] font-semibold text-neutral-200 truncate">{p.name}</div>
                              <div className="text-[9px] text-amber-400/80 font-mono truncate">{p.badge}</div>
                            </div>
                            {isSelected && (
                              <div className="w-3.5 h-3.5 rounded-full bg-amber-400 text-black flex items-center justify-center shrink-0 ml-1">
                                <Check className="w-2 h-2 stroke-[3]" />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Stored Custom Models List */}
                  {savedCustomModels.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <div className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider flex items-center space-x-1">
                        <Bookmark className="w-2.5 h-2.5 text-amber-400" />
                        <span>Your Stored Models</span>
                      </div>
                      <div className="space-y-1">
                        {savedCustomModels.map((mId) => {
                          const isSelected = customModel === mId;
                          return (
                            <div
                              key={mId}
                              onClick={() => {
                                setCustomModel(mId);
                                triggerHaptic('light');
                              }}
                              className={`w-full text-left p-2 rounded-xl border transition-all flex items-center justify-between gap-2 cursor-pointer ${
                                isSelected
                                  ? 'bg-amber-500/[0.08] border-amber-500/40 text-white ring-1 ring-amber-500/20'
                                  : 'bg-black/30 border-white/[0.06] hover:bg-white/[0.04] text-neutral-300'
                              }`}
                            >
                              <div className="flex-1 min-w-0 flex items-center space-x-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                                <span className="text-xs font-mono truncate">{mId}</span>
                              </div>
                              <div className="flex items-center space-x-1.5 shrink-0">
                                {isSelected && (
                                  <span className="text-[9px] text-amber-400 font-mono">Active</span>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => handleDeleteCustomModel(mId, e)}
                                  title="Remove stored model"
                                  className="p-1 rounded-lg text-neutral-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Add & Store Custom Model Input */}
                  <div className="p-2.5 rounded-xl bg-black/40 border border-white/[0.08] space-y-2 mt-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-neutral-300 flex items-center space-x-1">
                        <Plus className="w-3 h-3 text-amber-400" />
                        <span>Add & Store Custom Model</span>
                      </span>
                      <span className="text-[9px] text-neutral-500 font-mono">Saved for 1-tap switch</span>
                    </div>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={newCustomModelInput}
                        onChange={(e) => setNewCustomModelInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddCustomModel();
                          }
                        }}
                        placeholder="e.g. deepseek-ai/deepseek-v3 or mistral-large"
                        className="flex-1 bg-[#161616] border border-white/[0.08] focus:border-amber-400/40 focus:outline-none rounded-lg px-2.5 py-1.5 text-xs font-mono text-white placeholder-neutral-600 transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddCustomModel()}
                        disabled={!newCustomModelInput.trim()}
                        className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-medium transition-colors disabled:opacity-40 shrink-0"
                      >
                        + Store
                      </button>
                    </div>
                  </div>

                  {/* Collapse Helper Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomModelsExpanded(false);
                      triggerHaptic('light');
                    }}
                    className="w-full py-1.5 text-center text-[10px] text-neutral-400 hover:text-white flex items-center justify-center space-x-1 transition-colors"
                  >
                    <span>Collapse model list</span>
                    <ChevronUp className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>

            <p className="text-[10px] text-neutral-500 leading-relaxed">
              {aiProvider === 'custom'
                ? 'Active engine. If this provider is unreachable or fails, Drop Library automatically falls back to Google Gemini.'
                : 'Automatic Fallback: If Google Gemini hits rate limits (429) or quota errors, Drop Library will seamlessly switch to this provider.'}
            </p>

            {/* Test Connection Button & Live Feedback */}
            <div className="pt-1 space-y-2">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testStatus?.loading}
                className="w-full py-2 px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.1] text-xs font-medium text-neutral-200 flex items-center justify-center space-x-2 transition-colors disabled:opacity-50"
              >
                <Activity
                  className={`w-3.5 h-3.5 ${
                    testStatus?.loading ? 'animate-spin text-amber-400' : 'text-neutral-400'
                  }`}
                />
                <span>
                  {testStatus?.loading
                    ? 'Testing Connection...'
                    : `Test ${aiProvider === 'custom' ? 'Custom Provider' : 'Gemini'} Connection`}
                </span>
              </button>

              {testStatus && !testStatus.loading && (
                <div
                  className={`p-2.5 rounded-xl border text-xs flex items-start space-x-2 leading-relaxed ${
                    testStatus.success
                      ? 'bg-emerald-500/[0.08] border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/[0.08] border-rose-500/30 text-rose-300'
                  }`}
                >
                  {testStatus.success ? (
                    <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 break-words font-mono text-[11px]">
                    {testStatus.message}
                  </div>
                </div>
              )}
            </div>
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
