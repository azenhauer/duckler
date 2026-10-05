import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Background, Controls, MarkerType, ReactFlow, NodeResizer, Handle, Position, applyNodeChanges, useUpdateNodeInternals, type Node, type NodeProps, type ReactFlowInstance, type Viewport, type ResizeParams } from '@xyflow/react';
import {
  CANVAS_CARD_MIME, CANVAS_LIMITS, createCanvasPlacement, canvasGestureElement, canvasAnchorPoint,
  defaultCanvasStyle, normalizeRotation, visibleCanvasElements, visibleCanvasConnectors,
  type CanvasContent, type CanvasState, type CanvasElement, type CanvasPlacement, type CanvasStyle, type CanvasPoint, type CardRecord, type CollectionRecord,
} from '@visual-library/shared';
import { readCanvasState, commitCanvasContent, saveCanvasViewport, saveCanvasBackground } from '../lib/cardDb';
import { CanvasIcon, type CanvasIconName } from './CanvasIcon';
import { Dialog } from './Dialog';
import { CanvasArtwork } from './CanvasArtwork';

type Tool = 'select' | 'hand' | 'pen' | 'highlighter' | 'rectangle' | 'ellipse' | 'text' | 'connector' | 'eraser';
type CanvasNode = Node<{ objectId: string; cardId?: string }, 'card' | 'element'>;
type NodeContextValue = {
  cards: Map<string, CardRecord>; content: CanvasContent; tool: Tool; aspect: boolean; find: string;
  onResize: (id: string, geometry: ResizeParams) => void; onEdit: (id: string) => void;
  onRestore: (id: string) => void; onText: (element: CanvasElement) => void; onAnnotation: (id: string) => void;
};
const NodeContext = createContext<NodeContextValue | null>(null);
function useCanvasNode() { const value = useContext(NodeContext); if (!value) throw new Error('Canvas context missing'); return value; }
function ConnectHandles() {
  const { tool } = useCanvasNode();
  return <><Handle type="target" position={Position.Left} id="target" style={{ opacity: tool === 'connector' ? 1 : 0, pointerEvents: tool === 'connector' ? 'auto' : 'none' }} />
    <Handle type="source" position={Position.Right} id="source" style={{ opacity: tool === 'connector' ? 1 : 0, pointerEvents: tool === 'connector' ? 'auto' : 'none' }} /></>;
}
function CardNode({ data, selected, id }: NodeProps<CanvasNode>) {
  const context = useCanvasNode();
  const placement = context.content.placements.find(item => item.id === data.objectId)!;
  const card = context.cards.get(data.cardId ?? '');
  if (!placement) return null;
  const annotations = context.content.elements.filter(item => item.anchorPlacementId === placement.id);
  return <>
    <NodeResizer isVisible={selected && context.tool === 'select'} minWidth={120} minHeight={80} maxWidth={10000} maxHeight={10000} keepAspectRatio={context.aspect && card?.type === 'image'} onResizeEnd={(_, geometry) => context.onResize(id, geometry)} />
    <div className={`canvas-card-node canvas-card-${card?.type ?? 'missing'} ${context.find && !`${card?.title ?? ''} ${card?.note ?? ''} ${card?.tags.join(' ') ?? ''}`.toLocaleLowerCase().includes(context.find) ? 'is-dimmed' : ''}`} data-card-id={data.cardId} style={{ transform: `rotate(${placement.rotation}deg)` }}>
      <ConnectHandles />
      {!card || card.trashed ? <div className="canvas-card-placeholder"><strong>{card?.title ?? 'Missing card'}</strong><p>{card ? 'Card in trash' : 'This card is no longer available'}</p>
        {card && <button type="button" className="nodrag nopan" onClick={() => context.onRestore(card.id)}>Restore card</button>}</div>
        : <>{(card.type === 'image' || card.type === 'pdf') && card.dataUrl ? <img src={card.dataUrl} alt="" draggable={false} loading="lazy" /> : <p>{card.note.slice(0, 250) || card.title}</p>}
          <strong>{card.title}</strong><button type="button" className="canvas-node-edit nodrag nopan" aria-label={`Edit ${card.title}`} onClick={() => context.onEdit(card.id)}>Edit</button></>}
      {annotations.length > 0 && <svg className="canvas-anchored-art" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-label="Card annotations">
        {annotations.map(element => <g key={element.id} transform={`translate(${element.x} ${element.y}) rotate(${element.rotation} ${element.width / 2} ${element.height / 2})`}
          className="nodrag nopan" style={{ pointerEvents: context.tool === 'select' || context.tool === 'eraser' ? 'auto' : 'none' }}
          onClick={event => { event.stopPropagation(); context.onAnnotation(element.id); }} onDoubleClick={event => { event.stopPropagation(); if (element.kind === 'text') context.onText(element); }}>
          <svg width={element.width} height={element.height} style={{ overflow: 'visible' }}><CanvasArtwork element={element} strokeScale={1000 / placement.width} /></svg>
        </g>)}
      </svg>}
      {card && annotations.some(element => element.sourceRevision && element.sourceRevision !== card.updatedAt) && <span className="canvas-review-notice">Review annotations: card changed</span>}
    </div>
  </>;
}
function ElementNode({ data, selected, id }: NodeProps<CanvasNode>) {
  const context = useCanvasNode();
  const element = context.content.elements.find(item => item.id === data.objectId);
  if (!element) return null;
  return <>
    <NodeResizer isVisible={selected && context.tool === 'select'} minWidth={10} minHeight={10} maxWidth={10000} maxHeight={10000} onResizeEnd={(_, geometry) => context.onResize(id, geometry)} />
    <div className="canvas-element-node" style={{ transform: `rotate(${element.rotation}deg)` }} onDoubleClick={() => { if (element.kind === 'text') context.onText(element); }}>
      <ConnectHandles /><CanvasArtwork element={element} />
    </div>
  </>;
}
const nodeTypes = { card: CardNode, element: ElementNode };
function CanvasInternals({ content }: { content: CanvasContent }) {
  const updateInternals = useUpdateNodeInternals();
  useEffect(() => {
    updateInternals([...content.placements, ...content.elements].map(item => item.id));
  }, [content, updateInternals]);
  return null;
}
const contentOf = (state: CanvasState): CanvasContent => ({ placements: state.placements, elements: state.elements, connectors: state.connectors });
const blankContent: CanvasContent = { placements: [], elements: [], connectors: [] };
const strokeColors = ['#7cbcff', '#ff4fd8', '#41f0d1', '#ffd84d', '#ff5a5a', '#f4f6ff', '#1b1f3b'];
const boardBackgrounds = [
  { label: 'Void', color: '#07060f' }, { label: 'Midnight grid', color: '#0b1030' }, { label: 'Synth dusk', color: '#1d0b33' },
  { label: 'Deep teal', color: '#062027' }, { label: 'Chrome', color: '#c7ced8' }, { label: 'Ice', color: '#dbeaf7' }, { label: 'Paper', color: '#f1f0ec' },
];
const isLightColor = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 150;
};
const tools: { id: Tool; label: string }[] = [{ id: 'select', label: 'Select' }, { id: 'hand', label: 'Hand' }, { id: 'pen', label: 'Pen' }, { id: 'highlighter', label: 'Highlighter' }, { id: 'rectangle', label: 'Rectangle' }, { id: 'ellipse', label: 'Ellipse' }, { id: 'text', label: 'Text' }, { id: 'connector', label: 'Connector' }, { id: 'eraser', label: 'Eraser' }];

