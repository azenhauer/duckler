import { useEffect, useRef, useState } from 'react';
import { mediaFingerprint, type OcrText } from '@visual-library/shared';

const LANGUAGES = [{ id: 'eng', label: 'EN' }, { id: 'por', label: 'PT' }];

/** "Text in image": extract, cancel, retry, copy, edit and re-extract. Never blocks saving the card. */
export function OcrPanel({ dataUrl, value, onChange }: { dataUrl: string; value: OcrText | undefined; onChange: (next: OcrText | undefined) => void }) {
  const [status, setStatus] = useState<'idle' | 'running' | 'error'>('idle');
  const [progress, setProgress] = useState({ label: '', value: 0 });
  const [error, setError] = useState('');
  const [languages, setLanguages] = useState<string[]>(value?.languages?.length ? value.languages : ['eng', 'por']);
  const [copied, setCopied] = useState(false);
  const job = useRef<AbortController | null>(null);
  useEffect(() => () => job.current?.abort(), []);
  const stale = Boolean(value && value.sourceHash !== mediaFingerprint(dataUrl));

  const run = async () => {
    job.current?.abort();
    const controller = new AbortController();
    job.current = controller;
    setStatus('running'); setError(''); setProgress({ label: 'Loading OCR', value: 0 });
    try {
      const { extractText } = await import('../lib/ocr');
      const result = await extractText(dataUrl, { languages, signal: controller.signal, onProgress: next => setProgress({ label: next.status, value: next.progress }) });
      if (controller.signal.aborted) return;
      onChange(result);
      setStatus('idle');
    } catch (reason) {
      if (controller.signal.aborted || (reason as { name?: string })?.name === 'AbortError') { setStatus('idle'); return; }
      setError(reason instanceof Error && reason.message ? `Couldn't extract text: ${reason.message}` : "Couldn't extract text. Check your connection the first time (language data downloads once) and try again.");
      setStatus('error');
    } finally {
      if (job.current === controller) job.current = null;
    }
  };

  return <fieldset className="editor-field ocr-panel"><legend>Text in image</legend>
    <div className="ocr-toolbar">
      <span className="ocr-languages" role="group" aria-label="OCR languages">{LANGUAGES.map(language => <label key={language.id} className="editor-chip" data-checked={languages.includes(language.id) || undefined}>
        <input type="checkbox" checked={languages.includes(language.id)} disabled={status === 'running'} onChange={() => setLanguages(current => current.includes(language.id) ? (current.length > 1 ? current.filter(item => item !== language.id) : current) : [...current, language.id])} />{language.label}
      </label>)}</span>
      {status === 'running'
        ? <button type="button" className="editor-action" onClick={() => job.current?.abort()}><b className="glyph-cir" aria-hidden="true">○</b>Cancel</button>
        : <button type="button" className="editor-action" onClick={() => void run()}><b className="glyph-tri" aria-hidden="true">△</b>{status === 'error' ? 'Retry' : value ? 'Re-extract' : 'Extract text'}</button>}
      {value?.text && status !== 'running' && <button type="button" className="editor-action" onClick={() => { void navigator.clipboard?.writeText(value.text).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1200); }).catch(() => {}); }}><b className="glyph-sqr" aria-hidden="true">□</b>{copied ? 'Copied' : 'Copy'}</button>}
    </div>
    {status === 'running' && <div className="ocr-progress" role="progressbar" aria-label="Extracting text" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.value * 100)}>
      <span style={{ transform: `scaleX(${Math.max(.03, progress.value)})` }} /><small>{progress.label}</small></div>}
    {error && <p className="editor-error" role="alert">{error}</p>}
    {stale && <p className="ocr-stale" role="status">The image changed after this text was extracted, so it isn&apos;t used in search. Re-extract to update it.</p>}
    {value && <textarea aria-label="Extracted text" rows={4} value={value.text} onChange={event => onChange({ ...value, text: event.target.value.slice(0, 200000), editedByUser: true })} placeholder="No text found" />}
    {value?.editedByUser && <small className="ocr-meta">Edited by you · re-extracting replaces your edits</small>}
  </fieldset>;
}
