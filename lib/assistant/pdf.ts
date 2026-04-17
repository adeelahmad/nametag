// PDF → plain text extraction. Uses `pdf-parse` if it's installed; otherwise
// returns an empty string so callers can skip gracefully. The dynamic import
// keeps the dependency optional — a self-hosted deploy that never uploads
// PDFs doesn't need to install it.
//
// Limits:
//   * 50 pages
//   * 5 MiB compressed input (checked by caller)
//   * 10 MiB decompressed cap
//   * Rejects "decompression bomb"-shaped inputs where extracted text is >100×
//     input size.

export const MAX_PDF_BYTES = 5 * 1024 * 1024;
export const MAX_PDF_PAGES = 50;
export const MAX_EXTRACTED_BYTES = 10 * 1024 * 1024;
export const BOMB_RATIO = 100;

type PdfParseFn = (
  data: Buffer,
  opts?: unknown,
) => Promise<{ text: string; numpages: number }>;

export async function extractPdfText(bytes: Buffer): Promise<string> {
  if (bytes.byteLength > MAX_PDF_BYTES) {
    throw new Error('PDF exceeds 5 MiB cap');
  }
  let pdfParse: PdfParseFn | null = null;
  try {
    // Dynamic import so the dep stays optional; `as unknown as ...` because
    // `pdf-parse` has no bundled types.
    const mod = (await import('pdf-parse' as string)) as unknown as {
      default?: PdfParseFn;
    } & PdfParseFn;
    pdfParse = (mod.default ?? (mod as PdfParseFn)) as PdfParseFn;
  } catch {
    return '';
  }
  if (!pdfParse) return '';

  const result = await pdfParse(bytes, { max: MAX_PDF_PAGES });
  const text = (result.text ?? '').slice(0, MAX_EXTRACTED_BYTES);
  if (text.length > bytes.byteLength * BOMB_RATIO) {
    throw new Error('PDF extraction exceeded bomb-ratio');
  }
  return text;
}
