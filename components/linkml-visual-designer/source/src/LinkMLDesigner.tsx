import { useMemo, useState, useEffect } from 'react';
import ReactFlow, { 
  Background, 
  Controls, 
  Panel,
  applyNodeChanges,
  applyEdgeChanges,
} from 'reactflow';
import type {
  Node,
  Edge,
  NodeChange,
  EdgeChange,
  Connection
} from 'reactflow';
import 'reactflow/dist/style.css';
import type { LinkMLModel, LinkMLClass, LinkMLSlot } from './types/linkml';
import { generateJsonSchema } from './generators/jsonSchema';
import { generateSql } from './generators/sql';
import { Code, Database, FileJson, LayoutDashboard, Plus } from 'lucide-react';
import { ClassNode } from './components/ClassNode';
import { useLinkML } from './context/LinkMLContext';
import { Upload as UploadIcon, Save } from 'lucide-react';

// Default model if none provided
const DEFAULT_MODEL: LinkMLModel = {
  name: "MySchema",
  classes: {
    "Person": {
      name: "Person",
      description: "A person in the system",
      slots: ["Person.id", "Person.name", "Person.age"]
    }
  },
  slots: {
    "Person.id": { name: "id", range: "integer", required: true, identifier: true },
    "Person.name": { name: "name", range: "string" },
    "Person.age": { name: "age", range: "integer" }
  }
};

const nodeTypes = {
  classNode: ClassNode,
};

export interface LinkMLDesignerProps {
  initialModel?: LinkMLModel;
  onModelChange?: (model: LinkMLModel) => void;
  onJsonSchemaChange?: (schema: any) => void;
  onSqlChange?: (sql: string) => void;
  readonly?: boolean;
  projectId?: string;
}

