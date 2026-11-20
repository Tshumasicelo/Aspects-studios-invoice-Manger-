import type { Discount, HistoryEntry, LineItem, Service } from '@/domain/types';
import { newId, nowISO } from '@/lib/id';

/** Shared editable fields for invoices and quotations. */
export interface DocumentFormValues {
  clientId: string;
  projectId: string | null;
  issueDate: string;
  /** Due date (invoice) or expiry date (quotation). */
  endDate: string;
  items: LineItem[];
  discount: Discount;
  vatEnabled: boolean;
  vatRate: number;
  currency: string;
  notes: string;
  terms: string;
  /** Invoice only. */
  paymentInstructions: string;
}

export function newLineItem(partial: Partial<LineItem> = {}): LineItem {
  return {
    id: newId(),
    serviceId: null,
    title: '',
    description: '',
    quantity: 1,
    unitPrice: 0,
    vatCategory: 'standard',
    ...partial,
  };
}

/**
 * Line item created from a catalogue service. The text and price are COPIED,
 * so editing the line never changes the catalogue entry (and vice versa).
 */
export function lineFromService(service: Service): LineItem {
  return newLineItem({
    serviceId: service.id,
    title: service.name,
    description: service.description,
    unitPrice: service.defaultPrice,
  });
}

export function cloneItems(items: LineItem[]): LineItem[] {
  return items.map((i) => ({ ...i, id: newId() }));
}

export function sanitiseItems(items: LineItem[]): LineItem[] {
  return items.map((i) => ({
    ...i,
    title: i.title.trim(),
    description: i.description.trim(),
    quantity: Number.isFinite(i.quantity) ? Math.round(i.quantity * 1000) / 1000 : 0,
    unitPrice: Math.round(i.unitPrice),
  }));
}

export function historyEntry(action: string, note?: string): HistoryEntry {
  return note ? { at: nowISO(), action, note } : { at: nowISO(), action };
}
