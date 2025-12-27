/**
 * Settings Modal Base Component
 * Provides modal wrapper for settings
 */
import React, { ReactNode } from 'react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function SettingsModal({ isOpen, onClose, title, icon, children, className }: SettingsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className={`absolute inset-y-0 right-0 ${className || 'max-w-3xl'} w-full bg-white shadow-2xl flex flex-col transition-all duration-300 ease-in-out`}>
        {/* Header */}
        <div className="px-6 py-3 bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200 ">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {icon && (
                <div className="p-1.5 bg-white rounded-lg shadow-sm text-gray-600 scale-90">
                  {icon}
                </div>
              )}
              <div>
                <h2 className="text-lg font-bold text-slate-800 leading-tight">
                  {title}
                </h2>
                <p className="text-[10px] text-slate-400 font-medium tracking-tight">
                  {title === 'Project Settings' ? 'Configure project parameters' : 'System preferences'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-200 rounded-lg text-gray-400 hover:text-gray-600 transition-all"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden bg-gray-50 ">
          {children}
        </div>
      </div>
    </div>
  );
}