import React from 'react';
import { X, AlertCircle, CheckCircle2, HelpCircle } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: () => void;
  title: string;
  message: string;
  type?: 'info' | 'success' | 'error' | 'confirm';
}

export const Modal: React.FC<ModalProps> = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message, 
  type = 'info' 
}) => {
  if (!isOpen) return null;

  const getIcon = () => {
    switch (type) {
      case 'success': return <CheckCircle2 className="w-6 h-6 text-emerald-400" />;
      case 'error': return <AlertCircle className="w-6 h-6 text-red-400" />;
      case 'confirm': return <HelpCircle className="w-6 h-6 text-blue-400" />;
      default: return <AlertCircle className="w-6 h-6 text-indigo-400" />;
    }
  };

  const getAccentColor = () => {
    switch (type) {
      case 'success': return 'border-emerald-500/50';
      case 'error': return 'border-red-500/50';
      case 'confirm': return 'border-blue-500/50';
      default: return 'border-primary/50';
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className={`w-full max-w-md glass-morphism rounded-xl border ${getAccentColor()} shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-3">
            {getIcon()}
            <h3 className="font-bold text-lg text-white">{title}</h3>
          </div>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6">
          <p className="text-gray-300 leading-relaxed">{message}</p>
        </div>
        
        <div className="p-4 bg-white/5 border-t border-white/10 flex justify-end gap-3">
          {type === 'confirm' ? (
            <>
              <button 
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  if (onConfirm) onConfirm();
                  onClose();
                }}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-lg shadow-blue-500/20 transition-all"
              >
                Confirm
              </button>
            </>
          ) : (
            <button 
              onClick={onClose}
              className="px-6 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-medium shadow-lg shadow-primary/20 transition-all"
            >
              OK
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
