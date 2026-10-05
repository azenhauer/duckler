// Suggests a title for an uploaded image from its own metadata, then from a meaningful file name.
// Automatic names ("Screenshot 2026-…", "IMG_1234", "PXL_…", hashes) are never used as titles.

const AUTO_NAME = /^(screen ?shot|screenshot|captura de tela|captura de pantalla|capture d.?[ée]cran|bildschirmfoto|schermata|snapshot|img|image|photo|pxl|dsc|dcim|mvimg|whatsapp image|signal-|telegram|untitled|unnamed|download)([\s_.-]|\d|$)/i;
const DATE_OR_HASH = /^[\d\s_.:-]+$|^[0-9a-f]{12,}$|^[0-9a-f]{8}-[0-9a-f]{4}-/i;

// eslint-disable-next-line no-control-regex -- stripping control characters from untrusted metadata is the point.
const tidy = (value: string) => value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);

/** "my_trip-to-lisbon.final.png" → "my trip to lisbon final"; automatic names → "". */
export function titleFromFileName(name: string): string {
  const stem = name.replace(/\.[a-z0-9]{2,5}$/i, '');
  if (!stem || AUTO_NAME.test(stem.trim()) || DATE_OR_HASH.test(stem.trim())) return '';
  const words = tidy(stem.replace(/[_.]+/g, ' ').replace(/(?<=\S)-(?=\S)/g, ' '));
  return words.length >= 3 ? words : '';
}

const latin1 = (bytes: Uint8Array) => { let out = ''; for (let index = 0; index < bytes.length; index += 1) out += String.fromCharCode(bytes[index]); return out; };
const utf8 = (bytes: Uint8Array) => new TextDecoder('utf-8', { fatal: false }).decode(bytes);

/** PNG tEXt / iTXt chunks: Title, then Description. */
export function pngTitle(bytes: Uint8Array): string {
  if (bytes.length < 8 || bytes[0] !== 0x89 || bytes[1] !== 0x50) return '';
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const found: Record<string, string> = {};
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = view.getUint32(offset), type = latin1(bytes.subarray(offset + 4, offset + 8));
    const data = bytes.subarray(offset + 8, Math.min(bytes.length, offset + 8 + length));
    if (type === 'tEXt' || type === 'iTXt') {
      const zero = data.indexOf(0), key = latin1(data.subarray(0, zero)).toLowerCase();
      if (zero > 0 && (key === 'title' || key === 'description')) {
        // iTXt: keyword\0 compression-flag compression-method language\0 translated\0 text (uncompressed only).
        let text = '';
        if (type === 'tEXt') text = latin1(data.subarray(zero + 1));
        else if (data[zero + 1] === 0) {
          const language = data.indexOf(0, zero + 3), translated = data.indexOf(0, language + 1);
          if (language > 0 && translated > 0) text = utf8(data.subarray(translated + 1));
        }
        if (text.trim()) found[key] ??= tidy(text);
      }
    }
    if (type === 'IEND' || length > bytes.length) break;
    offset += 12 + length;
  }
  return found.title || found.description || '';
}

/** JPEG EXIF ImageDescription (0x010e) or Windows XPTitle (0x9c9b, UTF-16LE). */
export function exifTitle(bytes: Uint8Array): string {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return '';
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 2; offset + 4 < bytes.length;) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1], size = view.getUint16(offset + 2);
    if (marker === 0xe1 && latin1(bytes.subarray(offset + 4, offset + 10)) === 'Exif\0\0') {
      const tiff = offset + 10, little = view.getUint16(tiff) === 0x4949;
      const u16 = (at: number) => view.getUint16(at, little), u32 = (at: number) => view.getUint32(at, little);
      const ifd = tiff + u32(tiff + 4);
      if (ifd + 2 > bytes.length) return '';
      for (let entry = 0, count = u16(ifd); entry < count; entry += 1) {
        const at = ifd + 2 + entry * 12;
        if (at + 12 > bytes.length) break;
        const tag = u16(at), length = u32(at + 4), start = length > 4 ? tiff + u32(at + 8) : at + 8;
        const data = bytes.subarray(start, Math.min(bytes.length, start + length));
        if (tag === 0x9c9b) { const title = tidy(new TextDecoder('utf-16le').decode(data).replace(/\0+$/, '')); if (title) return title; }
        if (tag === 0x010e) { const title = tidy(latin1(data).replace(/\0+$/, '')); if (title) return title; }
      }
      return '';
    }
    if (marker === 0xda) break;
    offset += 2 + size;
  }
  return '';
}

/** XMP dc:title, present in many exported or edited images. */
export function xmpTitle(bytes: Uint8Array): string {
  const head = latin1(bytes.subarray(0, Math.min(bytes.length, 512 * 1024)));
  const block = head.match(/<dc:title>([\s\S]*?)<\/dc:title>/);
  const value = block?.[1].match(/<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/)?.[1] ?? '';
  const decoded = utf8(Uint8Array.from(value, char => char.charCodeAt(0) & 0xff)).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
  return tidy(decoded);
}

/** Best title for an uploaded image, or "" when it carries nothing better than an automatic name. */
export async function inferImageTitle(file: File): Promise<string> {
  try {
    const bytes = new Uint8Array(await file.slice(0, 1024 * 1024).arrayBuffer());
    const fromMetadata = pngTitle(bytes) || exifTitle(bytes) || xmpTitle(bytes);
    if (fromMetadata && !AUTO_NAME.test(fromMetadata)) return fromMetadata;
  } catch { /* Unreadable metadata just falls back to the file name. */ }
  return titleFromFileName(file.name);
}
