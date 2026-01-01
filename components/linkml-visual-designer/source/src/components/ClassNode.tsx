import { useState } from 'react';
import { Handle, Position, NodeResizer } from 'reactflow';
import { Plus, Settings2, Trash2 } from 'lucide-react';
import { TypeSelector } from './TypeSelector';
import type { LinkMLClass, LinkMLSlot } from '../types/linkml';

const TYPICAL_TYPES = [
  'string', 'integer', 'boolean', 'float', 'double', 'decimal', 'date', 'datetime', 'time', 'uri', 'json'
];

export const ClassNode = ({ data, selected }: { id: string, selected?: boolean, data: { 
  classDef: LinkMLClass, 
  slots: Record<string, LinkMLSlot>,
  onUpdateClass: (className: string, updates: Partial<LinkMLClass>) => void,
  onUpdateSlot: (className: string, slotId: string, updates: Partial<LinkMLSlot>) => void,
  onAddSlot: (className: string) => void,
  onDeleteSlot: (className: string, slotId: string) => void,
  allClassNames: string[]
} }) => {
  const [isEditingName, setIsEditingName] = useState(false);
  const [name, setName] = useState(data.classDef.name);

  return (
    <div className="glass-morphism rounded-lg shadow-xl min-w-[240px] border-t-4 border-t-primary group bg-[#1e293b] flex flex-col h-full min-h-fit">
      <NodeResizer minWidth={240} isVisible={selected} lineClassName="border-primary" handleClassName="h-3 w-3 bg-primary border-2 border-white rounded" />
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-primary" />
      
      {/* Header */}
      <div className="flex items-center justify-between p-3 pb-2 shrink-0">
        {isEditingName ? (
          <input
            autoFocus
            className="bg-white/10 text-primary font-bold px-1 rounded outline-none w-full"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              setIsEditingName(false);
              data.onUpdateClass(data.classDef.name, { name });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setIsEditingName(false);
                data.onUpdateClass(data.classDef.name, { name });
              }
            }}
          />
        ) : (
          <h3 
            className="font-bold text-lg text-primary cursor-pointer hover:underline"
            onClick={() => setIsEditingName(true)}
          >
            {data.classDef.name}
          </h3>
        )}
        <div className="flex gap-2">
           <button 
            onClick={() => data.onAddSlot(data.classDef.name)}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-white/10 rounded"
          >
            <Plus className="w-4 h-4 text-primary" />
          </button>
          <Settings2 className="w-4 h-4 text-muted-foreground cursor-pointer" />
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 p-3 pt-0">
        <textarea
            className="w-full bg-transparent text-xs text-muted-foreground mb-3 outline-none resize-none border border-transparent hover:border-white/10 rounded p-1 transition-colors"
            placeholder="Add description..."
            rows={2}
            defaultValue={data.classDef.description || ''}
            onBlur={(e) => data.onUpdateClass(data.classDef.name, { description: e.target.value })}
        />
        <div className="space-y-2">
            {data.classDef.slots.map(slotId => {
            const slot = data.slots[slotId];
            return (
                <div key={slotId} className="group/slot flex flex-col gap-1 border-b border-white/5 pb-2 last:border-0 relative">
                <div className="flex justify-between items-center text-sm gap-2">
                    <div className="flex items-center gap-1 flex-1">
                    <input 
                        className={`bg-transparent outline-none w-full ${slot?.identifier ? "font-semibold text-yellow-500" : ""}`}
                        defaultValue={slot?.name || slotId}
                        onBlur={(e) => {
                        if (e.target.value !== slot?.name) {
                            data.onUpdateSlot(data.classDef.name, slotId, { name: e.target.value });
                        }
                        }}
                    />
                    <span 
                        className="text-[10px] text-primary cursor-pointer hover:bg-white/10 px-1 rounded font-mono"
                        title="Toggle Required"
                        onClick={() => data.onUpdateSlot(data.classDef.name, slotId, { required: !slot?.required })}
                    >
                        {slot?.required ? '*' : '?'}
                    </span>
                    <span 
                        className="text-[10px] text-emerald-400 cursor-pointer hover:bg-white/10 px-1 rounded font-mono"
                        title="Toggle Multi-valued (1:N)"
                        onClick={() => data.onUpdateSlot(data.classDef.name, slotId, { multivalued: !slot?.multivalued })}
                    >
                        {slot?.multivalued ? '[*]' : '[1]'}
                    </span>
                    </div>
                    <TypeSelector 
                    value={slot?.range || 'string'}
                    options={[...TYPICAL_TYPES, ...data.allClassNames]}
                    onChange={(val) => data.onUpdateSlot(data.classDef.name, slotId, { range: val })}
                    />
                    <div className="flex items-center gap-1 opacity-0 group-hover/slot:opacity-100 transition-opacity">
                    <button 
                        onClick={() => data.onDeleteSlot(data.classDef.name, slotId)}
                        className="p-1.5 hover:bg-red-500/20 rounded-md transition-colors"
                        title="Delete field"
                    >
                        <Trash2 className="w-3.5 h-3.5 text-red-400 hover:text-red-300" />
                    </button>
                    </div>
                </div>
                </div>
            );
            })}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-primary" />
    </div>
  );
};
