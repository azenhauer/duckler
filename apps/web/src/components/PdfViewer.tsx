import { useEffect, useRef, useState } from 'react';
import type { PdfDocument } from '@visual-library/shared';
import type { LoadedPdf } from '../lib/pdf';
import { selectionProps } from '../lib/textSelection';

/** A note card linked to a page of this PDF, shown as a message box over that page. */
export type PdfPageNote = { id: string; page: number; title: string; note: string };

/**
 * Page-by-page PDF viewer (lazy pdf.js): "capture this page as an image card", and a page-text panel
 * whose selected text becomes a note linked to the PDF and page. Scanned pages can be read with OCR.
 */
export function PdfViewer({ pdf, onCapture, notes = [], onCreateNote, onOpenNote }: {
  pdf: PdfDocument; onCapture?: (page: number, image: string) => Promise<void>;
  notes?: PdfPageNote[]; onCreateNote?: (page: number, text: string) => Promise<void>; onOpenNote?: (id: string) => void;
}) {
  const [page, setPage] = useState(1);
  // The rendered image remembers its page, so a stale picture is never captured under a new page number.
  const [rendered, setRendered] = useState<{ page: number; src: string } | null>(null);
  const [error, setError] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [doc, setDoc] = useState<LoadedPdf | null>(null);
  const [textOpen, setTextOpen] = useState(false);
  const [showNotes, setShowNotes] = useState(true);

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
  const pageNotes = notes.filter(item => item.page === page);

  return <div className="pdf-viewer">
    <div className="pdf-stage">
      <div className="pdf-page">
        {error ? <p className="editor-error" role="alert">{error}</p> : rendered ? <img src={rendered.src} alt={`Page ${rendered.page} of ${pdf.fileName}`} aria-busy={!image} /> : <span className="pdf-loading">Loading page…</span>}
      </div>
      {showNotes && pageNotes.length > 0 && <ul className="pdf-messages" aria-label={`Notes on page ${page}`}>
        {pageNotes.slice(0, 4).map(item => <li key={item.id}>
          <button type="button" className="pdf-message" onClick={() => onOpenNote?.(item.id)} aria-label={`Open note ${item.title}`}>
            <b>Note · p. {page}</b><span>{item.note || item.title}</span>
          </button>
        </li>)}
        {pageNotes.length > 4 && <li className="pdf-message-more">+{pageNotes.length - 4} more</li>}
      </ul>}
    </div>
    <div className="pdf-controls">
      <button type="button" className="editor-icon-button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>‹</button>
      <span className="pdf-page-number">{page} / {pdf.pageCount}</span>
      <button type="button" className="editor-icon-button" aria-label="Next page" disabled={page >= pdf.pageCount} onClick={() => setPage(value => Math.min(pdf.pageCount, value + 1))}>›</button>
      {onCapture && <button type="button" className="editor-action" disabled={!image || capturing} onClick={async () => {
        setCapturing(true);
        try { await onCapture(page, image); } finally { setCapturing(false); }
      }}><b className="glyph-crs" aria-hidden="true">✕</b>{capturing ? 'Capturing…' : 'Capture page'}</button>}
      {onCreateNote && <button type="button" className="editor-action" aria-expanded={textOpen} onClick={() => setTextOpen(open => !open)}><b className="glyph-tri" aria-hidden="true">△</b>Page text</button>}
      {notes.length > 0 && <button type="button" className="editor-action" aria-pressed={showNotes} onClick={() => setShowNotes(value => !value)}>
        <b className="glyph-sqr" aria-hidden="true">□</b>{showNotes ? 'Hide notes' : `Show notes (${notes.length})`}</button>}
    </div>
    {textOpen && onCreateNote && doc && <PageText key={page} doc={doc} page={page} image={image} onCreateNote={text => onCreateNote(page, text)} />}
  </div>;
}

/** Text of the current page: embedded text first; scanned pages offer OCR. Selected text becomes a note. */
function PageText({ doc, page, image, onCreateNote }: { doc: LoadedPdf; page: number; image: string; onCreateNote: (text: string) => Promise<void> }) {
  const [text, setText] = useState<string | null>(null);
  const [source, setSource] = useState<'embedded' | 'ocr'>('embedded');
  const [selection, setSelection] = useState('');
  const [status, setStatus] = useState<'idle' | 'reading' | 'saving'>('idle');
  const [progress, setProgress] = useState('');
  const [message, setMessage] = useState('');
  const job = useRef<AbortController | null>(null);
  useEffect(() => () => job.current?.abort(), []);

  useEffect(() => {
    let disposed = false;
    void import('../lib/pdf').then(({ extractPageText }) => extractPageText(doc, page))
      .then(value => { if (!disposed) setText(value); })
      .catch(() => { if (!disposed) setText(''); });
    return () => { disposed = true; };
  }, [doc, page]);

  const readWithOcr = async () => {
    if (!image) return;
    const controller = new AbortController(); job.current = controller;
    setStatus('reading'); setMessage(''); setProgress('Loading OCR');
    try {
      const { extractText } = await import('../lib/ocr');
      const result = await extractText(image, { signal: controller.signal, onProgress: next => setProgress(next.status) });
      if (!controller.signal.aborted) { setText(result.text); setSource('ocr'); if (!result.text) setMessage('No text found on this page.'); }
    } catch (reason) {
      if (!controller.signal.aborted && (reason as { name?: string })?.name !== 'AbortError') setMessage("Couldn't read this page. Check your connection the first time and try again.");
    } finally { if (job.current === controller) job.current = null; setStatus('idle'); }
  };
  const chosen = selection.trim();

  return <section className="pdf-text" aria-label={`Text on page ${page}`}>
    {text === null ? <p className="pdf-text-hint">Reading page text…</p>
      : text ? <>
        <textarea aria-label={`Page ${page} text`} readOnly rows={6} value={text} {...selectionProps(setSelection)} />
        <div className="pdf-text-actions">
          <span className="pdf-text-hint">{chosen ? `${chosen.length} characters selected` : `Select text to make a note${source === 'ocr' ? ' · read with OCR' : ''}`}</span>
          <button type="button" className="editor-action" disabled={!chosen || status !== 'idle'} onClick={async () => {
            setStatus('saving'); setMessage('');
            try { await onCreateNote(chosen); setSelection(''); }
            catch { setMessage("Couldn't create the note. Try again."); }
            finally { setStatus('idle'); }
          }}><b className="glyph-crs" aria-hidden="true">✕</b>{status === 'saving' ? 'Saving…' : 'Note from selection'}</button>
        </div>
      </>
      : <div className="pdf-text-actions">
        <span className="pdf-text-hint">{status === 'reading' ? progress || 'Reading…' : 'No embedded text on this page (scanned).'}</span>
        {status === 'reading'
          ? <button type="button" className="editor-action" onClick={() => job.current?.abort()}><b className="glyph-cir" aria-hidden="true">○</b>Cancel</button>
          : <button type="button" className="editor-action" disabled={!image} onClick={() => void readWithOcr()}><b className="glyph-sqr" aria-hidden="true">□</b>Read page (OCR)</button>}
      </div>}
    {message && <p className="editor-error" role="alert">{message}</p>}
  </section>;
}
