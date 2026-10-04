import { canvasStrokePath, type CanvasElement } from '@visual-library/shared';

export function CanvasArtwork({ element, strokeScale = 1 }: { element: CanvasElement; strokeScale?: number }) {
  const { kind, width, height, style } = element;
  const common = { stroke: style.color, strokeWidth: style.strokeWidth * strokeScale, fill: style.fill, opacity: style.opacity };
  return <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ overflow: 'visible' }} aria-hidden="true">
    {kind === 'stroke' && <path d={canvasStrokePath(element.points ?? [])} {...common} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
    {kind === 'rectangle' && <rect x="0" y="0" width={width} height={height} {...common} />}
    {kind === 'ellipse' && <ellipse cx={width / 2} cy={height / 2} rx={width / 2} ry={height / 2} {...common} />}
    {kind === 'text' && <foreignObject width={width} height={height}><div className="canvas-annotation-text" style={{ color: style.color, opacity: style.opacity, fontSize: element.fontSize }}>{element.text}</div></foreignObject>}
  </svg>;
}
