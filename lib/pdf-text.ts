/**
 * Pulls the text layer out of a PDF, in the browser.
 *
 * PDF.js is Mozilla's renderer — the one Firefox ships — and it runs entirely
 * client-side. No upload, no server, no API, no cost: the file never leaves the
 * machine, which keeps the outline import as local as the pasted-text path it
 * sits beside.
 *
 * What it cannot do is read a **scanned** outline. A PDF that is photographs of
 * pages has no text layer to extract, and recognising the words in an image
 * would need OCR. `extractPdfText` returns an empty string for those rather
 * than pretending, and the caller says so.
 *
 * Loaded dynamically by the import screen so its ~1MB never reaches any other
 * page's bundle.
 */

export interface PdfExtraction {
  text: string;
  pageCount: number;
  /** True when the PDF carried no selectable text — almost always a scan. */
  looksScanned: boolean;
}

export async function extractPdfText(file: File | ArrayBuffer): Promise<PdfExtraction> {
  const pdfjs = await import('pdfjs-dist');

  /*
    PDF.js parses on a worker by default. Pointing it at the copy inside the
    installed package keeps everything local — no CDN fetch, which would both
    break offline use and quietly contradict the no-network rule.
  */
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();

  const data = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  // Keep the loading task: it owns the worker, and destroying it is what frees
  // the worker thread. The document proxy has no destroy of its own.
  const task = pdfjs.getDocument({ data: new Uint8Array(data) });
  const document = await task.promise;
  const pageCount = document.numPages;

  const pages: string[] = [];
  try {
    for (let number = 1; number <= pageCount; number += 1) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      pages.push(joinItems(content.items));
    }
  } finally {
    await task.destroy();
  }

  const text = pages.join('\n');
  return {
    text,
    pageCount,
    // A handful of stray characters from a logo is not a text layer.
    looksScanned: text.replace(/\s/g, '').length < 200,
  };
}

interface TextItemish {
  str?: string;
  hasEOL?: boolean;
  transform?: number[];
}

/**
 * Rebuilds lines from PDF.js text items.
 *
 * A PDF has no concept of a line — it has glyphs at coordinates. PDF.js reports
 * each run with a transform matrix whose last value is the y position, so items
 * sharing a y are on the same visual line. Grouping by y and joining with a
 * double space preserves the column gaps the parser relies on to tell a table
 * row from a sentence; joining on `hasEOL` alone loses table structure
 * entirely and turns every row into one long string.
 */
function joinItems(items: unknown[]): string {
  const rows = new Map<number, { x: number; str: string }[]>();

  for (const item of items) {
    const it = item as TextItemish;
    if (typeof it.str !== 'string' || it.str.trim() === '') continue;
    const transform = it.transform;
    if (!Array.isArray(transform) || transform.length < 6) continue;

    const x = Number(transform[4]);
    // Round the y so glyphs a fraction apart still count as the same line.
    const y = Math.round(Number(transform[5]));
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

    const row = rows.get(y);
    if (row) row.push({ x, str: it.str });
    else rows.set(y, [{ x, str: it.str }]);
  }

  return [...rows.entries()]
    // PDF y grows upward, so the top of the page is the largest value.
    .sort((a, b) => b[0] - a[0])
    .map(([, row]) =>
      row
        .sort((a, b) => a.x - b.x)
        .map((cell) => cell.str.trim())
        .filter(Boolean)
        // Two spaces, not one: this is the column gap the parser reads as
        // "this line was a table row".
        .join('  '),
    )
    .filter((line) => line.trim() !== '')
    .join('\n');
}
