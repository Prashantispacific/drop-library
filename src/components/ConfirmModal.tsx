import React, { useEffect } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { triggerHaptic, registerBackButtonHandler } from '../native/bridge';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDanger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  isDanger = true,
  onConfirm,
  onCancel,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const unregister = registerBackButtonHandler(() => {
      onCancel();
      return true;
    });
    return unregister;
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    triggerHaptic(isDanger ? 'warning' : 'light');
    onConfirm();
  };

  const handleCancel = () => {
    triggerHaptic('light');
    onCancel();
  };

  return (
    <div
      onClick={handleCancel}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md transition-opacity duration-200"
      style={{
        paddingBottom: 'calc(max(env(safe-area-inset-bottom, 0px), 0px) + 1.5rem)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-[#141414] border border-white/15 shadow-2xl p-5 text-[#E2E2E2] flex flex-col space-y-4 animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                isDanger
                  ? 'bg-rose-500/15 border border-rose-500/30 text-rose-400'
                  : 'bg-amber-500/15 border border-amber-500/30 text-amber-400'
              }`}
            >
              {isDanger ? <Trash2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-semibold text-white leading-tight">{title}</h3>
              <p className="text-xs text-neutral-400 mt-1 leading-relaxed">{message}</p>
            </div>
          </div>
          <button
            onClick={handleCancel}
            className="p-1 rounded-lg text-neutral-500 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center space-x-2.5 pt-2 border-t border-white/[0.08]">
          <button
            type="button"
            onClick={handleCancel}
            className="flex-1 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium text-neutral-300 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold text-white shadow-sm transition-colors ${
              isDanger
                ? 'bg-rose-600 hover:bg-rose-500 border border-rose-500/40'
                : 'bg-white text-black hover:bg-neutral-200'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
