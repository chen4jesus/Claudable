import React, { useState, useEffect, useCallback } from 'react';
import { AiSmartEditMessage, ElementContext, ImageClickContext, LinkClickContext } from '../types/smart-edit';


interface AiSmartEditToolbarProps {
  targetIframeRef: React.RefObject<HTMLIFrameElement | null>;
  onElementSelected?: (context: ElementContext) => void;
  projectId?: string;
}

export function AiSmartEditToolbar({ targetIframeRef, onElementSelected, projectId }: AiSmartEditToolbarProps) {
  const [isActive, setIsActive] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [lastSelected, setLastSelected] = useState<ElementContext | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  // Modal states
  const [imageModal, setImageModal] = useState<ImageClickContext | null>(null);
  const [linkModal, setLinkModal] = useState<LinkClickContext | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  
  // Notification modal state
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  
  const showNotification = useCallback((type: 'success' | 'error' | 'info', message: string) => {
    setNotification({ type, message });
  }, []);

  const sendMessage = useCallback((type: string, payload?: Record<string, unknown>) => {
    if (targetIframeRef.current && targetIframeRef.current.contentWindow) {
      targetIframeRef.current.contentWindow.postMessage({ type, payload }, '*');
    }
  }, [targetIframeRef]);

  // Toggle selection mode
  const toggleSelectionMode = async () => {
    if (!targetIframeRef.current || !targetIframeRef.current.contentWindow) return;

    if (isActive && !isEditMode) {
      setIsActive(false);
      sendMessage('AI_SMART_EDIT:DISABLE');
      setLastSelected(null);
    } else {
      if (isEditMode) {
        setIsEditMode(false);
        sendMessage('AI_SMART_EDIT:EDIT_MODE_DISABLE');
      }
      setIsActive(true);
      sendMessage('AI_SMART_EDIT:ENABLE');
    }
  };

  // Toggle edit mode
  const toggleEditMode = () => {
    if (!targetIframeRef.current || !targetIframeRef.current.contentWindow) return;

    if (isEditMode) {
      // Disable edit mode AND active state completely
      setIsEditMode(false);
      setIsActive(false);
      sendMessage('AI_SMART_EDIT:EDIT_MODE_DISABLE');
      sendMessage('AI_SMART_EDIT:DISABLE');
    } else {
      // Enable selection first if not active
      if (!isActive) {
        setIsActive(true);
        sendMessage('AI_SMART_EDIT:ENABLE');
      }
      setIsEditMode(true);
      sendMessage('AI_SMART_EDIT:EDIT_MODE_ENABLE');
      setLastSelected(null);
    }
  };

  // Save page
  const handleSavePage = async () => {
    if (!projectId) {
      showNotification('error', 'Project ID is required to save changes');
      return;
    }

    setIsSaving(true);
    sendMessage('AI_SMART_EDIT:SAVE_PAGE');
  };

  // Handle image modal save
  const handleImageSave = () => {
    if (imageModal && imageUrl) {
      sendMessage('AI_SMART_EDIT:UPDATE_IMAGE', {
        selector: imageModal.selector,
        src: imageUrl,
      });
      setImageModal(null);
      setImageUrl('');
    }
  };

  // Handle link modal save
  const handleLinkSave = () => {
    if (linkModal && linkUrl) {
      sendMessage('AI_SMART_EDIT:UPDATE_LINK', {
        selector: linkModal.selector,
        href: linkUrl,
        text: linkModal.hasChildren ? undefined : linkText,
      });
      setLinkModal(null);
      setLinkUrl('');
      setLinkText('');
    }
  };

  // Handle image file upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !projectId) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      showNotification('error', 'Please select an image file');
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('path', 'public/images');

      const response = await fetch(`/api/projects/${projectId}/files/upload`, {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (result.success) {
        setImageUrl(result.data.url);
        showNotification('success', `Image uploaded: ${result.data.filename}`);
      } else {
        showNotification('error', `Upload failed: ${result.error}`);
      }
    } catch (err) {
      showNotification('error', `Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsUploading(false);
    }
  };

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      const data = event.data as AiSmartEditMessage;
      
      if (data && typeof data === 'object' && 'type' in data) {
        if (data.type === 'AI_SMART_EDIT:SELECTED') {
          setLastSelected(data.payload);
          if (onElementSelected) {
            onElementSelected(data.payload);
          }
        } else if (data.type === 'AI_SMART_EDIT:DISABLE') {
          setIsActive(false);
          setIsEditMode(false);
          setIsAtBottom(false);
        } else if (data.type === 'AI_SMART_EDIT:SCROLL_UPDATE') {
          setIsAtBottom(data.payload.isBottom);
        } else if (data.type === 'AI_SMART_EDIT:IMAGE_CLICK') {
          setImageModal(data.payload);
          setImageUrl(data.payload.src);
        } else if (data.type === 'AI_SMART_EDIT:LINK_CLICK') {
          setLinkModal(data.payload);
          setLinkUrl(data.payload.href);
          setLinkText(data.payload.text);
        } else if (data.type === 'AI_SMART_EDIT:PAGE_CONTENT') {
          // Save page content to server
          if (!projectId) {
            setIsSaving(false);
            showNotification('error', 'Project ID is required');
            return;
          }

          try {
            const route = data.payload.route || '/index.html';
            // Convert route to file path (e.g., "/" -> "index.html", "/about" -> "about.html" or "about/index.html")
            let filePath = route;
            if (filePath === '/') {
              filePath = 'index.html';
            } else if (!filePath.endsWith('.html')) {
              filePath = filePath.replace(/^\//, '') + '.html';
            } else {
              filePath = filePath.replace(/^\//, '');
            }

            const response = await fetch(`/api/projects/${projectId}/preview/save-page`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                path: filePath,
                content: data.payload.html,
              }),
            });

            const result = await response.json();
            
            if (result.success) {
              sendMessage('AI_SMART_EDIT:SAVE_RESULT', { success: true });
              showNotification('success', `Saved successfully! Backup created at: ${result.data.backupPath}`);
            } else {
              sendMessage('AI_SMART_EDIT:SAVE_RESULT', { success: false, error: result.error });
              showNotification('error', `Save failed: ${result.error}`);
            }
          } catch (err) {
            const error = err instanceof Error ? err.message : 'Unknown error';
            sendMessage('AI_SMART_EDIT:SAVE_RESULT', { success: false, error });
            showNotification('error', `Save failed: ${error}`);
          } finally {
            setIsSaving(false);
          }
        }
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Close modals first if open
        if (imageModal || linkModal) {
          setImageModal(null);
          setLinkModal(null);
          return;
        }
        
        // Exit edit mode or selection mode
        if (isEditMode) {
          setIsEditMode(false);
          setIsActive(false);
          sendMessage('AI_SMART_EDIT:EDIT_MODE_DISABLE');
          sendMessage('AI_SMART_EDIT:DISABLE');
        } else if (isActive) {
          setIsActive(false);
          sendMessage('AI_SMART_EDIT:DISABLE');
        }
        setLastSelected(null);
      }
    };


    window.addEventListener('message', handleMessage);
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [onElementSelected, isActive, isEditMode, sendMessage, projectId, imageModal, linkModal]);

  return (
    <>
      <div className={`fixed right-4 z-50 flex gap-2 ${isAtBottom ? 'top-24 flex-col-reverse' : 'bottom-4 flex-col items-end'}`}>
        {lastSelected && !isEditMode && (
          <div className="bg-white p-4 rounded-lg shadow-xl border border-gray-200 max-w-sm text-xs font-mono overflow-auto max-h-60">
            <div className="font-bold mb-2">Selected Element</div>
            <div className="mb-1"><span className="text-gray-500">Tag:</span> {lastSelected.tagName}</div>
            <div className="mb-1"><span className="text-gray-500">ID:</span> {lastSelected.id || 'N/A'}</div>
            <div className="mb-1"><span className="text-gray-500">Class:</span> {lastSelected.className || 'N/A'}</div>
            <div className="mb-1"><span className="text-gray-500">Text:</span> {lastSelected.innerText.substring(0, 50)}...</div>
            <div className="mb-1"><span className="text-gray-500">Selector:</span> {lastSelected.selector}</div>
          </div>
        )}

        {/* Save Button - Only show in edit mode */}
        {isEditMode && (
          <button
            onClick={handleSavePage}
            disabled={isSaving}
            className={`px-4 py-2 rounded-full font-semibold transition-colors shadow-lg flex items-center gap-2 ${
                isSaving
                  ? 'bg-gray-400 text-white cursor-wait'
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
          >
            {isSaving ? (
              <>
                <span className="animate-spin">↻</span> Saving...
              </>
            ) : (
              <>
                <span>💾</span> Save Changes
              </>
            )}
          </button>
        )}

        {/* Button Row */}
        <div className="flex gap-2">
          {/* Edit Mode Toggle */}
          <button
            onClick={toggleEditMode}
            className={`px-4 py-2 rounded-full font-semibold transition-colors shadow-lg flex items-center gap-2 ${
              isEditMode
                ? 'bg-orange-500 text-white hover:bg-orange-600'
                : 'bg-gray-700 text-white hover:bg-gray-800'
            }`}
          >
            {isEditMode ? (
              <>
                <span className="w-2 h-2 rounded-full bg-yellow-300 animate-pulse"/>
                Edit Mode Active
              </>
            ) : (
              <>
                <span>✏️</span> Edit Mode
              </>
            )}
          </button>

          {/* Selection Mode Toggle */}
          <button
            onClick={toggleSelectionMode}
            className={`px-4 py-2 rounded-full font-semibold transition-colors shadow-lg flex items-center gap-2 ${
              isActive && !isEditMode
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-800 text-white hover:bg-gray-900'
            }`}
          >
            {isActive && !isEditMode ? (
              <>
                <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse"/>
                AI Mode Active
              </>
            ) : (
              <>
                <span>⚡</span> AI Mode
              </>
            )}
          </button>

        </div>
      </div>

      {/* Image Editor Modal */}
      {imageModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10000]">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <span>🖼️</span> Edit Image
            </h3>
            
            {/* File Upload Section */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Upload from Device</label>
              <div className="flex items-center gap-2">
                <label className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors ${isUploading ? 'opacity-50 cursor-wait' : ''}`}>
                  <span>📁</span>
                  <span className="text-sm text-gray-600">
                    {isUploading ? 'Uploading...' : 'Choose Image File'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    disabled={isUploading}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* OR Separator */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 border-t border-gray-200"></div>
              <span className="text-sm text-gray-400">OR</span>
              <div className="flex-1 border-t border-gray-200"></div>
            </div>

            {/* URL Input */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
              <input
                type="text"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="https://example.com/image.jpg"
              />
            </div>


            {imageUrl && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Preview</label>
                <img 
                  src={imageUrl} 
                  alt="Preview" 
                  className="max-h-40 rounded border border-gray-200"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><text y="50" x="10" fill="red">Error loading</text></svg>';
                  }}
                />
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setImageModal(null); setImageUrl(''); }}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleImageSave}
                className="px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Link Editor Modal */}
      {linkModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10000]">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <span>🔗</span> Edit Link
            </h3>
            
            {!linkModal.hasChildren && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Link Text</label>
                <input
                  type="text"
                  value={linkText}
                  onChange={(e) => setLinkText(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Click here"
                />
              </div>
            )}

            {linkModal.hasChildren && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md text-sm text-yellow-800">
                <strong>Note:</strong> This link contains complex HTML content. Only the URL can be edited.
              </div>
            )}
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Link URL</label>
              <input
                type="text"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="https://example.com"
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setLinkModal(null); setLinkUrl(''); setLinkText(''); }}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleLinkSave}
                className="px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification Modal */}
      {notification && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[10001]">
          <div className={`bg-white rounded-lg shadow-2xl p-6 max-w-md w-full mx-4 border-l-4 ${
            notification.type === 'success' ? 'border-green-500' :
            notification.type === 'error' ? 'border-red-500' : 'border-blue-500'
          }`}>
            <div className="flex items-start gap-3">
              <span className="text-2xl">
                {notification.type === 'success' ? '✅' :
                 notification.type === 'error' ? '❌' : 'ℹ️'}
              </span>
              <div className="flex-1">
                <h3 className={`font-semibold mb-1 ${
                  notification.type === 'success' ? 'text-green-700' :
                  notification.type === 'error' ? 'text-red-700' : 'text-blue-700'
                }`}>
                  {notification.type === 'success' ? 'Success' :
                   notification.type === 'error' ? 'Error' : 'Info'}
                </h3>
                <p className="text-gray-600 text-sm">{notification.message}</p>
              </div>
              <button
                onClick={() => setNotification(null)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="flex justify-end mt-4">
              <button
                onClick={() => setNotification(null)}
                className={`px-4 py-2 rounded-md text-white font-medium ${
                  notification.type === 'success' ? 'bg-green-600 hover:bg-green-700' :
                  notification.type === 'error' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
