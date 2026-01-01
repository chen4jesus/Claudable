import { LinkMLDesigner } from './LinkMLDesigner';

function App() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <LinkMLDesigner 
        onModelChange={(model) => console.log('Model updated:', model)}
        onJsonSchemaChange={() => console.log('JSON Schema updated')}
      />
    </div>
  );
}

export default App;
