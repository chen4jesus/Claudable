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
      <div className="flex items-center justify-center p-8 text-gray-500">
        Loading Data Designer...
      </div>
    )
  }
);

interface DataDesignerProps {
  projectId: string;
}

export function DataDesigner({ projectId }: DataDesignerProps) {
  return (
    <div className="w-full h-full bg-white flex flex-col">
      <div className="flex-1 w-full h-full">
         <Suspense fallback={<div>Loading...</div>}>
            <LinkMLVisualDesigner projectId={projectId} />
         </Suspense>
      </div>
    </div>
  );
}
