import { describe, expect, it } from 'vitest';
import { createLibraryBackup, parseLibraryBackup } from './backup';
import { buildSearchText, createCardFromInput, createObsidianExportArchive, hasPdfSignature, mediaFingerprint, ocrIsCurrent, type CardRecord, type OcrText } from './index';

const now = '2026-10-05T00:00:00.000Z';
const imageA = 'data:image/png;base64,' + 'QUJD'.repeat(3000);
const imageB = 'data:image/png;base64,' + 'REVG'.repeat(3000);
const pdfData = 'data:application/pdf;base64,JVBERi0xLjcKJcK1wrY=';
const ocrFor = (dataUrl: string, text = 'Pineapple Lighthouse', editedByUser = false): OcrText =>
  ({ text, sourceHash: mediaFingerprint(dataUrl), languages: ['eng', 'por'], engine: 'tesseract.js', engineVersion: '7', createdAt: now, editedByUser });

const imageCard = (): CardRecord => {
  const base = createCardFromInput({ type: 'image', title: 'Scan', dataUrl: imageA });
  const card = { ...base, ocr: ocrFor(imageA), source: { pdfCardId: 'pdf-1', page: 2, fileName: 'report.pdf' } };
  return { ...card, searchText: buildSearchText(card) };
};
const pdfCard = (): CardRecord => {
  const base = createCardFromInput({ id: 'pdf-1', type: 'pdf', title: 'Report', dataUrl: 'data:image/jpeg;base64,AAAA' });
  const card = { ...base, pdf: { fileName: 'report.pdf', pageCount: 3, data: pdfData, text: 'Zebracorn quarterly' } };
  return { ...card, searchText: buildSearchText(card) };
};

describe('OCR fingerprints', () => {
  it('is stable for the same image and changes when the image changes', () => {
    expect(mediaFingerprint(imageA)).toBe(mediaFingerprint(String(imageA)));
    expect(mediaFingerprint(imageA)).not.toBe(mediaFingerprint(imageB));
    expect(mediaFingerprint(imageA)).not.toBe(mediaFingerprint(imageA + 'QQ=='));
  });

  it('treats OCR as current only while it matches the card image', () => {
    expect(ocrIsCurrent({ dataUrl: imageA, ocr: ocrFor(imageA) })).toBe(true);
    expect(ocrIsCurrent({ dataUrl: imageB, ocr: ocrFor(imageA) })).toBe(false);
    expect(ocrIsCurrent({ dataUrl: imageA })).toBe(false);
    expect(ocrIsCurrent({ ocr: ocrFor(imageA) })).toBe(false);
  });

  it('searches current OCR and PDF text but not stale OCR', () => {
    expect(buildSearchText({ title: 'Scan', note: '', tags: [], dataUrl: imageA, ocr: ocrFor(imageA) })).toContain('pineapple lighthouse');
    expect(buildSearchText({ title: 'Scan', note: '', tags: [], dataUrl: imageB, ocr: ocrFor(imageA) })).not.toContain('pineapple');
    expect(pdfCard().searchText).toContain('zebracorn quarterly');
  });
});

describe('PDF signature', () => {
  it('accepts only bytes starting with %PDF', () => {
    expect(hasPdfSignature(new TextEncoder().encode('%PDF-1.7\n'))).toBe(true);
    expect(hasPdfSignature(new TextEncoder().encode('hello'))).toBe(false);
    expect(hasPdfSignature(new TextEncoder().encode(' %PDF'))).toBe(false);
    expect(hasPdfSignature(new Uint8Array([0x25, 0x50]))).toBe(false);
    expect(hasPdfSignature(new Uint8Array())).toBe(false);
  });
});

