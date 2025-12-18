import React, { useState, useEffect, useCallback } from 'react';
import { AiSmartEditMessage, ElementContext } from '../types/smart-edit';


interface AiSmartEditToolbarProps {
  targetIframeRef: React.RefObject<HTMLIFrameElement | null>;
  onElementSelected?: (context: ElementContext) => void;
  projectId?: string;
}

export function AiSmartEditToolbar({ targetIframeRef, onElementSelected, projectId }: AiSmartEditToolbarProps) {
  const [isActive, setIsActive] = useState(false);
  const [lastSelected, setLastSelected] = useState<ElementContext | null>(null);

  const [isInjecting, setIsInjecting] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(false);

  const sendMessage = useCallback((type: 'AI_SMART_EDIT:ENABLE' | 'AI_SMART_EDIT:DISABLE' | 'AI_SMART_EDIT:PING') => {
    if (targetIframeRef.current && targetIframeRef.current.contentWindow) {
      targetIframeRef.current.contentWindow.postMessage({ type }, '*');
    }
  }, [targetIframeRef]);

  const toggleMode = async () => {
    if (!targetIframeRef.current || !targetIframeRef.current.contentWindow) return;

    if (isActive) {
      setIsActive(false);
      sendMessage('AI_SMART_EDIT:DISABLE');
      setLastSelected(null);
    } else {
      setIsActive(true);
      sendMessage('AI_SMART_EDIT:ENABLE');
    }
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data as AiSmartEditMessage;
      
      if (data && typeof data === 'object' && 'type' in data) {
         if (data.type === 'AI_SMART_EDIT:SELECTED') {
            setLastSelected(data.payload);
            // Keep active
            if (onElementSelected) {
                onElementSelected(data.payload);
            }
         } else if (data.type === 'AI_SMART_EDIT:DISABLE') {
             setIsActive(false);
             setIsAtBottom(false);
         } else if (data.type === 'AI_SMART_EDIT:SCROLL_UPDATE') {
             setIsAtBottom(data.payload.isBottom);
         }
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isActive) {
        setIsActive(false);
        sendMessage('AI_SMART_EDIT:DISABLE');
        setLastSelected(null);
      }
    };

    window.addEventListener('message', handleMessage);
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [onElementSelected, isActive, sendMessage]); // Added isActive and sendMessage dependencies

  return (
    <div className={`fixed right-4 z-50 flex gap-2 ${isAtBottom ? 'top-24 flex-col-reverse' : 'bottom-4 flex-col items-end'}`}>
      {lastSelected && (
        <div className="bg-white p-4 rounded-lg shadow-xl border border-gray-200 max-w-sm text-xs font-mono overflow-auto max-h-60">
          <div className="font-bold mb-2">Selected Element</div>
          <div className="mb-1"><span className="text-gray-500">Tag:</span> {lastSelected.tagName}</div>
          <div className="mb-1"><span className="text-gray-500">ID:</span> {lastSelected.id || 'N/A'}</div>
          <div className="mb-1"><span className="text-gray-500">Class:</span> {lastSelected.className || 'N/A'}</div>
          <div className="mb-1"><span className="text-gray-500">Text:</span> {lastSelected.innerText.substring(0, 50)}...</div>
          <div className="mb-1"><span className="text-gray-500">Selector:</span> {lastSelected.selector}</div>
        </div>
      )}
      
      <button
        onClick={toggleMode}
        disabled={isInjecting}
        className={`px-4 py-2 rounded-full font-semibold transition-colors shadow-lg flex items-center gap-2 ${
          isActive 
            ? 'bg-blue-600 text-white hover:bg-blue-700' 
            : isInjecting 
              ? 'bg-yellow-500 text-white'
              : 'bg-gray-800 text-white hover:bg-gray-900'
        }`}
      >
        {isInjecting ? (
           <>
             <span className="animate-spin text-lg">↻</span> Preparing...
           </>
        ) : isActive ? (
          <>
            <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse"/>
            Selection Mode Active (ESC to exit)
          </>
        ) : (
          <>
            <span>⚡</span> AI Smart Edit
          </>
        )}
      </button>
    </div>
  );
}