export const LinkMLDesigner: React.FC<LinkMLDesignerProps> = ({ 
  initialModel = DEFAULT_MODEL,
  onModelChange,
  onJsonSchemaChange,
  onSqlChange,
  readonly = false,
  projectId
}) => {
  const { state, setModel, setNodes, setEdges } = useLinkML();
  const { model, nodes, edges } = state;
  const [previewTab, setPreviewTab] = useState<'json' | 'sql'>('json');
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Notify parent of updates
  useEffect(() => {
    if (onModelChange) onModelChange(model);
    
    // Also notify about schemas if requested
    const json = generateJsonSchema(model);
    const sql = generateSql(model);
    
    if (onJsonSchemaChange) onJsonSchemaChange(json);
    if (onSqlChange) onSqlChange(sql);
  }, [model, onModelChange, onJsonSchemaChange, onSqlChange]);

  const onDeleteSlot = (className: string, slotId: string) => {
    if (readonly) return;
    setModel(prev => {
      const newClasses = { ...prev.classes };
      newClasses[className] = {
        ...newClasses[className],
        slots: newClasses[className].slots.filter(s => s !== slotId)
      };
      const newSlots = { ...prev.slots };
      delete newSlots[slotId];
      return { ...prev, classes: newClasses, slots: newSlots };
    });
  };

  const onUpdateClass = (className: string, updates: Partial<LinkMLClass>) => {
    if (readonly) return;
    setModel(prev => {
      const newClasses = { ...prev.classes };
      
      // Handle renaming if name is updated and changed
      if (updates.name && updates.name !== className) {
        const classDef = { ...newClasses[className], ...updates };
        delete newClasses[className];
        newClasses[updates.name] = classDef;
      } else {
        // Simple update (description, etc)
        newClasses[className] = { ...newClasses[className], ...updates };
      }
      return { ...prev, classes: newClasses };
    });
  };

  const onUpdateSlot = (_className: string, slotId: string, updates: Partial<LinkMLSlot>) => {
    if (readonly) return;
    setModel(prev => {
      const newSlots = { ...prev.slots };
      newSlots[slotId] = { ...newSlots[slotId], ...updates };
      return { ...prev, slots: newSlots };
    });
  };

  const onAddSlot = (className: string) => {
    if (readonly) return;
    const baseSlotName = "new_field";
    let counter = 1;
    let slotId = `${className}.${baseSlotName}`;
    while (model.slots[slotId]) {
      slotId = `${className}.${baseSlotName}_${counter++}`;
    }

    setModel(prev => ({
      ...prev,
      slots: {
        ...prev.slots,
        [slotId]: { name: baseSlotName, range: "string" }
      },
      classes: {
        ...prev.classes,
        [className]: {
          ...prev.classes[className],
          slots: [...prev.classes[className].slots, slotId]
        }
      }
    }));
  };

  const reorient = () => {
    setNodes((nds) => nds.map((node, idx) => ({
      ...node,
      position: { x: 100 + (idx * 250), y: 100 }
    })));
  };

  useEffect(() => {
    // Update or Generate Nodes while preserving positions
    setNodes((prevNodes) => {
      return Object.values(model.classes).map((cls, idx) => {
        const existingNode = prevNodes.find(n => n.id === cls.name);
        return {
          id: cls.name,
          type: 'classNode',
          position: existingNode ? existingNode.position : { x: 100 + (idx * 250), y: 100 },
          style: existingNode ? existingNode.style : undefined,
          width: existingNode ? existingNode.width : undefined,
          height: existingNode ? existingNode.height : undefined,
          data: { 
            classDef: cls, 
            slots: model.slots,
            onUpdateClass,
            onUpdateSlot,
            onAddSlot,
            onDeleteSlot,
            allClassNames: Object.keys(model.classes)
          },
          draggable: !readonly,
          connectable: !readonly,
        };
      });
    });

    // Generate Edges based on slots whose range is another class
    const newEdges: Edge[] = [];
    Object.values(model.classes).forEach(cls => {
      cls.slots.forEach(slotId => {
        const slot = model.slots[slotId];
        if (slot && slot.range && model.classes[slot.range]) {
          newEdges.push({
            id: `${cls.name}-${slotId}-${slot.range}`,
            source: cls.name,
            target: slot.range,
            label: slot.name,
            animated: true,
            style: { stroke: '#3b82f6', strokeWidth: 2 },
          });
        }
      });
    });
    setEdges(newEdges);
  }, [model, readonly]);

  const onNodesChange = (changes: NodeChange[]) => {
    if (readonly) return;
    setNodes((nds) => applyNodeChanges(changes, nds));
  };
  const onEdgesChange = (changes: EdgeChange[]) => {
    if (readonly) return;
    setEdges((eds) => applyEdgeChanges(changes, eds));
  };
  
  const onConnect = (params: Connection) => {
    if (readonly) return;
    if (!params.source || !params.target) return;
    
    const sourceClass = model.classes[params.source];
    const targetClass = model.classes[params.target];
    
    if (sourceClass && targetClass) {
      let counter = 1;
      let slotName = `${targetClass.name.toLowerCase()}_ref`;
      let slotId = `${sourceClass.name}.${slotName}`;
      
      while (model.slots[slotId]) {
        slotName = `${targetClass.name.toLowerCase()}_ref_${counter}`;
        slotId = `${sourceClass.name}.${slotName}`;
        counter++;
      }

      setModel(prev => ({
        ...prev,
        slots: {
          ...prev.slots,
          [slotId]: { name: slotName, range: targetClass.name }
        },
        classes: {
          ...prev.classes,
          [params.source!]: {
            ...prev.classes[params.source!],
            slots: [...prev.classes[params.source!].slots, slotId]
          }
        }
      }));
    }
  };

  const jsonSchema = useMemo(() => generateJsonSchema(model), [model]);
  const sqlSchema = useMemo(() => generateSql(model), [model]);

  const addClass = () => {
    if (readonly) return;
    const newClassName = `NewClass${Object.values(model.classes).length + 1}`;
    const idSlotId = `${newClassName}.id`;
    setModel(prev => ({
      ...prev,
      classes: {
        ...prev.classes,
        [newClassName]: { name: newClassName, slots: [idSlotId] }
      },
      slots: {
        ...prev.slots,
        [idSlotId]: { name: "id", range: "integer", required: true, identifier: true }
      }
    }));
  };

  const handleSave = async () => {
    if (!projectId) return;
    setIsSaving(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/files/content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: 'designer_model.json',
          content: JSON.stringify(model, null, 2)
        })
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to save design');
      }
      alert('Design saved successfully as designer_model.json');
    } catch (err: any) {
      console.error('Save error:', err);
      alert(`Error saving design: ${err.message || 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    try {
      const text = await file.text();
      const imported = JSON.parse(text);
      if (imported.name && imported.classes && imported.slots) {
        setModel(imported);
        alert('Design imported successfully');
      } else {
        alert('Invalid design file format');
      }
    } catch (err) {
      console.error(err);
      alert('Error importing design');
    } finally {
      setIsImporting(false);
      if (e.target) e.target.value = ''; // Reset input
    }
  };

  return (
    <div className="flex h-full w-full bg-[#0b0e14] overflow-hidden font-sans text-white">
      {/* Left: ER Diagram */}
      <div className="flex-1 relative border-r border-white/10">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          defaultEdgeOptions={{
            style: { stroke: '#3b82f6', strokeWidth: 2 },
            animated: true,
          }}
          fitView
          nodesConnectable={!readonly}
          nodesDraggable={!readonly}
        >
          {!readonly && (
            <Panel position="top-left" className="m-4 flex gap-2">
              <button 
                onClick={addClass}
                className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-md font-medium transition-all shadow-lg"
              >
                <Plus className="w-4 h-4" /> Add Class
              </button>
              <button 
                onClick={reorient}
                className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-md font-medium transition-all shadow-lg border border-white/10"
              >
                <LayoutDashboard className="w-4 h-4 text-primary" /> Re-orient
              </button>
              <div className="w-[1px] h-8 bg-white/10 mx-1" />
              <button 
                onClick={handleSave}
                disabled={isSaving || !projectId}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-md font-medium transition-all shadow-lg disabled:opacity-50"
                title={!projectId ? "Project ID missing" : "Save to project"}
              >
                <Save className={`w-4 h-4 ${isSaving ? 'animate-spin' : ''}`} /> {isSaving ? 'Saving...' : 'Save'}
              </button>
              <button 
                onClick={() => document.getElementById('import-input')?.click()}
                disabled={isImporting}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-md font-medium transition-all shadow-lg disabled:opacity-50"
              >
                <UploadIcon className="w-4 h-4" /> Import
                <input 
                  id="import-input"
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={handleImport}
                />
              </button>
            </Panel>
          )}
          <Background color="#1e293b" gap={20} />
          <Controls className="bg-white/10 border-white/20" />
        </ReactFlow>
      </div>

      {/* Right: Real-time Previews - Optional? Keeping it for now as part of the tool */}
      <div className="w-[450px] flex flex-col glass-morphism border-l border-white/10">
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Code className="text-primary" /> Auto-Generator
          </h2>
          <div className="flex bg-white/5 p-1 rounded-lg">
            <button 
              onClick={() => setPreviewTab('json')}
              className={`px-3 py-1 rounded-md text-sm flex items-center gap-2 transition-all ${previewTab === 'json' ? 'bg-primary text-primary-foreground' : 'hover:bg-white/5'}`}
            >
              <FileJson className="w-4 h-4" /> JSON
            </button>
            <button 
              onClick={() => setPreviewTab('sql')}
              className={`px-3 py-1 rounded-md text-sm flex items-center gap-2 transition-all ${previewTab === 'sql' ? 'bg-primary text-primary-foreground' : 'hover:bg-white/5'}`}
            >
              <Database className="w-4 h-4" /> SQL
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-auto p-4 font-mono text-sm">
          {previewTab === 'json' ? (
            <pre className="text-blue-300">
              {JSON.stringify(jsonSchema, null, 2)}
            </pre>
          ) : (
            <pre className="text-emerald-300 whitespace-pre-wrap">
              {sqlSchema}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
};
