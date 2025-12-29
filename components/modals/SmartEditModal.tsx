
import React, { useState, useEffect } from 'react';
import { ElementContext } from '../../types/smart-edit';

interface SmartEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  elementContext: ElementContext | null;
  onSubmit: (prompt: string, context: ElementContext) => void;
  projectId?: string;
}

export function SmartEditModal({ isOpen, onClose, elementContext, onSubmit, projectId }: SmartEditModalProps) {
  const [prompt, setPrompt] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPrompt('');
    }
  }, [isOpen]);

  const handleSubmit = () => {
    if (prompt.trim() && elementContext) {
      onSubmit(prompt, elementContext);
      onClose();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!projectId) {
      alert('Project ID is missing. Cannot upload files.');
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`/api/assets/${projectId}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const data = await response.json();
      if (data.success) {
        // Append relative path to prompt
        const relativePath = `@/assets/${data.filename}`;
        setPrompt(prev => {
           const prefix = prev ? prev + ' ' : '';
           return prefix + relativePath + ' ';
        });
      } else {
        alert('Upload failed: ' + data.error);
      }
    } catch (error) {
           console.error('File upload error:', error);
           alert('Failed to upload file.');
    } finally {
      setIsUploading(false);
      // Reset input so same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        handleSubmit();
    }
  };

  if (!isOpen || !elementContext) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <div 
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-auto flex flex-col max-h-[90vh]"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Edit with AI</h1>
            <p className="text-sm text-gray-500 mt-1">
              Describe how you want to modify this element
            </p>
          </div>
          
          <button
            onClick={onClose}
            className="p-2 transition-colors text-gray-400 hover:text-gray-600"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6L18 18" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          {/* Element Context Summary */}
          <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono">
            <div className="flex justify-between items-start mb-2">
                <span className="font-bold text-blue-600">&lt;{elementContext.tagName.toLowerCase()}&gt;</span>
                <span className="text-gray-400 text-xs">Selector: {elementContext.selector}</span>
            </div>
            {elementContext.id && <div className="text-gray-600">ID: {elementContext.id}</div>}
            {elementContext.className && <div className="text-gray-600">Class: {elementContext.className}</div>}
            
            <div className="mt-2 pt-2 border-t border-gray-200 text-gray-800 whitespace-pre-wrap line-clamp-3 italic">
              &quot;{elementContext.innerText.substring(0, 150)}{elementContext.innerText.length > 150 ? '...' : ''}&quot;
            </div>
            
            <div className="mt-2 flex gap-4 text-xs text-gray-500">
                <div>Width: {Math.round(elementContext.rect.width)}px</div>
                <div>Height: {Math.round(elementContext.rect.height)}px</div>
            </div>
          </div>

          {/* Prompt Input */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Your Instruction
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., Change the background color to blue, increase padding, and make the text larger."
              className="w-full h-32 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
              autoFocus
            />
            <div className="text-right text-xs text-gray-400">
                Cmd+Enter to submit
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 flex justify-between gap-3 bg-gray-50 rounded-b-2xl">
          <div className="flex items-center">
             <input 
               type="file" 
               ref={fileInputRef}
               className="hidden"
               onChange={handleFileUpload}
             />
             <button
               type="button"
               onClick={() => fileInputRef.current?.click()}
               disabled={isUploading || !projectId}
               className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                 isUploading ? 'text-gray-400 cursor-not-allowed' : 
                 !projectId ? 'text-gray-300 cursor-not-allowed' :
                 'text-gray-600 hover:bg-gray-200'
               }`}
               title={!projectId ? 'Project ID missing' : 'Upload file to prompt'}
             >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                   <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {isUploading ? 'Uploading...' : 'Attach File'}
             </button>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!prompt.trim()}
              className={`px-4 py-2 text-white rounded-lg font-medium transition-colors shadow-sm flex items-center gap-2 ${
                  !prompt.trim() ? 'bg-blue-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              <span>Submit Request</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
