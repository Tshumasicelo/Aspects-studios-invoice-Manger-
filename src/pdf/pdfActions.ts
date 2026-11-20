import { addDays, todayISO } from '@/domain/dates';
import { emptyAddress } from '@/domain/defaults';
import type { BusinessSettings, Invoice, Project, Quotation } from '@/domain/types';
import { downloadFile } from '@/lib/csv';
import { newId } from '@/lib/id';
import type { PdfDocumentInput } from './documentPdf';

/**
 * Thin wrappers that lazily load the PDF engine (jsPDF is large), so it only
 * downloads when the user first generates a document. The service worker
 * precaches the chunk, so PDF generation also works offline.
 *
 * Generated PDFs are created in memory and handed to the browser; they are never
 * written to the service-worker cache or uploaded anywhere.
 */

const engine = () => import('./documentPdf');

export function invoicePdfInput(inv: Invoice, project?: Project | null, quotation?: Quotation | null): PdfDocumentInput {
  return {
    kind: 'invoice',
    number: inv.number,
    issueDate: inv.issueDate,
    endDate: inv.dueDate,
    client: inv.clientSnapshot,
    projectName: project?.name ?? null,
    reference: quotation?.number ?? null,
    items: inv.items,
    discount: inv.discount,
    vatEnabled: inv.vatEnabled,
    vatRate: inv.vatRate,
    currency: inv.currency,
    amountPaid: inv.amountPaid,
    paymentInstructions: inv.paymentInstructions,
    notes: inv.notes,
    terms: inv.terms,
    watermark: inv.storedStatus === 'draft' ? 'DRAFT' : inv.storedStatus === 'cancelled' ? 'CANCELLED' : null,
  };
}

export function quotationPdfInput(q: Quotation, project?: Project | null): PdfDocumentInput {
  return {
    kind: 'quotation',
    number: q.number,
    issueDate: q.issueDate,
    endDate: q.expiryDate,
    client: q.clientSnapshot,
    projectName: project?.name ?? null,
    items: q.items,
    discount: q.discount,
    vatEnabled: q.vatEnabled,
    vatRate: q.vatRate,
    currency: q.currency,
    notes: q.notes,
    terms: q.terms,
    watermark: q.storedStatus === 'draft' ? 'DRAFT' : null,
  };
}

/** Sample document used to preview branding in Settings. */
export function samplePdfInput(settings: BusinessSettings, kind: 'invoice' | 'quotation' = 'invoice'): PdfDocumentInput {
  const issue = todayISO();
  return {
    kind,
    number: kind === 'invoice' ? 'SAMPLE-INV-0001' : 'SAMPLE-QUO-0001',
    issueDate: issue,
    endDate: addDays(issue, kind === 'invoice' ? settings.defaultPaymentTermsDays : settings.quotationValidityDays),
    client: {
      name: 'Jordan Client',
      companyName: 'Sample Client (Pty) Ltd',
      email: 'accounts@example.com',
      phone: '+27 21 000 0000',
      billingAddress: { ...emptyAddress(), line1: '1 Example Street', city: 'Cape Town', province: 'Western Cape', postalCode: '8001' },
      registrationNumber: '',
      vatNumber: '',
    },
    projectName: 'Company Website',
    items: [
      {
        id: newId(), serviceId: null, title: 'Website Design & Development', quantity: 1, unitPrice: 1850000, vatCategory: 'standard',
        description: "Professional website design and development tailored to the client's business objectives. Includes website structure, responsive layouts, frontend implementation, content organisation and deployment preparation.",
      },
      {
        id: newId(), serviceId: null, title: 'Domain & Hosting Configuration', quantity: 1, unitPrice: 150000, vatCategory: 'standard',
        description: 'Configuration and deployment assistance involving domain connections, DNS settings, hosting environments, SSL certificates and production deployment.',
      },
      {
        id: newId(), serviceId: null, title: 'Digital Consultation & Technical Advisory', quantity: 2.5, unitPrice: 85000, vatCategory: 'standard',
        description: 'Technical consultation covering digital strategy, software requirements and solution recommendations.',
      },
    ],
    discount: { type: 'none', value: 0 },
    vatEnabled: settings.vatEnabled,
    vatRate: settings.vatRate,
    currency: settings.currency,
    amountPaid: 0,
    paymentInstructions: settings.paymentDetails || 'Your banking / payment details will appear here. Add them in Settings → Business.',
    notes: kind === 'invoice' ? settings.defaultInvoiceNotes : settings.defaultQuotationNotes,
    terms: kind === 'invoice' ? settings.defaultInvoiceTerms : settings.defaultQuotationTerms,
    watermark: 'SAMPLE',
  };
}

export async function generatePdfBlob(input: PdfDocumentInput, settings: BusinessSettings): Promise<Blob> {
  const { pdfBlob } = await engine();
  return pdfBlob(input, settings);
}

export async function downloadPdf(input: PdfDocumentInput, settings: BusinessSettings): Promise<void> {
  const { pdfBlob, pdfFileName } = await engine();
  downloadFile(await pdfBlob(input, settings), pdfFileName(input), 'application/pdf');
}

/**
 * Print via a hidden iframe. Some mobile browsers (notably iOS Safari) cannot
 * print an embedded PDF; there the PDF opens in a new tab where the system
 * share/print sheet is available.
 */
export async function printPdf(input: PdfDocumentInput, settings: BusinessSettings): Promise<void> {
  const blob = await generatePdfBlob(input, settings);
  const url = URL.createObjectURL(blob);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS) {
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }
  await new Promise<void>((resolve) => {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    frame.src = url;
    frame.onload = () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } catch {
        window.open(url, '_blank', 'noopener');
      }
      resolve();
      setTimeout(() => {
        frame.remove();
        URL.revokeObjectURL(url);
      }, 60_000);
    };
    document.body.appendChild(frame);
  });
}
