import { useEffect, useRef, useState } from 'react';
import type { PdfDocument } from '@visual-library/shared';

/** Page-by-page PDF viewer (lazy pdf.js) with "capture this page as an image card". */
export function PdfViewer({ pdf, onCapture }: { pdf: PdfDocument; onCapture?: (page: number, image: string) => Promise<void> }) {
  const [page, setPage] = useState(1);
  const [image, setImage] = useState('');
  const [error, setError] = useState('');
  const [capturing, setCapturing] = useState(false);
  const docRef = useRef<Awaited<ReturnType<typeof import('../lib/pdf')['openPdf']>> | null>(null);

  useEffect(() => {
    let disposed = false;
    void import('../lib/pdf').then(async ({ openPdf }) => {
      const doc = await openPdf(pdf.data);
      if (disposed) { void doc.loadingTask.destroy(); return; }
      docRef.current = doc;
      setPage(1);
    }).catch(reason => { if (!disposed) setError(reason instanceof Error ? reason.message : 'This PDF could not be opened.'); });
    return () => { disposed = true; void docRef.current?.loadingTask.destroy(); docRef.current = null; };
  }, [pdf.data]);

  useEffect(() => {
    let disposed = false;
    const render = async () => {
      for (let attempt = 0; attempt < 40 && !docRef.current && !disposed; attempt += 1) await new Promise(resolve => setTimeout(resolve, 50));
      const doc = docRef.current; if (!doc || disposed) return;
      const { renderPdfPage } = await import('../lib/pdf');
      const next = await renderPdfPage(doc, page, 1100);
      if (!disposed) setImage(next);
    };
    void render().catch(() => { if (!disposed) setError('This page could not be rendered.'); });
    return () => { disposed = true; };
  }, [page, pdf.data]);

  return <div className="pdf-viewer">
    <div className="pdf-page">{error ? <p className="editor-error" role="alert">{error}</p> : image ? <img src={image} alt={`Page ${page} of ${pdf.fileName}`} /> : <span className="pdf-loading">Loading page…</span>}</div>
    <div className="pdf-controls">
      <button type="button" className="editor-icon-button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>‹</button>
      <span className="pdf-page-number">{page} / {pdf.pageCount}</span>
      <button type="button" className="editor-icon-button" aria-label="Next page" disabled={page >= pdf.pageCount} onClick={() => setPage(value => Math.min(pdf.pageCount, value + 1))}>›</button>
      {onCapture && <button type="button" className="editor-action" disabled={!image || capturing} onClick={async () => {
        setCapturing(true);
        try { await onCapture(page, image); } finally { setCapturing(false); }
      }}><b className="glyph-crs" aria-hidden="true">✕</b>{capturing ? 'Capturing…' : 'Capture page'}</button>}
    </div>
  </div>;
}