describe('OCR and PDF backups', () => {
  it('round-trips OCR text, PDF documents and page provenance', () => {
    const cards = [pdfCard(), imageCard()];
    const parsed = parseLibraryBackup(JSON.stringify(createLibraryBackup(cards, [], [], now)));
    expect(parsed.cards).toEqual(cards);
    expect(parsed.cards[1].ocr?.sourceHash).toBe(mediaFingerprint(imageA));
    expect(parsed.cards[1].source).toEqual({ pdfCardId: 'pdf-1', page: 2, fileName: 'report.pdf' });
  });

  it('rejects PDF data that is not a base64 PDF data URL and malformed OCR or provenance', () => {
    const withCard = (card: unknown) => JSON.stringify(createLibraryBackup([card as CardRecord], [], [], now));
    const pdf = pdfCard();
    expect(() => parseLibraryBackup(withCard({ ...pdf, pdf: { ...pdf.pdf, data: 'data:text/html;base64,PGgxPg==' } }))).toThrow('not valid');
    expect(() => parseLibraryBackup(withCard({ ...pdf, pdf: { ...pdf.pdf, data: `${pdfData}<script>` } }))).toThrow('not valid');
    expect(() => parseLibraryBackup(withCard({ ...pdf, pdf: { ...pdf.pdf, pageCount: 0 } }))).toThrow('not valid');
    const image = imageCard();
    expect(() => parseLibraryBackup(withCard({ ...image, ocr: { ...image.ocr, languages: ['a', 'b', 'c', 'd', 'e'] } }))).toThrow('not valid');
    expect(() => parseLibraryBackup(withCard({ ...image, ocr: { ...image.ocr, text: 'x'.repeat(200001) } }))).toThrow('not valid');
    expect(() => parseLibraryBackup(withCard({ ...image, source: { pdfCardId: 'pdf-1', page: 0 } }))).toThrow('not valid');
  });
});

describe('card connections', () => {
  it('round-trips links through backups and lists them in the Obsidian export', () => {
    const a = { ...createCardFromInput({ id: 'a', type: 'text', title: 'Field notes', note: 'n' }), links: [{ cardId: 'b', createdAt: now }] };
    const b = { ...createCardFromInput({ id: 'b', type: 'text', title: 'Harbour', note: 'm' }), links: [{ cardId: 'a', createdAt: now }] };
    const parsed = parseLibraryBackup(JSON.stringify(createLibraryBackup([a, b], [], [], now)));
    expect(parsed.cards.map(card => card.links)).toEqual([a.links, b.links]);
    const md = createObsidianExportArchive([a, b], []).files.find(file => file.path.startsWith('cards/field-notes--'))?.content as string;
    expect(md).toContain('Connected: [Harbour](harbour--b.md)');
    expect(() => parseLibraryBackup(JSON.stringify(createLibraryBackup([{ ...a, links: [{ cardId: '', createdAt: now }] } as CardRecord], [], [], now)))).toThrow('not valid');
  });
});

describe('Obsidian export with OCR and PDFs', () => {
  it('adds an OCR section for current text, the PDF attachment and page provenance', () => {
    const image = { ...imageCard(), ocr: ocrFor(imageA, 'Ação rápida', true) };
    const archive = createObsidianExportArchive([pdfCard(), image], []);
    const md = (title: string) => archive.files.find(file => file.path.startsWith(`cards/${title}--`))?.content as string;

    expect(md('scan')).toContain('## Text in image (OCR)');
    expect(md('scan')).toContain('tesseract.js (eng, por), edited');
    expect(md('scan')).toContain('Ação rápida');
    expect(md('scan')).toContain('Captured from page 2 of report\\.pdf');

    const pdfAttachment = archive.files.find(file => file.path.endsWith('.pdf'));
    expect(pdfAttachment?.path).toMatch(/^attachments\/report--pdf-1\.pdf$/);
    expect(Array.from((pdfAttachment?.content as Uint8Array).slice(0, 4))).toEqual([0x25, 0x50, 0x44, 0x46]);
    expect(md('report')).toContain('PDF: [report\\.pdf](../attachments/report--pdf-1.pdf) (3 pages)');
  });

  it('leaves out OCR text that no longer matches the image', () => {
    const stale = { ...imageCard(), dataUrl: imageB };
    const archive = createObsidianExportArchive([stale], []);
    const content = archive.files.find(file => file.path.startsWith('cards/'))?.content as string;
    expect(content).not.toContain('Text in image');
    expect(content).not.toContain('Pineapple');
  });
});
