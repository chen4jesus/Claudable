import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Node, Edge } from 'reactflow';
import { LinkMLModel } from '../types/linkml';

interface LinkMLState {
  model: LinkMLModel;
  nodes: Node[];
  edges: Edge[];
}

interface LinkMLContextType {
  state: LinkMLState;
  setModel: (model: LinkMLModel) => void;
  setNodes: (nodes: Node[] | ((nds: Node[]) => Node[])) => void;
  setEdges: (edges: Edge[] | ((eds: Edge[]) => Edge[])) => void;
}

const LinkMLContext = createContext<LinkMLContextType | undefined>(undefined);

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

export const LinkMLProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [model, setModel] = useState<LinkMLModel>(DEFAULT_MODEL);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  return (
    <LinkMLContext.Provider value={{ 
      state: { model, nodes, edges }, 
      setModel, 
      setNodes, 
      setEdges 
    }}>
      {children}
    </LinkMLContext.Provider>
  );
};

export const useLinkML = () => {
  const context = useContext(LinkMLContext);
  if (context === undefined) {
    throw new Error('useLinkML must be used within a LinkMLProvider');
  }
  return context;
};
