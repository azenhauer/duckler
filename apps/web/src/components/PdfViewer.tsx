import { useEffect, useState } from 'react';
import type { PdfDocument } from '@visual-library/shared';
import type { LoadedPdf } from '../lib/pdf';

/** Page-by-page PDF viewer (lazy pdf.js) with "capture this page as an image card". */
export function PdfViewer({ pdf, onCapture }: { pdf: PdfDocument; onCapture?: (page: number, image: string) => Promise<void> }) {
  const [page, setPage] = useState(1);
  // The rendered image remembers its page, so a stale picture is never captured under a new page number.
  const [rendered, setRendered] = useState<{ page: number; src: string } | null>(null);
  const [error, setError] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [doc, setDoc] = useState<LoadedPdf | null>(null);

  useEffect(() => {
    let disposed = false;
    let opened: LoadedPdf | null = null;
    setDoc(null); setRendered(null); setError(''); setPage(1);
    void import('../lib/pdf').then(async ({ openPdf }) => {
      opened = await openPdf(pdf.data);
      if (disposed) { void opened.loadingTask.destroy(); return; }
      setDoc(opened);
    }).catch(reason => { if (!disposed) setError(reason instanceof Error ? reason.message : 'This PDF could not be opened.'); });
    return () => { disposed = true; void opened?.loadingTask.destroy(); };
  }, [pdf.data]);

  useEffect(() => {
    if (!doc) return;
    let disposed = false;
    void import('../lib/pdf')
      .then(({ renderPdfPage }) => renderPdfPage(doc, page, 1100))
      .then(src => { if (!disposed) setRendered({ page, src }); })
      .catch(() => { if (!disposed) setError('This page could not be rendered.'); });
    return () => { disposed = true; };
  }, [doc, page]);
  const image = rendered?.page === page ? rendered.src : '';

  return <div className="pdf-viewer">
    <div className="pdf-page">{error ? <p className="editor-error" role="alert">{error}</p> : rendered ? <img src={rendered.src} alt={`Page ${rendered.page} of ${pdf.fileName}`} aria-busy={!image} /> : <span className="pdf-loading">Loading page…</span>}</div>
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
