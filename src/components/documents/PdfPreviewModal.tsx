import { useEffect, useRef, useState } from 'react';
import { Download, ExternalLink, Loader2, Printer } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useSettings } from '@/hooks/useApp';
import type { PdfDocumentInput } from '@/pdf/documentPdf';
import type { BusinessSettings } from '@/domain/types';
import { downloadPdf, generatePdfBlob, printPdf } from '@/pdf/pdfActions';

/**
 * Shows the exact PDF that will be downloaded. The PDF is generated in memory as a
 * blob: URL that is revoked when the preview closes.
 */
export function PdfPreviewModal({
  open,
  onClose,
  input,
  title,
  draftSettings,
}: {
  open: boolean;
  onClose: () => void;
  input: PdfDocumentInput | null;
  title: string;
  /** Render with unsaved settings (branding preview). Defaults to the saved settings. */
  draftSettings?: BusinessSettings;
}) {
  const savedSettings = useSettings();
  const settings = draftSettings ?? savedSettings;
  const toast = useToast();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Regenerate only when the document content or branding actually changes (not on every re-render).
  const contentKey = input ? JSON.stringify(input) : '';
  const brandKey = [
    settings.updatedAt,
    settings.logoDataUrl?.length,
    settings.logoDataUrl?.slice(-48),
    settings.documentAccentColor,
    settings.businessName,
    settings.tagline,
    settings.email,
    settings.phone,
    settings.website,
    settings.registrationNumber,
    settings.vatRegistrationNumber,
    settings.vatLabel,
    settings.dateFormat,
    JSON.stringify(settings.address),
  ].join('|');
  const latest = useRef({ input, settings });
  latest.current = { input, settings };

  useEffect(() => {
    const { input, settings } = latest.current;
    if (!open || !input) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    setUrl(null);
    setError(null);
    generatePdfBlob(input, settings)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((err) => {
        console.error(err);
        setError('The PDF could not be generated.');
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, contentKey, brandKey]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={title}
      description="This is the exact client-facing document. Some phone browsers only preview the first page — download to see every page."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          {url && (
            <Button variant="secondary" icon={<ExternalLink className="h-4 w-4" />} onClick={() => window.open(url, '_blank', 'noopener')}>
              Open in new tab
            </Button>
          )}
          <Button
            variant="secondary"
            icon={<Printer className="h-4 w-4" />}
            disabled={!input}
            onClick={() => input && printPdf(input, settings).catch((e) => toast.error('Printing failed', e))}
          >
            Print
          </Button>
          <Button
            variant="primary"
            icon={<Download className="h-4 w-4" />}
            disabled={!input}
            onClick={() => input && downloadPdf(input, settings).catch((e) => toast.error('Download failed', e))}
          >
            Download PDF
          </Button>
        </>
      }
    >
      <div className="h-[65dvh] overflow-hidden rounded-xl border border-border bg-[#2a2f3a]">
        {error ? (
          <div className="flex h-full items-center justify-center text-sm text-danger">{error}</div>
        ) : url ? (
          <iframe title={title} src={url} className="h-full w-full" />
        ) : (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin text-blue" /> Generating document…
          </div>
        )}
      </div>
    </Modal>
  );
}
