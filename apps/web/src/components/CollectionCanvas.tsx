import { useEffect, useRef, useState } from 'react';
import { Background, Controls, ReactFlow, applyNodeChanges, type Node, type NodeProps } from '@xyflow/react';
import { canvasCardPosition, collectionCanvasCards, type CanvasLayout, type CardRecord, type CollectionRecord } from '@visual-library/shared';
import { readCanvasLayout, saveCanvasLayout } from '../lib/cardDb';

type CanvasCardNode = Node<{ card: CardRecord }, 'card'>;
function CardNode({ data: { card } }: NodeProps<CanvasCardNode>) {
  return <div className={`canvas-card-node canvas-card-${card.type}`}>
    {card.type === 'image' && card.dataUrl ? <img src={card.dataUrl} alt="" draggable={false} /> : card.note && <p>{card.note.slice(0, 250)}</p>}
    <strong>{card.title}</strong>
  </div>;
}
const nodeTypes = { card: CardNode };

export function CollectionCanvas({ collection, cards }: { collection: CollectionRecord; cards: CardRecord[] }) {
  const [nodes, setNodes] = useState<CanvasCardNode[]>([]);
  const [initialLayout, setInitialLayout] = useState<CanvasLayout>();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const layout = useRef<CanvasLayout>({ collectionId: collection.id, positions: {}, updatedAt: '' });
  const writes = useRef(Promise.resolve());
  useEffect(() => {
    let disposed = false;
    void readCanvasLayout(collection.id).then(saved => {
      if (disposed) return;
      layout.current = saved ?? { collectionId: collection.id, positions: {}, updatedAt: '' };
      setInitialLayout(saved);
      setNodes(collectionCanvasCards(collection, cards).map((card, index) => ({ id: card.id, type: 'card', ariaLabel: card.title, position: canvasCardPosition(card.id, index, saved), data: { card } })));
      setReady(true);
    }, () => { if (!disposed) setError('This canvas could not be loaded. Please try again.'); });
    return () => { disposed = true; };
  }, [collection, cards]);
  const persist = (next: CanvasLayout) => {
    layout.current = { ...next, updatedAt: new Date().toISOString() };
    const snapshot = layout.current;
    writes.current = writes.current.then(() => saveCanvasLayout(snapshot)).then(() => setError(''), () => setError('Canvas changes could not be saved on this device.'));
  };
  return <div className="canvas-panel panel" aria-label={`Canvas ${collection.name}`} aria-busy={!ready} data-collection-id={collection.id}>
    {error && <p role="alert">{error}</p>}
    <div className="canvas-surface">
      {ready && <ReactFlow<CanvasCardNode> nodes={nodes} edges={[]} nodeTypes={nodeTypes} fitView={!initialLayout?.viewport} defaultViewport={initialLayout?.viewport} minZoom={0.15} maxZoom={2} nodesDraggable nodesConnectable={false}
        onNodesChange={changes => setNodes(current => applyNodeChanges(changes, current))}
        onNodeDragStop={(_, node) => persist({ ...layout.current, positions: { ...layout.current.positions, [node.id]: node.position } })}
        onMoveEnd={(_, viewport) => persist({ ...layout.current, viewport })}>
        <Background gap={24} color="#d6dbe1" /><Controls showInteractive={false} />
      </ReactFlow>}
    </div>
  </div>;
}
