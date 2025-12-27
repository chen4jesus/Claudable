"use client";

import React from 'react';
import { AnimatePresence } from 'framer-motion';
import { MotionDiv } from '@/lib/motion';
import { AlertCircle, CheckCircle2, Info, XCircle, X } from 'lucide-react';

export type ModalType = 'error' | 'success' | 'info' | 'confirm' | 'warning';

interface StatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: ModalType;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
}

export function StatusModal({
  isOpen,
  onClose,
  type,
  title,
  message,
  confirmLabel = 'Close',
  cancelLabel = 'Cancel',
  onConfirm
}: StatusModalProps) {
  
  const getIcon = () => {
    switch (type) {
      case 'error': return <XCircle className="w-12 h-12 text-red-500" />;
      case 'success': return <CheckCircle2 className="w-12 h-12 text-green-500" />;
      case 'confirm':
      case 'warning': return <AlertCircle className="w-12 h-12 text-amber-500" />;
      default: return <Info className="w-12 h-12 text-blue-500" />;
    }
  };

  const getButtonClass = () => {
    switch (type) {
      case 'error': return 'bg-red-600 hover:bg-red-700 focus:ring-red-500';
      case 'success': return 'bg-green-600 hover:bg-green-700 focus:ring-green-500';
      case 'confirm':
      case 'warning': return 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500';
      default: return 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500';
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <MotionDiv
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          
          <MotionDiv
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="p-8 pb-6 flex flex-col items-center text-center">
              <div className="mb-4">
                {getIcon()}
              </div>
              
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                {title}
              </h2>
              
              <div className="text-gray-600 leading-relaxed whitespace-pre-wrap">
                {message}
              </div>
            </div>

            <div className="p-6 bg-gray-50 flex gap-3 justify-center">
              {type === 'confirm' && (
                <button
                  onClick={onClose}
                  className="px-6 py-2.5 rounded-xl font-semibold text-gray-700 border border-gray-300 hover:bg-white transition-all active:scale-95"
                >
                  {cancelLabel}
                </button>
              )}
              
              <button
                onClick={() => {
                  if (onConfirm) onConfirm();
                  onClose();
                }}
                className={`px-8 py-2.5 rounded-xl font-semibold text-white shadow-lg transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2 ${getButtonClass()}`}
              >
                {type === 'confirm' ? confirmLabel : (confirmLabel || 'OK')}
              </button>
            </div>
          </MotionDiv>
        </div>
      )}
    </AnimatePresence>
  );
}
