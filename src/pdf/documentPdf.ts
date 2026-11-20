import { jsPDF } from 'jspdf';
import { autoTable, type CellHookData } from 'jspdf-autotable';
import { calculateTotals, outstandingBalance } from '@/domain/calculations';
import { formatDate } from '@/domain/dates';
import { formatMoney } from '@/domain/money';
import type { Address, BusinessSettings, ClientSnapshot, Discount, LineItem } from '@/domain/types';
import { safeFileName } from '@/lib/csv';

/**
 * Client-facing PDF documents (invoices and quotations).
 *
 * Design: minimalist corporate elegance — white A4 page, dark typography,
 * subtle grey dividers and a restrained brand accent. This is deliberately
 * independent of the dark "Cyber Luxury" application UI.
 *
 * Layout safety for multi-page documents:
 * - the line-item table repeats its header on every page,
 * - rows are never split across pages unless a single row is taller than a page,
 * - totals, payment details, notes and terms flow onto new pages line by line,
 * - every page reserves space for the footer, so nothing overlaps or is cut off.
 */

export interface PdfDocumentInput {
  kind: 'invoice' | 'quotation';
  number: string;
  issueDate: string;
  /** Due date (invoice) or expiry date (quotation). */
  endDate: string;
  client: ClientSnapshot;
  projectName?: string | null;
  /** e.g. the quotation number an invoice was converted from. */
  reference?: string | null;
  items: LineItem[];
  discount: Discount;
  vatEnabled: boolean;
  vatRate: number;
  currency: string;
  amountPaid?: number;
  paymentInstructions?: string;
  notes: string;
  terms: string;
  /** Adds a diagonal watermark (e.g. DRAFT, CANCELLED, SAMPLE). */
  watermark?: string | null;
}

const PAGE_W = 210;
const PAGE_H = 297;
const M = 18; // page margin (mm)
const CONTENT_W = PAGE_W - M * 2;
const FOOTER_Y = PAGE_H - 13;
const BOTTOM_LIMIT = FOOTER_Y - 8; // content must end above this
const CONT_TOP = 24; // content start on continuation pages

const INK = '#111318';
const BODY = '#3A3F4A';
const MUTED = '#7A808C';
const RULE = '#E3E6EB';
const PANEL = '#F5F6F8';

const PT_TO_MM = 25.4 / 72;

