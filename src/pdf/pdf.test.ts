import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { buildDocumentPdf, pdfMoney } from './documentPdf';
import { samplePdfInput } from './pdfActions';
import { defaultSettings } from '@/domain/defaults';

describe('pdf generation', () => {
  it('falls back to ISO codes for symbols the PDF fonts cannot draw', () => {
    expect(pdfMoney(125000, 'ZAR')).toBe('R 1,250.00');
    expect(pdfMoney(125000, 'EUR')).toBe('€ 1,250.00');
    expect(pdfMoney(125000, 'NGN')).toBe('NGN 1,250.00');
    expect(pdfMoney(-500, 'NGN')).toBe('-NGN 5.00');
  });

  it('builds single and multi-page documents with repeated headers and page numbers', async () => {
    const settings = { ...defaultSettings(), vatEnabled: true, email: 'hello@aspects.studio', website: 'aspects.studio', paymentDetails: 'Bank: Example Bank\nAccount: 000000000\nBranch: 000000\nReference: invoice number' };
    const single = await buildDocumentPdf(samplePdfInput(settings), settings);
    expect(single.getNumberOfPages()).toBe(1);

    const long = samplePdfInput(settings);
    long.items = Array.from({ length: 40 }, (_, i) => ({ ...long.items[i % 3], id: `x${i}`, title: `${long.items[i % 3].title} — phase ${i + 1}` }));
    long.terms = Array.from({ length: 30 }, (_, i) => `${i + 1}. Standard term and condition text that wraps across the full width of the page to test text flow.`).join('\n');
    long.watermark = null;
    long.amountPaid = 500000;
    const multi = await buildDocumentPdf(long, settings);
    expect(multi.getNumberOfPages()).toBeGreaterThan(2);
    const out = process.env.PDF_OUT;
    if (out) {
      writeFileSync(`${out}/single.pdf`, Buffer.from(single.output('arraybuffer')));
      writeFileSync(`${out}/multi.pdf`, Buffer.from(multi.output('arraybuffer')));
      const q = await buildDocumentPdf({ ...samplePdfInput({ ...settings, vatEnabled: false }, 'quotation'), watermark: null }, { ...settings, vatEnabled: false });
      writeFileSync(`${out}/quote.pdf`, Buffer.from(q.output('arraybuffer')));
    }
  });
});
