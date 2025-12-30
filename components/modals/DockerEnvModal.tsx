"use client";

import React, { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { MotionDiv } from '@/lib/motion';
import { X, Settings, Eye, EyeOff, RefreshCw, Save, AlertCircle, CheckCircle2 } from 'lucide-react';

export interface EnvVariable {
  name: string;
  defaultValue: string;
  currentValue: string;
  isRequired: boolean;
  isSensitive: boolean;
  description?: string;
}

interface DockerEnvModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  onSave?: (variables: Record<string, string>) => void;
}

export function DockerEnvModal({ isOpen, onClose, projectId, onSave }: DockerEnvModalProps) {
  const [variables, setVariables] = useState<EnvVariable[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Fetch environment variables when modal opens
  useEffect(() => {
    const fetchVariables = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/projects/${projectId}/docker-env`);
        const data = await res.json();
        
        if (data.error) {
          throw new Error(data.error);
        }
        
        setVariables(data.variables || []);
        
        // Initialize values with current or default values
        const initialValues: Record<string, string> = {};
        for (const v of data.variables || []) {
          initialValues[v.name] = v.currentValue || v.defaultValue || '';
        }
        setValues(initialValues);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    if (isOpen && projectId) {
      fetchVariables();
    }
  }, [isOpen, projectId]);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/docker-env`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variables: values })
      });
      
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save');
      }
      
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
      
      if (onSave) {
        onSave(values);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const togglePasswordVisibility = (name: string) => {
    setShowPasswords(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const handleValueChange = (name: string, value: string) => {
    setValues(prev => ({ ...prev, [name]: value }));
  };

  // Check if all required fields are filled
  const hasRequiredEmpty = variables.some(v => v.isRequired && !values[v.name]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <MotionDiv
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={onClose}
          />
          
          <MotionDiv
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 rounded-xl">
                  <Settings className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-800 tracking-tight">Environment Variables</h2>
                  <p className="text-xs font-medium text-slate-400 mt-0.5">Configure variables from docker-compose.yml</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="w-6 h-6 text-indigo-500 animate-spin" />
                  <span className="ml-3 text-sm font-medium text-slate-500">Loading variables...</span>
                </div>
              ) : error ? (
                <div className="flex items-center gap-3 p-4 bg-rose-50 border border-rose-100 rounded-xl">
                  <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />
                  <p className="text-sm font-medium text-rose-700">{error}</p>
                </div>
              ) : variables.length === 0 ? (
                <div className="text-center py-12">
                  <Settings className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                  <p className="text-slate-500 font-medium">No environment variables found</p>
                  <p className="text-slate-400 text-sm mt-1">The docker-compose.yml has no configurable variables</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {variables.map((variable) => (
                    <div key={variable.name} className="group">
                      <div className="flex items-center gap-2 mb-1.5">
                        <label className="text-xs font-black uppercase text-slate-500 tracking-wider">
                          {variable.name}
                        </label>
                        {variable.isRequired && (
                          <span className="text-[9px] font-bold uppercase text-rose-500 bg-rose-50 px-1.5 py-0.5 rounded">
                            Required
                          </span>
                        )}
                        {variable.isSensitive && (
                          <span className="text-[9px] font-bold uppercase text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                            Sensitive
                          </span>
                        )}
                      </div>
                      
                      <div className="relative">
                        <input
                          type={variable.isSensitive && !showPasswords[variable.name] ? 'password' : 'text'}
                          value={values[variable.name] || ''}
                          onChange={(e) => handleValueChange(variable.name, e.target.value)}
                          placeholder={variable.defaultValue || `Enter ${variable.name}...`}
                          className={`w-full bg-slate-50 border rounded-xl px-4 py-3 pr-12 text-sm font-medium outline-none transition-all placeholder:text-slate-300 ${
                            variable.isRequired && !values[variable.name]
                              ? 'border-rose-200 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/10'
                              : 'border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 focus:bg-white'
                          }`}
                        />
                        
                        {variable.isSensitive && (
                          <button
                            type="button"
                            onClick={() => togglePasswordVisibility(variable.name)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
                          >
                            {showPasswords[variable.name] ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>
                        )}
                      </div>
                      
                      {variable.defaultValue && (
                        <p className="text-[10px] font-medium text-slate-400 mt-1.5 ml-1">
                          Default: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">{variable.defaultValue}</code>
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                {success && (
                  <div className="flex items-center gap-1.5 text-emerald-600 animate-in fade-in slide-in-from-left-2">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="text-xs font-bold">Saved!</span>
                  </div>
                )}
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving || isLoading || hasRequiredEmpty}
                  className={`flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white rounded-xl shadow-lg transition-all ${
                    isSaving || isLoading || hasRequiredEmpty
                      ? 'bg-slate-300 cursor-not-allowed'
                      : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/20 active:scale-95'
                  }`}
                >
                  {isSaving ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Save Variables
                    </>
                  )}
                </button>
              </div>
            </div>
          </MotionDiv>
        </div>
      )}
    </AnimatePresence>
  );
}