function lineHeight(fontSizePt: number, factor = 1.15) {
  return fontSizePt * factor * PT_TO_MM;
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [57, 133, 255];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function addressLines(a: Address | undefined): string[] {
  if (!a) return [];
  const cityLine = [a.city, a.province, a.postalCode].filter((x) => x?.trim()).join(', ');
  return [a.line1, a.line2, cityLine, a.country].map((x) => x?.trim()).filter(Boolean) as string[];
}

function imageFormat(dataUrl: string): string {
  const m = /^data:image\/(png|jpe?g|webp)/i.exec(dataUrl);
  if (!m) return 'PNG';
  const f = m[1].toLowerCase();
  return f === 'jpg' || f === 'jpeg' ? 'JPEG' : f.toUpperCase();
}

/**
 * Currency text for PDFs. The standard PDF fonts only cover Latin-1 plus €, so
 * symbols outside that set (e.g. ₦) fall back to the ISO code: "NGN 1,250.00".
 */
export function pdfMoney(cents: number, currency: string): string {
  const text = formatMoney(cents, currency);
  if (!/[^\u0000-\u00ff€]/.test(text)) return text;
  return `${cents < 0 ? '-' : ''}${currency} ${formatMoney(Math.abs(cents), currency, { symbol: false })}`;
}

export function documentTitle(input: Pick<PdfDocumentInput, 'kind' | 'vatEnabled'>): string {
  if (input.kind === 'quotation') return 'QUOTATION';
  // South African VAT vendors must label VAT invoices "Tax Invoice".
  return input.vatEnabled ? 'TAX INVOICE' : 'INVOICE';
}

class Writer {
  doc: jsPDF;
  y = M;
  constructor(doc: jsPDF) {
    this.doc = doc;
  }
  font(size: number, style: 'normal' | 'bold' = 'normal', color = BODY) {
    this.doc.setFont('helvetica', style);
    this.doc.setFontSize(size);
    this.doc.setTextColor(color);
  }
  /** Ensure `height` mm fits on the current page, otherwise start a new one. */
  ensure(height: number) {
    if (this.y + height > BOTTOM_LIMIT) {
      this.doc.addPage();
      this.y = CONT_TOP;
    }
  }
  spacedText(text: string, x: number, y: number, spacing: number, align: 'left' | 'right' = 'left') {
    const width = this.doc.getTextWidth(text) + spacing * Math.max(text.length - 1, 0);
    const startX = align === 'right' ? x - width : x;
    this.doc.text(text, startX, y, { charSpace: spacing, baseline: 'top' });
    return width;
  }
  kicker(text: string, x: number, y: number, align: 'left' | 'right' = 'left') {
    this.font(6.8, 'bold', MUTED);
    this.spacedText(text.toUpperCase(), x, y, 0.45, align);
  }
  rule(y: number, x1 = M, x2 = PAGE_W - M, color = RULE, width = 0.25) {
    this.doc.setDrawColor(color);
    this.doc.setLineWidth(width);
    this.doc.line(x1, y, x2, y);
  }
  /** Draw wrapped paragraphs flowing across pages. */
  paragraph(text: string, x: number, width: number, size = 8.8, color = BODY) {
    this.font(size, 'normal', color);
    const lh = lineHeight(size, 1.35);
    for (const raw of text.split(/\r?\n/)) {
      const lines: string[] = raw.trim() === '' ? [''] : this.doc.splitTextToSize(raw, width);
      for (const line of lines) {
        this.ensure(lh);
        this.font(size, 'normal', color);
        this.doc.text(line, x, this.y, { baseline: 'top' });
        this.y += lh;
      }
    }
  }
}

export async function buildDocumentPdf(input: PdfDocumentInput, settings: BusinessSettings): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const w = new Writer(doc);
  const accent = hexToRgb(settings.documentAccentColor || '#3985FF');
  const totals = calculateTotals(input);
  const money = (c: number) => pdfMoney(c, input.currency);
  const date = (d: string) => formatDate(d, settings.dateFormat);
  const isInvoice = input.kind === 'invoice';
  const title = documentTitle(input);

  doc.setProperties({
    title: `${title} ${input.number}`,
    subject: `${title} ${input.number} — ${settings.businessName}`,
    author: settings.businessName,
    creator: 'ASPECTS STUDIOS Invoice Manager',
  });

  /* ---------------------------------------------------------- Header */
  doc.setFillColor(...accent);
  doc.rect(0, 0, PAGE_W, 1.6, 'F');

  let headerBottom = M + 14;
  let logoDrawn = false;
  if (settings.logoDataUrl) {
    try {
      const props = doc.getImageProperties(settings.logoDataUrl);
      const maxW = 52;
      const maxH = 20;
      const ratio = Math.min(maxW / props.width, maxH / props.height);
      const lw = props.width * ratio;
      const lh = props.height * ratio;
      doc.addImage(settings.logoDataUrl, imageFormat(settings.logoDataUrl), M, M - 2, lw, lh, undefined, 'FAST');
      headerBottom = Math.max(headerBottom, M - 2 + lh);
      logoDrawn = true;
    } catch (err) {
      console.warn('[pdf] logo could not be embedded', err);
    }
  }
  if (!logoDrawn) {
    w.font(15, 'bold', INK);
    w.spacedText(settings.businessName.toUpperCase(), M, M - 1, 0.9);
    if (settings.tagline) {
      w.font(7.5, 'normal', MUTED);
      w.spacedText(settings.tagline.toUpperCase(), M, M + 6.2, 0.6);
    }
  }

  w.font(20, 'bold', INK);
  w.spacedText(title, PAGE_W - M, M - 2, 1.4, 'right');
  w.font(9.5, 'normal', MUTED);
  doc.text(input.number, PAGE_W - M, M + 7, { align: 'right', baseline: 'top' });

  w.y = headerBottom + 7;
  w.rule(w.y);
  w.y += 7;

  /* ---------------------------------------------- From / Bill to / Details */
  const colTop = w.y;
  const colW = 54;
  const col2X = M + colW + 6;
  const col3X = M + (colW + 6) * 2;
  const col3W = PAGE_W - M - col3X;
  const small = 8.3;
  const lh = lineHeight(small, 1.3);

  const block = (x: number, heading: string, strong: string, lines: string[]) => {
    let y = colTop;
    w.kicker(heading, x, y);
    y += 5;
    w.font(9.4, 'bold', INK);
    for (const l of doc.splitTextToSize(strong, colW) as string[]) {
      doc.text(l, x, y, { baseline: 'top' });
      y += lineHeight(9.4, 1.25);
    }
    y += 0.6;
    w.font(small, 'normal', BODY);
    for (const line of lines) {
      for (const l of doc.splitTextToSize(line, colW) as string[]) {
        doc.text(l, x, y, { baseline: 'top' });
        y += lh;
      }
    }
    return y;
  };

  const fromLines = [
    ...addressLines(settings.address),
    settings.email,
    settings.phone,
    settings.website,
    settings.registrationNumber ? `Reg. No: ${settings.registrationNumber}` : '',
    settings.vatRegistrationNumber ? `VAT No: ${settings.vatRegistrationNumber}` : '',
  ].filter(Boolean);
  const fromBottom = block(M, 'From', settings.businessName, fromLines);

  const c = input.client;
  const clientStrong = c.companyName?.trim() || c.name?.trim() || 'Client';
  const clientLines = [
    c.companyName?.trim() && c.name?.trim() ? `Attn: ${c.name}` : '',
    ...addressLines(c.billingAddress),
    c.email,
    c.phone,
    c.registrationNumber ? `Reg. No: ${c.registrationNumber}` : '',
    c.vatNumber ? `VAT No: ${c.vatNumber}` : '',
  ].filter(Boolean);
  const toBottom = block(col2X, isInvoice ? 'Bill to' : 'Prepared for', clientStrong, clientLines);

  // Details column
  let dy = colTop;
  w.kicker('Details', col3X, dy);
  dy += 5;
  const details: [string, string][] = [
    ['Issue date', date(input.issueDate)],
    [isInvoice ? 'Due date' : 'Valid until', date(input.endDate)],
  ];
  if (input.projectName) details.push(['Project', input.projectName]);
  if (input.reference) details.push([isInvoice ? 'Quotation ref.' : 'Reference', input.reference]);
  for (const [k, v] of details) {
    w.font(small, 'normal', MUTED);
    doc.text(k, col3X, dy, { baseline: 'top' });
    w.font(small, 'bold', INK);
    const valueLines = doc.splitTextToSize(v, col3W - 24) as string[];
    valueLines.forEach((l, i) => doc.text(l, PAGE_W - M, dy + i * lh, { align: 'right', baseline: 'top' }));
    dy += lh * valueLines.length + 0.8;
  }
  dy += 2;
  const paid = input.amountPaid ?? 0;
  const due = isInvoice ? outstandingBalance(totals.total, paid) : totals.total;
  doc.setFillColor(PANEL);
  doc.roundedRect(col3X, dy, col3W, 15, 1.2, 1.2, 'F');
  doc.setFillColor(...accent);
  doc.rect(col3X, dy, 0.9, 15, 'F');
  w.kicker(isInvoice ? (paid > 0 ? 'Balance due' : 'Amount due') : 'Total quoted', col3X + 4, dy + 2.8);
  w.font(13, 'bold', INK);
  doc.text(money(due), PAGE_W - M - 3, dy + 7.3, { align: 'right', baseline: 'top' });
  dy += 15;

  w.y = Math.max(fromBottom, toBottom, dy) + 8;

  /* ------------------------------------------------------- Line items */
  const showVat = input.vatEnabled;
  const widths = { idx: 9, qty: 15, unit: 28, vat: showVat ? 15 : 0, amount: 30 };
  const descW = CONTENT_W - widths.idx - widths.qty - widths.unit - widths.vat - widths.amount;
  const pad = { top: 2.6, bottom: 2.6, left: 2.2, right: 2.2 };
  const descTextW = descW - pad.left - pad.right;
  const titleSize = 9;
  const descSize = 8;
  const rowLH = lineHeight(titleSize);

  const meta = input.items.map((item) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(titleSize);
    const titleLines = doc.splitTextToSize(item.title || 'Item', descTextW) as string[];
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(descSize);
    const descLines = item.description.trim() ? (doc.splitTextToSize(item.description.trim(), descTextW) as string[]) : [];
    return { titleLines, descLines };
  });

  const vatLabel = (cat: LineItem['vatCategory']) => (cat === 'standard' ? `${input.vatRate}%` : cat === 'zero' ? '0%' : 'Exempt');
  const qtyText = (q: number) => (Number.isInteger(q) ? String(q) : q.toFixed(q * 100 === Math.round(q * 100) ? 2 : 3).replace(/0+$/, ''));

  const head = [['#', 'Description', 'Qty', 'Unit price', ...(showVat ? [settings.vatLabel || 'VAT'] : []), 'Amount']];
  const body = input.items.map((item, i) => [
    String(i + 1).padStart(2, '0'),
    '',
    qtyText(item.quantity),
    money(item.unitPrice),
    ...(showVat ? [vatLabel(item.vatCategory)] : []),
    money(totals.lineTotals[item.id] ?? 0),
  ]);
  const amountCol = showVat ? 5 : 4;

  autoTable(doc, {
    head,
    body,
    startY: w.y,
    margin: { left: M, right: M, top: CONT_TOP, bottom: PAGE_H - BOTTOM_LIMIT },
    theme: 'plain',
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    styles: {
      font: 'helvetica',
      fontSize: titleSize,
      textColor: BODY,
      cellPadding: pad,
      lineColor: RULE,
      valign: 'top',
      overflow: 'linebreak',
    },
    headStyles: { fillColor: PANEL, textColor: MUTED, fontStyle: 'bold', fontSize: 7, cellPadding: { top: 2.6, bottom: 2.4, left: 2.2, right: 2.2 } },
    columnStyles: {
      0: { cellWidth: widths.idx, textColor: MUTED, fontSize: 8 },
      1: { cellWidth: descW },
      2: { cellWidth: widths.qty, halign: 'right' },
      3: { cellWidth: widths.unit, halign: 'right' },
      ...(showVat ? { 4: { cellWidth: widths.vat, halign: 'right' as const, textColor: MUTED, fontSize: 8 } } : {}),
      [amountCol]: { cellWidth: widths.amount, halign: 'right', textColor: INK, fontStyle: 'bold' },
    },
    didParseCell: (data: CellHookData) => {
      if (data.section === 'head') {
        data.cell.text = data.cell.text.map((t) => t.toUpperCase());
        if (data.column.index >= 2) data.cell.styles.halign = 'right';
      }
      if (data.section === 'body' && data.column.index === 1) {
        const m = meta[data.row.index];
        // Reserve exact height for title + description; the text itself is drawn in didDrawCell.
        const neededMm =
          m.titleLines.length * rowLH + (m.descLines.length ? 0.6 + m.descLines.length * lineHeight(descSize, 1.3) : 0);
        data.cell.text = [];
        data.cell.styles.minCellHeight = neededMm + pad.top + pad.bottom;
      }
    },
    didDrawCell: (data: CellHookData) => {
      if (data.section === 'body') {
        // subtle row divider
        doc.setDrawColor(RULE);
        doc.setLineWidth(0.2);
        doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
      }
      if (data.section !== 'body' || data.column.index !== 1) return;
      const m = meta[data.row.index];
      let ty = data.cell.y + pad.top;
      const tx = data.cell.x + pad.left;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(titleSize);
      doc.setTextColor(INK);
      for (const l of m.titleLines) {
        doc.text(l, tx, ty, { baseline: 'top' });
        ty += rowLH;
      }
      if (m.descLines.length) {
        ty += 0.6;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(descSize);
        doc.setTextColor(MUTED);
        for (const l of m.descLines) {
          doc.text(l, tx, ty, { baseline: 'top' });
          ty += lineHeight(descSize, 1.3);
        }
      }
    },
  });

  w.y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  /* ------------------------------------------------------------- Totals */
  const rows: { label: string; value: string; strong?: boolean; tone?: string }[] = [{ label: 'Subtotal', value: money(totals.subtotal) }];
  if (totals.discount > 0) {
    const label = input.discount.type === 'percent' ? `Discount (${input.discount.value}%)` : 'Discount';
    rows.push({ label, value: `-${money(totals.discount)}` });
  }
  if (input.vatEnabled) rows.push({ label: `${settings.vatLabel || 'VAT'} (${input.vatRate}%)`, value: money(totals.vat) });
  rows.push({ label: 'Total', value: money(totals.total), strong: true });
  if (isInvoice && paid > 0) {
    rows.push({ label: 'Amount paid', value: `-${money(paid)}` });
    rows.push({ label: 'Balance due', value: money(due), strong: true });
  }

  const totalsX = PAGE_W - M - 78;
  const rowH = 6.4;
  w.ensure(rows.length * rowH + 6);
  for (const r of rows) {
    if (r.strong) {
      w.rule(w.y - 0.6, totalsX, PAGE_W - M, INK, 0.35);
      w.y += 1.4;
    }
    w.font(r.strong ? 9.6 : 8.6, r.strong ? 'bold' : 'normal', r.strong ? INK : MUTED);
    doc.text(r.label, totalsX, w.y, { baseline: 'top' });
    w.font(r.strong ? 10.6 : 8.8, r.strong ? 'bold' : 'normal', INK);
    doc.text(r.value, PAGE_W - M, w.y, { align: 'right', baseline: 'top' });
    w.y += rowH + (r.strong ? 0.8 : 0);
  }
  if (isInvoice && paid > 0 && due === 0) {
    w.font(8, 'bold', '#1E9E68');
    w.spacedText('PAID IN FULL', PAGE_W - M, w.y + 0.5, 0.8, 'right');
    w.y += 6;
  }
  w.y += 6;

  /* ------------------------------------------------- Text sections */
  const section = (heading: string, text: string | undefined, panel = false) => {
    if (!text?.trim()) return;
    w.ensure(14);
    w.kicker(heading, M, w.y);
    w.y += 5;
    if (panel) {
      // Measure, then draw a soft panel behind the text (only if it fits on this page).
      w.font(8.8);
      const lines = text.split(/\r?\n/).flatMap((l) => (l.trim() ? (doc.splitTextToSize(l, CONTENT_W - 8) as string[]) : ['']));
      const h = lines.length * lineHeight(8.8, 1.35) + 6;
      if (w.y + h <= BOTTOM_LIMIT) {
        doc.setFillColor(PANEL);
        doc.roundedRect(M, w.y - 1, CONTENT_W, h, 1.2, 1.2, 'F');
        w.y += 2;
        w.paragraph(text, M + 4, CONTENT_W - 8);
        w.y += 9;
        return;
      }
    }
    w.paragraph(text, M, CONTENT_W);
    w.y += 5;
  };

  if (isInvoice) section('Payment information', input.paymentInstructions, true);
  section('Notes', input.notes);
  section('Terms & conditions', input.terms);

  if (!isInvoice) {
    w.ensure(26);
    w.y += 4;
    w.kicker('Acceptance', M, w.y);
    w.y += 5;
    w.font(8.4, 'normal', BODY);
    doc.text('To accept this quotation, please sign below and return a copy, or confirm acceptance in writing.', M, w.y, { baseline: 'top' });
    w.y += 13;
    const sig = (x: number, label: string) => {
      w.rule(w.y, x, x + 52, BODY, 0.25);
      w.font(7.2, 'normal', MUTED);
      doc.text(label, x, w.y + 1.8, { baseline: 'top' });
    };
    sig(M, 'Name');
    sig(M + 60, 'Signature');
    sig(M + 120, 'Date');
    w.y += 8;
  }

  /* ------------------------------------ Running headers, footers, watermark */
  const pages = doc.getNumberOfPages();
  const footerLeft = [settings.businessName, settings.website, settings.email].filter(Boolean).join('  ·  ');
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    if (p > 1) {
      doc.setFillColor(...accent);
      doc.rect(0, 0, PAGE_W, 1.6, 'F');
      w.font(7.4, 'bold', MUTED);
      w.spacedText(settings.businessName.toUpperCase(), M, 11, 0.5);
      w.font(7.4, 'normal', MUTED);
      doc.text(`${title}  ${input.number}  (continued)`, PAGE_W - M, 11, { align: 'right', baseline: 'top' });
    }
    w.rule(FOOTER_Y - 3);
    w.font(7.2, 'normal', MUTED);
    doc.text(footerLeft, M, FOOTER_Y, { baseline: 'top' });
    doc.text(`Page ${p} of ${pages}`, PAGE_W - M, FOOTER_Y, { align: 'right', baseline: 'top' });

    if (input.watermark) {
      const gs = new (doc as unknown as { GState: new (o: { opacity: number }) => unknown }).GState({ opacity: 0.07 });
      (doc as unknown as { setGState: (g: unknown) => void }).setGState(gs);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(96);
      doc.setTextColor(INK);
      doc.text(input.watermark, PAGE_W / 2, PAGE_H / 2 + 20, { align: 'center', angle: 35 });
      (doc as unknown as { setGState: (g: unknown) => void }).setGState(
        new (doc as unknown as { GState: new (o: { opacity: number }) => unknown }).GState({ opacity: 1 }),
      );
    }
  }

  return doc;
}

export function pdfFileName(input: Pick<PdfDocumentInput, 'number'>): string {
  return `${safeFileName(input.number)}.pdf`;
}

export async function pdfBlob(input: PdfDocumentInput, settings: BusinessSettings): Promise<Blob> {
  const doc = await buildDocumentPdf(input, settings);
  return doc.output('blob');
}