export function CollectionCanvas({ collection, cards, onEditCard, onRestoreCard, onBack }: {
  collection: CollectionRecord; cards: CardRecord[]; onEditCard: (id: string) => void; onRestoreCard: (id: string) => void; onBack?: () => void;
}) {
  const [board, setBoard] = useState<CanvasState>();
  const current = useRef<CanvasState | undefined>(undefined);
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [tool, setTool] = useState<Tool>('select');
  const [style, setStyle] = useState<CanvasStyle>(defaultCanvasStyle);
  const [aspect, setAspect] = useState(true);
  const [anchorMode, setAnchorMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedAnnotation, setSelectedAnnotation] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [edgeLabel, setEdgeLabel] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const [reload, setReload] = useState(0);
  const undo = useRef<CanvasContent[]>([]), redo = useRef<CanvasContent[]>([]);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [query, setQuery] = useState('');
  const [boardFind, setBoardFind] = useState('');
  const find = boardFind.trim().toLocaleLowerCase();
  const flow = useRef<ReactFlowInstance<CanvasNode>>(null);
  const surface = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const viewportWrites = useRef(Promise.resolve());
  const gesture = useRef<{ pointerId: number; points: CanvasPoint[]; kind: CanvasElement['kind']; style: CanvasStyle; anchor?: CanvasPlacement } | null>(null);
  const [preview, setPreview] = useState<CanvasElement | null>(null);
  const [textDraft, setTextDraft] = useState<CanvasElement | null>(null);
  const [textValue, setTextValue] = useState('');
  const cardMap = useMemo(() => new Map(cards.map(card => [card.id, card])), [cards]);
  const content = useMemo(() => board ? contentOf(board) : blankContent, [board]);
  const activeIds = selectedAnnotation ? [selectedAnnotation] : selected;
  const selectedPlacement = content.placements.find(item => !item.removed && selected.includes(item.id));
  const drawing = ['pen', 'highlighter', 'rectangle', 'ellipse', 'text'].includes(tool);

  const membershipKey = collection.cardIds.join('|');
  useEffect(() => {
    let disposed = false;
    setError('');
    void readCanvasState(collection.id).then(state => {
      if (disposed) return;
      current.current = state; setBoard(state); setViewport(state.viewport ?? { x: 0, y: 0, zoom: 1 });
      undo.current = []; redo.current = []; setHistoryVersion(version => version + 1);
    }, () => { if (!disposed) setError('This canvas could not be loaded. Try reloading.'); });
    return () => { disposed = true; };
  }, [collection.id, membershipKey, reload]);

  const rebuildNodes = useCallback((state: CanvasState) => setNodes(previous => {
    const selection = new Set(previous.filter(node => node.selected).map(node => node.id));
    return [...state.placements.filter(item => !item.removed).map(item => ({ id: item.id, type: 'card' as const, position: { x: item.x, y: item.y }, width: item.width, height: item.height, zIndex: item.zIndex, ariaLabel: cardMap.get(item.cardId)?.title ?? 'Missing card', selected: selection.has(item.id), data: { objectId: item.id, cardId: item.cardId } })),
      ...visibleCanvasElements(state).filter(item => !item.anchorPlacementId).map(item => ({ id: item.id, type: 'element' as const, position: { x: item.x, y: item.y }, width: item.width, height: item.height, zIndex: item.zIndex, ariaLabel: item.kind === 'text' ? `Text: ${item.text?.slice(0, 50)}` : item.kind, selected: selection.has(item.id), data: { objectId: item.id } }))];
  }), [cardMap]);
  useEffect(() => { if (board) rebuildNodes(board); }, [board, rebuildNodes]); // Card content resolves through context, without resetting geometry.

  const commit = async (next: CanvasContent, mode: 'edit' | 'undo' | 'redo' = 'edit'): Promise<boolean> => {
    const before = current.current;
    if (!before || busy.current) return false;
    if (JSON.stringify(contentOf(before)) === JSON.stringify(next)) return true;
    busy.current = true; setSaving(true); setError('');
    try {
      const document = await commitCanvasContent(collection.id, before.document.revision, next);
      if (mode === 'edit') { undo.current.push(contentOf(before)); undo.current = undo.current.slice(-50); redo.current = []; }
      if (mode === 'undo') { undo.current.pop(); redo.current.push(contentOf(before)); }
      if (mode === 'redo') { redo.current.pop(); undo.current.push(contentOf(before)); }
      const state = { ...before, ...next, document };
      current.current = state; setBoard(state); setHistoryVersion(version => version + 1);
      return true;
    } catch (reason) {
      rebuildNodes(before);
      setError(reason instanceof Error ? reason.message : 'Canvas changes could not be saved. Try again.');
      return false;
    } finally { busy.current = false; setSaving(false); }
  };
  const undoCommand = () => { const snapshot = undo.current.at(-1); if (snapshot) void commit(snapshot, 'undo'); };
  const redoCommand = () => { const snapshot = redo.current.at(-1); if (snapshot) void commit(snapshot, 'redo'); };
  const updateGeometry = (id: string, geometry: { x: number; y: number; width: number; height: number }) => {
    const state = current.current; if (!state) return;
    void commit({ ...contentOf(state), placements: state.placements.map(item => item.id === id ? { ...item, ...geometry } : item),
      elements: state.elements.map(item => item.id === id ? { ...item, ...geometry, points: item.points?.map(point => ({ x: point.x / item.width * geometry.width, y: point.y / item.height * geometry.height })) } : item) });
  };
  const moveNodes = (moved: CanvasNode[]) => {
    const state = current.current; if (!state) return;
    const positions = new Map(moved.map(node => [node.id, node.position]));
    void commit({ ...contentOf(state), placements: state.placements.map(item => positions.has(item.id) ? { ...item, ...positions.get(item.id)! } : item),
      elements: state.elements.map(item => positions.has(item.id) ? { ...item, ...positions.get(item.id)! } : item) });
  };
  const removeObjects = (ids = activeIds, edge = selectedEdge) => {
    const state = current.current; if (!state) return;
    const removedElements = new Set(state.elements.filter(item => ids.includes(item.id)).map(item => item.id));
    void commit({ placements: state.placements.map(item => ids.includes(item.id) ? { ...item, removed: true } : item),
      elements: state.elements.filter(item => !removedElements.has(item.id)),
      connectors: state.connectors.filter(item => item.id !== edge && !removedElements.has(item.sourceId) && !removedElements.has(item.targetId)) });
    setSelectedAnnotation(null); setSelectedEdge(null);
  };
  const centerPoint = () => {
    const bounds = surface.current?.getBoundingClientRect();
    return bounds && flow.current ? flow.current.screenToFlowPosition({ x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 }) : { x: 0, y: 0 };
  };
  const addCard = (cardId: string, point = centerPoint()) => {
    const state = current.current; if (!state || !cardMap.has(cardId) || cardMap.get(cardId)?.trashed) return;
    const placement = createCanvasPlacement(collection.id, cardId, point);
    void commit({ ...contentOf(state), placements: [...state.placements, placement] });
  };
  const openText = (element: CanvasElement) => { setTextDraft(element); setTextValue(element.text ?? ''); };
  const selectedAnchor = anchorMode ? selectedPlacement : undefined;
  const beginGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drawing || busy.current || !board || !flow.current || event.button !== 0) return;
    if (anchorMode && !selectedAnchor) { setError('Select a card before drawing on it.'); return; }
    const point = flow.current.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    if (tool === 'text') {
      const local = selectedAnchor ? canvasAnchorPoint(point, selectedAnchor) : point;
      openText({ id: crypto.randomUUID(), canvasId: collection.id, kind: 'text', ...local, width: selectedAnchor ? 800 : 240, height: selectedAnchor ? 400 : 100,
        rotation: 0, zIndex: 1, style: { ...style }, text: '', fontSize: selectedAnchor ? 90 : 18,
        ...(selectedAnchor ? { anchorPlacementId: selectedAnchor.id, sourceRevision: cardMap.get(selectedAnchor.cardId)?.updatedAt } : {}) });
      return;
    }
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { pointerId: event.pointerId, points: [point], kind: tool === 'pen' || tool === 'highlighter' ? 'stroke' : tool as 'rectangle' | 'ellipse',
      style: { ...style, ...(tool === 'highlighter' ? { strokeWidth: Math.max(12, style.strokeWidth), opacity: .3 } : {}) }, anchor: selectedAnchor };
  };
  const drawGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = gesture.current; if (!active || active.pointerId !== event.pointerId || !flow.current) return;
    const point = flow.current.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    if (active.kind === 'stroke') {
      const last = active.points.at(-1)!;
      if (Math.hypot(point.x - last.x, point.y - last.y) > 1 / viewport.zoom && active.points.length < CANVAS_LIMITS.points) active.points.push(point);
    } else active.points = [active.points[0], point];
    setPreview(canvasGestureElement(collection.id, active.kind, active.points, active.style));
  };
  const endGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = gesture.current; if (!active || active.pointerId !== event.pointerId) return;
    drawGesture(event);
    gesture.current = null; setPreview(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const element = canvasGestureElement(collection.id, active.kind, active.points, active.style, active.anchor, active.anchor ? cardMap.get(active.anchor.cardId)?.updatedAt : undefined);
    if (element && current.current) void commit({ ...contentOf(current.current), elements: [...current.current.elements, element] });
  };
  const cancelGesture = () => { gesture.current = null; setPreview(null); };
  const rotateSelected = (degrees: number, reset = false) => {
    const state = current.current; if (!state) return;
    void commit({ ...contentOf(state), placements: state.placements.map(item => activeIds.includes(item.id) ? { ...item, rotation: reset ? 0 : normalizeRotation(item.rotation + degrees) } : item),
      elements: state.elements.map(item => activeIds.includes(item.id) ? { ...item, rotation: reset ? 0 : normalizeRotation(item.rotation + degrees) } : item) });
  };
  const historyKey = (event: React.KeyboardEvent) => {
    if ((event.target as HTMLElement).closest('input,textarea,select,[contenteditable="true"]')) return;
    if (event.key === 'Escape') { cancelGesture(); setTool('select'); return; }
    if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) { event.preventDefault(); event.stopPropagation(); if (event.shiftKey || event.key.toLowerCase() === 'y') redoCommand(); else undoCommand(); }
    if (['Delete', 'Backspace'].includes(event.key) && (activeIds.length || selectedEdge)) { event.preventDefault(); removeObjects(); }
  };
  const edges = visibleCanvasConnectors(content).filter(connector => {
    const globalIds = new Set(nodes.map(node => node.id)); return globalIds.has(connector.sourceId) && globalIds.has(connector.targetId);
  }).map(connector => {
    const marker = { type: MarkerType.ArrowClosed, color: connector.color, width: 18, height: 18 };
    return { id: connector.id, source: connector.sourceId, target: connector.targetId, sourceHandle: 'source', targetHandle: 'target', label: connector.label, selected: selectedEdge === connector.id, style: { stroke: connector.color, strokeWidth: 2 },
      markerEnd: connector.arrow === 'end' || connector.arrow === 'both' ? marker : undefined, markerStart: connector.arrow === 'both' ? marker : undefined };
  });
  const setConnectorArrow = (arrow: 'none' | 'end' | 'both') => {
    const state = current.current; if (!state || !selectedEdge) return;
    void commit({ ...contentOf(state), connectors: state.connectors.map(item => item.id === selectedEdge ? { ...item, arrow } : item) });
  };
  const selectedArrow = content.connectors.find(item => item.id === selectedEdge)?.arrow ?? 'none';
  const hiddenCount = content.placements.filter(item => item.removed).length + content.elements.length - visibleCanvasElements(content).length + content.connectors.length - visibleCanvasConnectors(content).length;
  // Pointer previews and node measurements must not invalidate every mounted card's context.
  const callbacks = useRef<NodeContextValue | null>(null);
  callbacks.current = { cards: cardMap, content, tool, aspect, find, onResize: updateGeometry, onEdit: onEditCard, onRestore: onRestoreCard, onText: openText,
    onAnnotation: id => { if (tool === 'eraser') removeObjects([id], null); else setSelectedAnnotation(id); } };
  const nodeContext = useMemo<NodeContextValue>(() => ({ cards: cardMap, content, tool, aspect, find,
    onResize: (id, geometry) => callbacks.current?.onResize(id, geometry), onEdit: id => callbacks.current?.onEdit(id),
    onRestore: id => callbacks.current?.onRestore(id), onText: element => callbacks.current?.onText(element), onAnnotation: id => callbacks.current?.onAnnotation(id),
  }), [cardMap, content, tool, aspect, find]);

  const toolButton = (item: { id: Tool; label: string }) => <button type="button" key={item.id} className="canvas-icon-button" aria-label={item.label} data-tip={item.label} aria-pressed={tool === item.id} disabled={!board || saving}
    onClick={() => { cancelGesture(); setTool(item.id); }}><CanvasIcon name={item.id} /></button>;
  const iconButton = (label: string, icon: CanvasIconName, onClick: () => void, disabled: boolean, pressed?: boolean) =>
    <button type="button" className="canvas-icon-button" aria-label={label} data-tip={label} disabled={disabled} aria-pressed={pressed} onClick={onClick}><CanvasIcon name={icon} /></button>;
  const boardColor = board?.document.background;
  const lightBoard = boardColor ? isLightColor(boardColor) : undefined;
  const chooseBackground = (color: string | undefined) => {
    const state = current.current; if (!state) return;
    const next = { ...state, document: { ...state.document, background: color } };
    current.current = next; setBoard(next);
    void saveCanvasBackground(collection.id, color).catch(() => setError('Board background could not be saved.'));
  };
  const showStyle = drawing || tool === 'connector' || anchorMode;

  return <div className="canvas-panel panel canvas-studio" role="region" aria-label={`Canvas ${collection.name}`} aria-busy={!board || saving} data-collection-id={collection.id} tabIndex={0} onKeyDown={historyKey} data-history={historyVersion}>
    <div ref={surface} className={`canvas-surface canvas-tool-${tool}`} data-board-tone={lightBoard === undefined ? undefined : lightBoard ? 'light' : 'dark'}
      style={boardColor ? { '--board-bg': boardColor } as React.CSSProperties : undefined}
      onDragOver={event => { if (event.dataTransfer.types.includes(CANVAS_CARD_MIME)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } }}
      onDrop={event => { event.preventDefault(); const cardId = event.dataTransfer.getData(CANVAS_CARD_MIME); if (flow.current) addCard(cardId, flow.current.screenToFlowPosition({ x: event.clientX, y: event.clientY })); }}>
      {board && <NodeContext.Provider value={nodeContext}>
        <ReactFlow<CanvasNode> key={`${collection.id}-${reload}`} nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView={!board.viewport} defaultViewport={board.viewport} minZoom={.15} maxZoom={2} onlyRenderVisibleElements
          deleteKeyCode={null} nodesDraggable={tool === 'select' && !saving} nodesConnectable={tool === 'connector' && !saving} elementsSelectable={['select', 'connector', 'eraser'].includes(tool)}
          panOnDrag={tool === 'hand' ? true : [1, 2]} selectionOnDrag={tool === 'select'} selectionKeyCode="Shift" multiSelectionKeyCode={['Meta', 'Control', 'Shift']}
          onInit={instance => { flow.current = instance; }} onNodesChange={changes => setNodes(items => applyNodeChanges(changes.filter(change => change.type !== 'remove'), items))}
          onNodeDragStop={(_, node, moved) => moveNodes(moved.length ? moved : [node])} onSelectionDragStop={(_, moved) => moveNodes(moved)}
          onSelectionChange={({ nodes: selection }) => setSelected(previous => { const ids = selection.map(node => node.id); return previous.join('|') === ids.join('|') ? previous : ids; })}
          onNodeClick={(_, node) => { setSelectedAnnotation(null); if (tool === 'eraser') removeObjects([node.id], null); }}
          onPaneClick={() => { setSelectedAnnotation(null); setSelectedEdge(null); }} onEdgeClick={(_, edge) => { if (tool === 'eraser') removeObjects([], edge.id); else { setSelectedEdge(edge.id); setEdgeLabel(content.connectors.find(item => item.id === edge.id)?.label ?? ''); } }}
          onConnect={connection => { const state = current.current; if (!state || !connection.source || !connection.target || connection.source === connection.target) return;
            void commit({ ...contentOf(state), connectors: [...state.connectors, { id: crypto.randomUUID(), canvasId: collection.id, sourceId: connection.source, targetId: connection.target, label: '', color: style.color, arrow: 'end' }] }); }}
          onMove={(_, next) => setViewport(next)} onMoveEnd={(_, next) => { setViewport(next);
            viewportWrites.current = viewportWrites.current.then(() => saveCanvasViewport(collection.id, next)).catch(() => setError('Canvas view could not be saved.'));
          }}>
          <CanvasInternals content={content} /><Background gap={24} size={1.4} color={lightBoard ? 'rgba(30, 40, 90, .22)' : 'rgba(150, 200, 255, .16)'} /><Controls showInteractive={false} position="bottom-right" />
        </ReactFlow>
      </NodeContext.Provider>}
      {drawing && board && <div className="canvas-drawing-layer" aria-label="Canvas drawing surface" onPointerDown={beginGesture} onPointerMove={drawGesture} onPointerUp={endGesture} onPointerCancel={cancelGesture}>
        <svg className="canvas-draft-art"><g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`}>{preview && <g transform={`translate(${preview.x} ${preview.y})`}><svg width={preview.width} height={preview.height} style={{ overflow: 'visible' }}><CanvasArtwork element={preview} /></svg></g>}</g></svg>
      </div>}
      {board && !nodes.length && <p className="canvas-empty-hint">Add a card or choose a drawing tool to start.</p>}

      <div className="canvas-float canvas-dock" role="toolbar" aria-label="Canvas tools" aria-orientation="vertical">
        {tools.slice(0, 2).map(toolButton)}<span className="canvas-float-divider" />
        {tools.slice(2, 7).map(toolButton)}<span className="canvas-float-divider" />
        {tools.slice(7).map(toolButton)}
      </div>

      <div className="canvas-float canvas-topbar" role="toolbar" aria-label="Canvas actions">
        {onBack && <button type="button" className="b-button b-button-small" aria-label="Go back" onClick={onBack}><span className="b-ring" aria-hidden="true" /><span className="b-label" aria-hidden="true">Back</span></button>}
        <span className="canvas-title" title={collection.name}>{collection.name}</span>
        <label className={`canvas-find ${boardFind ? 'has-query' : ''}`} data-tip="Find on board">
          <svg className="canvas-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.7" /><path d="m16 16 5 5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
          <input type="search" aria-label="Find on board" placeholder="Find on board" value={boardFind} onChange={event => setBoardFind(event.target.value)}
            onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setBoardFind(''); } }} />
        </label>
        <span className="canvas-float-divider" />
        {iconButton('Undo', 'undo', undoCommand, !undo.current.length || saving)}
        {iconButton('Redo', 'redo', redoCommand, !redo.current.length || saving)}
        {iconButton('Fit board', 'fit', () => { void flow.current?.fitView({ padding: .2, maxZoom: 1, duration: 260 }); }, !board || saving)}
        <span className="canvas-float-divider" />
        {iconButton('Rotate +15°', 'rotate', () => rotateSelected(15), !activeIds.length || saving)}
        {iconButton('Reset rotation', 'rotate-reset', () => rotateSelected(0, true), !activeIds.length || saving)}
        {iconButton('Remove selected', 'remove', () => removeObjects(), (!activeIds.length && !selectedEdge) || saving)}
        {iconButton('Select all', 'select-all', () => setNodes(items => items.map(node => ({ ...node, selected: true }))), !nodes.length || saving)}
        {iconButton('Clear selection', 'deselect', () => { setNodes(items => items.map(node => ({ ...node, selected: false }))); setSelected([]); setSelectedAnnotation(null); setSelectedEdge(null); }, (!selected.length && !selectedAnnotation && !selectedEdge) || saving)}
        <span className="canvas-float-divider" />
        <details className="canvas-popover-trigger canvas-background-picker">
          <summary className="canvas-icon-button" aria-label="Board background" data-tip="Board background"><CanvasIcon name="background" /></summary>
          <div className="canvas-popover" role="group" aria-label="Board background">
            <span className="canvas-popover-title">Board background</span>
            <div className="canvas-swatches">
              <button type="button" className="canvas-swatch canvas-swatch-theme" aria-label="Match theme" aria-pressed={!boardColor} onClick={() => chooseBackground(undefined)} />
              {boardBackgrounds.map(item => <button type="button" key={item.color} className="canvas-swatch" style={{ background: item.color }} aria-label={item.label} title={item.label} aria-pressed={boardColor === item.color} onClick={() => chooseBackground(item.color)} />)}
              <label className="canvas-swatch canvas-swatch-custom" title="Custom color"><input type="color" aria-label="Custom board background" value={boardColor ?? '#0b0d1c'} onChange={event => chooseBackground(event.target.value)} /></label>
            </div>
          </div>
        </details>
        {hiddenCount > 0 && <details className="canvas-popover-trigger canvas-recovery"><summary className="canvas-icon-button canvas-hidden-count" aria-label={`Hidden objects · ${hiddenCount}`} data-tip="Hidden objects"><CanvasIcon name="hidden" /><span>Hidden objects · {hiddenCount}</span></summary>
          <div className="canvas-popover">
            {content.placements.filter(item => item.removed).map(item => <div key={item.id} className="canvas-recovery-row"><span>{cardMap.get(item.cardId)?.title ?? 'Missing card'}</span><button type="button" disabled={saving} onClick={() => {
              const state = current.current; if (state) void commit({ ...contentOf(state), placements: state.placements.map(placement => placement.id === item.id ? { ...placement, removed: false } : placement) });
            }}>Restore placement</button></div>)}
            <p>Annotations and connectors return when their card placement is restored.</p>
          </div>
        </details>}
        <span className="canvas-status" role="status">{saving ? 'Saving…' : `${content.placements.filter(item => !item.removed).length} cards · ${content.elements.length} annotations`}</span>
      </div>

      {(selectedAnnotation || selectedEdge || error) && <div className="canvas-float canvas-contextbar">
        {error && <p role="alert">{error} <button type="button" disabled={saving} onClick={() => { cancelGesture(); setReload(value => value + 1); }}>Reload canvas</button></p>}
        {selectedAnnotation && <><span>Card annotation</span>
          <button type="button" className="canvas-text-button" disabled={saving} onClick={() => {
            const state = current.current, element = state?.elements.find(item => item.id === selectedAnnotation), placement = state?.placements.find(item => item.id === element?.anchorPlacementId);
            if (!state || !element || !placement) return;
            // Detach at the card's world position; inherited rotation becomes the element's own rotation.
            const sx = placement.width / 1000, sy = placement.height / 1000;
            const dx = (element.x + element.width / 2) * sx - placement.width / 2, dy = (element.y + element.height / 2) * sy - placement.height / 2;
            const angle = placement.rotation * Math.PI / 180;
            const width = element.width * sx, height = element.height * sy;
            const detached = { ...element, anchorPlacementId: undefined, sourceRevision: undefined, x: placement.x + placement.width / 2 + dx * Math.cos(angle) - dy * Math.sin(angle) - width / 2,
              y: placement.y + placement.height / 2 + dx * Math.sin(angle) + dy * Math.cos(angle) - height / 2, width, height, rotation: normalizeRotation(element.rotation + placement.rotation),
              points: element.points?.map(point => ({ x: point.x * sx, y: point.y * sy })), fontSize: element.fontSize ? Math.max(8, Math.min(100, element.fontSize * sy)) : undefined };
            void commit({ ...contentOf(state), elements: state.elements.map(item => item.id === element.id ? detached : item) }); setSelectedAnnotation(null);
          }}><CanvasIcon name="detach" />Detach annotation</button>
          <button type="button" className="canvas-text-button" disabled={saving} onClick={() => {
            const state = current.current; if (!state) return;
            void commit({ ...contentOf(state), elements: state.elements.map(item => item.id === selectedAnnotation ? { ...item, sourceRevision: cardMap.get(state.placements.find(placement => placement.id === item.anchorPlacementId)?.cardId ?? '')?.updatedAt } : item) });
          }}><CanvasIcon name="check" />Mark reviewed</button></>}
        {selectedEdge && <span className="canvas-arrow-group" role="group" aria-label="Connector direction">
          {(['none', 'end', 'both'] as const).map(arrow => <button type="button" key={arrow} className="canvas-icon-button" aria-label={arrow === 'none' ? 'Line' : arrow === 'end' ? 'Arrow' : 'Double arrow'} data-tip={arrow === 'none' ? 'Line' : arrow === 'end' ? 'Arrow' : 'Double arrow'} aria-pressed={selectedArrow === arrow} disabled={saving} onClick={() => setConnectorArrow(arrow)}>
            <svg className="canvas-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16" fill="none" stroke="currentColor" strokeWidth="1.6" />{arrow !== 'none' && <path d="m15 7 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.6" />}{arrow === 'both' && <path d="m9 7-5 5 5 5" fill="none" stroke="currentColor" strokeWidth="1.6" />}</svg>
          </button>)}
        </span>}
        {selectedEdge && <label className="canvas-connector-label">Connector label<input aria-label="Connector label" maxLength={1000} value={edgeLabel} onChange={event => setEdgeLabel(event.target.value)} onBlur={() => {
          const state = current.current; if (state) void commit({ ...contentOf(state), connectors: state.connectors.map(item => item.id === selectedEdge ? { ...item, label: edgeLabel } : item) });
        }} /></label>}
      </div>}

      <div className={`canvas-float canvas-stylebar ${showStyle ? 'is-open' : ''}`} role="group" aria-label="Stroke style">
        <div className="canvas-swatches">
          {strokeColors.map(color => <button type="button" key={color} className="canvas-swatch" style={{ background: color }} aria-label={`Ink ${color}`} aria-pressed={style.color.toLowerCase() === color} onClick={() => setStyle({ ...style, color })} />)}
          <label className="canvas-swatch canvas-swatch-custom" title="Custom ink"><input type="color" aria-label="Canvas color" value={style.color} onChange={event => setStyle({ ...style, color: event.target.value })} /></label>
        </div>
        <span className="canvas-float-divider" />
        <label className="canvas-stroke-field" data-tip="Stroke size"><span className="canvas-stroke-dot" style={{ width: Math.min(18, 4 + style.strokeWidth / 2), height: Math.min(18, 4 + style.strokeWidth / 2) }} />
          <select aria-label="Stroke size" value={style.strokeWidth} onChange={event => setStyle({ ...style, strokeWidth: Number(event.target.value) })}>{[1, 3, 6, 12, 24].map(size => <option key={size}>{size}</option>)}</select></label>
        <label className="canvas-opacity-field" data-tip="Opacity"><input aria-label="Canvas opacity" type="range" min="0.1" max="1" step="0.1" value={style.opacity} onChange={event => setStyle({ ...style, opacity: Number(event.target.value) })} /></label>
        <span className="canvas-float-divider" />
        {iconButton('Keep image proportions', 'aspect', () => setAspect(!aspect), false, aspect)}
        {iconButton('Draw on selected card', 'anchor', () => setAnchorMode(!anchorMode), false, anchorMode)}
      </div>

      <details className="canvas-float canvas-card-picker">
        <summary><CanvasIcon name="add" /><span>Add cards from library</span></summary>
        <div className="canvas-popover canvas-picker-panel">
          <input type="search" aria-label="Find cards for canvas" placeholder="Find a card" value={query} onChange={event => setQuery(event.target.value)} />
          <div className="canvas-picker-cards">{cards.filter(card => !card.trashed && `${card.title} ${card.note}`.toLowerCase().includes(query.toLowerCase())).slice(0, 100).map(card =>
            <button type="button" key={card.id} disabled={!board || saving} draggable onDragStart={event => { event.dataTransfer.setData(CANVAS_CARD_MIME, card.id); event.dataTransfer.effectAllowed = 'copy'; }} onClick={() => addCard(card.id)} aria-label={`Add ${card.title}`}>
              {(card.type === 'image' || card.type === 'pdf') && card.dataUrl ? <img src={card.dataUrl} alt="" draggable={false} /> : <span className="canvas-picker-kind">{card.type === 'text' ? 'NOTE' : 'LINK'}</span>}
              <span className="canvas-picker-title">{card.title}</span>
            </button>)}
            {!cards.some(card => !card.trashed) && <p>No cards yet. Add a card to your library first.</p>}
          </div>
        </div>
      </details>
    </div>
    {textDraft && <Dialog label="Canvas text" className="canvas-text-dialog" onClose={() => { if (!saving) setTextDraft(null); }}>
      <form onSubmit={async event => { event.preventDefault(); const state = current.current; if (!state || !textValue.trim()) return;
        const next = { ...textDraft, text: textValue };
        const exists = state.elements.some(item => item.id === next.id);
        if (await commit({ ...contentOf(state), elements: exists ? state.elements.map(item => item.id === next.id ? next : item) : [...state.elements, next] })) setTextDraft(null);
      }}><h2>Canvas text</h2>{error && <p role="alert">{error}</p>}<textarea aria-label="Annotation text" maxLength={CANVAS_LIMITS.text} value={textValue} onChange={event => setTextValue(event.target.value)} autoFocus />
        <button type="button" disabled={saving} onClick={() => setTextDraft(null)}>Cancel</button><button type="submit" disabled={saving || !textValue.trim()}>Save text</button></form>
    </Dialog>}
  </div>;
}
