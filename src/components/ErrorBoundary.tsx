import React from 'react';
import { AlertTriangle, RotateCw, Download } from 'lucide-react';
import { storage } from '../services/storage';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const message =
      error instanceof Error ? error.message : 'An unexpected rendering error occurred.';
    return { hasError: true, errorMessage: message };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught UI error:', error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleEmergencyBackup = async () => {
    try {
      const json = await storage.exportBackup();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `drop-library-emergency-backup-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[ErrorBoundary] Emergency backup failed:', err);
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0A0A0A] text-[#E2E2E2] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-[#121212] border border-white/[0.1] rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center space-x-3 text-amber-400">
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">Something went wrong</h2>
                <p className="text-xs text-neutral-400">
                  Your local vault data in IndexedDB is safe.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-black/50 border border-white/[0.06] text-xs font-mono text-neutral-400 break-words max-h-28 overflow-y-auto">
              {this.state.errorMessage}
            </div>

            <div className="flex items-center space-x-2.5 pt-1">
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 py-2.5 px-4 rounded-xl bg-white text-black font-semibold text-xs flex items-center justify-center space-x-1.5 hover:bg-neutral-200 transition-colors"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Reload App</span>
              </button>
              <button
                type="button"
                onClick={this.handleEmergencyBackup}
                className="py-2.5 px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-neutral-200 text-xs font-medium flex items-center justify-center space-x-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Backup</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
