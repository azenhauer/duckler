import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Background, Controls, ReactFlow, NodeResizer, Handle, Position, applyNodeChanges, useUpdateNodeInternals, type Node, type NodeProps, type ReactFlowInstance, type Viewport, type ResizeParams } from '@xyflow/react';
import {
  CANVAS_CARD_MIME, CANVAS_LIMITS, createCanvasPlacement, canvasGestureElement, canvasAnchorPoint,
  defaultCanvasStyle, normalizeRotation, visibleCanvasElements, visibleCanvasConnectors,
  type CanvasContent, type CanvasState, type CanvasElement, type CanvasPlacement, type CanvasStyle, type CanvasPoint, type CardRecord, type CollectionRecord,
} from '@visual-library/shared';
import { readCanvasState, commitCanvasContent, saveCanvasViewport } from '../lib/cardDb';
import { Dialog } from './Dialog';
import { CanvasArtwork } from './CanvasArtwork';

type Tool = 'select' | 'hand' | 'pen' | 'highlighter' | 'rectangle' | 'ellipse' | 'text' | 'connector' | 'eraser';
type CanvasNode = Node<{ objectId: string; cardId?: string }, 'card' | 'element'>;
type NodeContextValue = {
  cards: Map<string, CardRecord>; content: CanvasContent; tool: Tool; aspect: boolean;
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
  const updateInternals = useUpdateNodeInternals();
  useEffect(() => { updateInternals(id); }, [id, updateInternals, placement?.rotation, placement?.width, placement?.height]);
  if (!placement) return null;
  const annotations = context.content.elements.filter(item => item.anchorPlacementId === placement.id);
  return <>
    <NodeResizer isVisible={selected && context.tool === 'select'} minWidth={120} minHeight={80} maxWidth={10000} maxHeight={10000} keepAspectRatio={context.aspect && card?.type === 'image'} onResizeEnd={(_, geometry) => context.onResize(id, geometry)} />
    <div className={`canvas-card-node canvas-card-${card?.type ?? 'missing'}`} data-card-id={data.cardId} style={{ transform: `rotate(${placement.rotation}deg)` }}>
      <ConnectHandles />
      {!card || card.trashed ? <div className="canvas-card-placeholder"><strong>{card?.title ?? 'Missing card'}</strong><p>{card ? 'Card in trash' : 'This card is no longer available'}</p>
        {card && <button type="button" className="nodrag nopan" onClick={() => context.onRestore(card.id)}>Restore card</button>}</div>
        : <>{card.type === 'image' && card.dataUrl ? <img src={card.dataUrl} alt="" draggable={false} loading="lazy" /> : <p>{card.note.slice(0, 250) || card.title}</p>}
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
  const updateInternals = useUpdateNodeInternals();
  useEffect(() => { updateInternals(id); }, [id, updateInternals, element?.rotation, element?.width, element?.height]);
  if (!element) return null;
  return <>
    <NodeResizer isVisible={selected && context.tool === 'select'} minWidth={10} minHeight={10} maxWidth={10000} maxHeight={10000} onResizeEnd={(_, geometry) => context.onResize(id, geometry)} />
    <div className="canvas-element-node" style={{ transform: `rotate(${element.rotation}deg)` }} onDoubleClick={() => { if (element.kind === 'text') context.onText(element); }}>
      <ConnectHandles /><CanvasArtwork element={element} />
    </div>
  </>;
}
const nodeTypes = { card: CardNode, element: ElementNode };
const contentOf = (state: CanvasState): CanvasContent => ({ placements: state.placements, elements: state.elements, connectors: state.connectors });
const blankContent: CanvasContent = { placements: [], elements: [], connectors: [] };
const tools: { id: Tool; label: string }[] = [{ id: 'select', label: 'Select' }, { id: 'hand', label: 'Hand' }, { id: 'pen', label: 'Pen' }, { id: 'highlighter', label: 'Highlighter' }, { id: 'rectangle', label: 'Rectangle' }, { id: 'ellipse', label: 'Ellipse' }, { id: 'text', label: 'Text' }, { id: 'connector', label: 'Connector' }, { id: 'eraser', label: 'Eraser' }];

export function CollectionCanvas({ collection, cards, onEditCard, onRestoreCard }: {
  collection: CollectionRecord; cards: CardRecord[]; onEditCard: (id: string) => void; onRestoreCard: (id: string) => void;
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
  const flow = useRef<ReactFlowInstance<CanvasNode>>(null);
  const surface = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const viewportWrites = useRef(Promise.resolve());
  const gesture = useRef<{ pointerId: number; points: CanvasPoint[]; kind: CanvasElement['kind']; style: CanvasStyle; anchor?: CanvasPlacement } | null>(null);
  const [preview, setPreview] = useState<CanvasElement | null>(null);
  const [textDraft, setTextDraft] = useState<CanvasElement | null>(null);
  const [textValue, setTextValue] = useState('');
  const cardMap = useMemo(() => new Map(cards.map(card => [card.id, card])), [cards]);
  const content = board ? contentOf(board) : blankContent;
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
  }).map(connector => ({ id: connector.id, source: connector.sourceId, target: connector.targetId, sourceHandle: 'source', targetHandle: 'target', label: connector.label, selected: selectedEdge === connector.id, style: { stroke: connector.color, strokeWidth: 2 } }));
  const hiddenCount = content.placements.filter(item => item.removed).length + content.elements.length - visibleCanvasElements(content).length + content.connectors.length - visibleCanvasConnectors(content).length;

  return <div className="canvas-panel panel" role="region" aria-label={`Canvas ${collection.name}`} aria-busy={!board || saving} data-collection-id={collection.id} tabIndex={0} onKeyDown={historyKey} data-history={historyVersion}>
    {error && <p role="alert">{error} <button type="button" disabled={saving} onClick={() => { cancelGesture(); setReload(value => value + 1); }}>Reload canvas</button></p>}
    <div className="canvas-toolbar" role="toolbar" aria-label="Canvas tools">
      {tools.map(item => <button type="button" key={item.id} aria-pressed={tool === item.id} disabled={!board || saving} onClick={() => { cancelGesture(); setTool(item.id); }}>{item.label}</button>)}
      <button type="button" disabled={!undo.current.length || saving} onClick={undoCommand}>Undo</button>
      <button type="button" disabled={!redo.current.length || saving} onClick={redoCommand}>Redo</button>
      <button type="button" disabled={!board || saving} onClick={() => { void flow.current?.fitView({ padding: .2, maxZoom: 1 }); }}>Fit board</button>
    </div>
    <div className="canvas-options">
      <label>Color<input type="color" aria-label="Canvas color" value={style.color} onChange={event => setStyle({ ...style, color: event.target.value })} /></label>
      <label>Stroke<select aria-label="Stroke size" value={style.strokeWidth} onChange={event => setStyle({ ...style, strokeWidth: Number(event.target.value) })}>{[1, 3, 6, 12, 24].map(size => <option key={size}>{size}</option>)}</select></label>
      <label>Opacity<input aria-label="Canvas opacity" type="range" min="0.1" max="1" step="0.1" value={style.opacity} onChange={event => setStyle({ ...style, opacity: Number(event.target.value) })} /></label>
      <button type="button" aria-pressed={aspect} onClick={() => setAspect(!aspect)}>Keep image proportions</button>
      <button type="button" aria-pressed={anchorMode} onClick={() => setAnchorMode(!anchorMode)}>Draw on selected card</button>
      <button type="button" disabled={!activeIds.length || saving} onClick={() => rotateSelected(15)}>Rotate +15°</button>
      <button type="button" disabled={!activeIds.length || saving} onClick={() => rotateSelected(0, true)}>Reset rotation</button>
      <button type="button" disabled={(!activeIds.length && !selectedEdge) || saving} onClick={() => removeObjects()}>Remove selected</button>
      <button type="button" disabled={!nodes.length || saving} onClick={() => setNodes(items => items.map(node => ({ ...node, selected: true })))}>Select all</button>
      <button type="button" disabled={(!selected.length && !selectedAnnotation && !selectedEdge) || saving} onClick={() => { setNodes(items => items.map(node => ({ ...node, selected: false }))); setSelected([]); setSelectedAnnotation(null); setSelectedEdge(null); }}>Clear selection</button>
      <span role="status">{saving ? 'Saving…' : `${content.placements.filter(item => !item.removed).length} cards · ${content.elements.length} annotations`}</span>
    </div>
    {selectedAnnotation && <div className="canvas-options"><span>Card annotation selected</span>
      <button type="button" disabled={saving} onClick={() => {
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
      }}>Detach annotation</button>
      <button type="button" disabled={saving} onClick={() => {
        const state = current.current; if (!state) return;
        void commit({ ...contentOf(state), elements: state.elements.map(item => item.id === selectedAnnotation ? { ...item, sourceRevision: cardMap.get(state.placements.find(placement => placement.id === item.anchorPlacementId)?.cardId ?? '')?.updatedAt } : item) });
      }}>Mark reviewed</button>
    </div>}
    {selectedEdge && <label className="canvas-connector-label">Connector label<input aria-label="Connector label" maxLength={1000} value={edgeLabel} onChange={event => setEdgeLabel(event.target.value)} onBlur={() => {
      const state = current.current; if (state) void commit({ ...contentOf(state), connectors: state.connectors.map(item => item.id === selectedEdge ? { ...item, label: edgeLabel } : item) });
    }} /></label>}
    <details className="canvas-card-picker"><summary>Add cards from library</summary>
      <input type="search" aria-label="Find cards for canvas" placeholder="Find a card" value={query} onChange={event => setQuery(event.target.value)} />
      <div className="canvas-picker-cards">{cards.filter(card => !card.trashed && `${card.title} ${card.note}`.toLowerCase().includes(query.toLowerCase())).slice(0, 100).map(card =>
        <button type="button" key={card.id} disabled={!board || saving} draggable onDragStart={event => { event.dataTransfer.setData(CANVAS_CARD_MIME, card.id); event.dataTransfer.effectAllowed = 'copy'; }} onClick={() => addCard(card.id)}>Add {card.title}</button>)}
        {!cards.some(card => !card.trashed) && <p>No cards yet. Add a card to your library first.</p>}
      </div>
    </details>
    {hiddenCount > 0 && <details className="canvas-recovery"><summary>Hidden objects · {hiddenCount}</summary>
      {content.placements.filter(item => item.removed).map(item => <div key={item.id}><span>{cardMap.get(item.cardId)?.title ?? 'Missing card'}</span><button type="button" disabled={saving} onClick={() => {
        const state = current.current; if (state) void commit({ ...contentOf(state), placements: state.placements.map(placement => placement.id === item.id ? { ...placement, removed: false } : placement) });
      }}>Restore placement</button></div>)}
      <p>Annotations and connectors return when their card placement is restored.</p>
    </details>}
    <div ref={surface} className={`canvas-surface canvas-tool-${tool}`} onDragOver={event => { if (event.dataTransfer.types.includes(CANVAS_CARD_MIME)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } }}
      onDrop={event => { event.preventDefault(); const cardId = event.dataTransfer.getData(CANVAS_CARD_MIME); if (flow.current) addCard(cardId, flow.current.screenToFlowPosition({ x: event.clientX, y: event.clientY })); }}>
      {board && <NodeContext.Provider value={{ cards: cardMap, content, tool, aspect, onResize: updateGeometry, onEdit: onEditCard, onRestore: onRestoreCard, onText: openText,
        onAnnotation: id => { if (tool === 'eraser') removeObjects([id], null); else setSelectedAnnotation(id); } }}>
        <ReactFlow<CanvasNode> key={`${collection.id}-${reload}`} nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView={!board.viewport} defaultViewport={board.viewport} minZoom={.15} maxZoom={2} onlyRenderVisibleElements
          deleteKeyCode={null} nodesDraggable={tool === 'select' && !saving} nodesConnectable={tool === 'connector' && !saving} elementsSelectable={['select', 'connector', 'eraser'].includes(tool)}
          panOnDrag={tool === 'hand' ? true : [1, 2]} selectionOnDrag={tool === 'select'} selectionKeyCode="Shift" multiSelectionKeyCode={['Meta', 'Control', 'Shift']}
          onInit={instance => { flow.current = instance; }} onNodesChange={changes => setNodes(items => applyNodeChanges(changes.filter(change => change.type !== 'remove'), items))}
          onNodeDragStop={(_, node, moved) => moveNodes(moved.length ? moved : [node])} onSelectionDragStop={(_, moved) => moveNodes(moved)}
          onSelectionChange={({ nodes: selection }) => setSelected(previous => { const ids = selection.map(node => node.id); return previous.join('|') === ids.join('|') ? previous : ids; })}
          onNodeClick={(_, node) => { setSelectedAnnotation(null); if (tool === 'eraser') removeObjects([node.id], null); }}
          onPaneClick={() => { setSelectedAnnotation(null); setSelectedEdge(null); }} onEdgeClick={(_, edge) => { if (tool === 'eraser') removeObjects([], edge.id); else { setSelectedEdge(edge.id); setEdgeLabel(content.connectors.find(item => item.id === edge.id)?.label ?? ''); } }}
          onConnect={connection => { const state = current.current; if (!state || !connection.source || !connection.target || connection.source === connection.target) return;
            void commit({ ...contentOf(state), connectors: [...state.connectors, { id: crypto.randomUUID(), canvasId: collection.id, sourceId: connection.source, targetId: connection.target, label: '', color: style.color }] }); }}
          onMove={(_, next) => setViewport(next)} onMoveEnd={(_, next) => { setViewport(next);
            viewportWrites.current = viewportWrites.current.then(() => saveCanvasViewport(collection.id, next)).catch(() => setError('Canvas view could not be saved.'));
          }}>
          <Background gap={24} color="#d6dbe1" /><Controls showInteractive={false} />
        </ReactFlow>
      </NodeContext.Provider>}
      {drawing && board && <div className="canvas-drawing-layer" aria-label="Canvas drawing surface" onPointerDown={beginGesture} onPointerMove={drawGesture} onPointerUp={endGesture} onPointerCancel={cancelGesture}>
        <svg className="canvas-draft-art"><g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`}>{preview && <g transform={`translate(${preview.x} ${preview.y})`}><svg width={preview.width} height={preview.height} style={{ overflow: 'visible' }}><CanvasArtwork element={preview} /></svg></g>}</g></svg>
      </div>}
      {board && !nodes.length && <p className="canvas-empty-hint">Add a card or choose a drawing tool to start.</p>}
    </div>
    <p className="canvas-help">Select to move or resize. Shift selects multiple objects. Hand pans the board. Changes save on this device.</p>
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
