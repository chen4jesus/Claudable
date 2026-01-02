import React, { Suspense } from 'react';
import dynamic from 'next/dynamic';

// Import ReactFlow styles
import 'reactflow/dist/style.css';
// Import source styles (Tailwind + custom classes)
import './linkml-visual-designer/source/src/index.css';

import type { LinkMLDesignerProps } from './linkml-visual-designer/source/src/LinkMLDesigner';

// Dynamic import for the local component from source
const LinkMLVisualDesigner = dynamic<LinkMLDesignerProps>(
  () => import('./linkml-visual-designer/source/src/LinkMLDesigner').then((mod) => mod.LinkMLDesigner),
  { 
    ssr: false,
    loading: () => (
      <div className="flex flex-col items-center justify-center h-full w-full bg-[#0b0e14] text-white min-h-[400px]">
        <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-gray-400 font-medium">Loading Data Designer...</p>
      </div>
    )
  }
);

interface DataDesignerProps {
  projectId: string;
}

export function DataDesigner({ projectId }: DataDesignerProps) {
  return (
    <div className="w-full h-full bg-[#0b0e14] flex flex-col">
      <div className="flex-1 w-full h-full">
         <Suspense fallback={
           <div className="flex flex-col items-center justify-center h-full w-full bg-[#0b0e14] text-white">
             <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
             <p className="text-gray-400 font-medium">Preparing Workspace...</p>
           </div>
         }>
            <LinkMLVisualDesigner projectId={projectId} />
         </Suspense>
      </div>
    </div>
  );
}
