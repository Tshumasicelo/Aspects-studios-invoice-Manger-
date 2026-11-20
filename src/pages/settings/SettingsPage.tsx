import { useEffect } from 'react';
import { useBlocker, useSearchParams } from 'react-router-dom';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { PageHeader, Tabs } from '@/components/ui/Layout';
import { useConfirm } from '@/components/ui/Confirm';
import { AppSection } from './AppSection';
import { DataSection } from './DataSection';
import {
  BrandingSection,
  BusinessSection,
  DocumentDefaultsSection,
  NumberingSection,
  RegionalSection,
  VatSection,
} from './SettingsSections';
import { useSettingsDraft } from './useSettingsDraft';

type Tab = 'business' | 'branding' | 'financial' | 'numbering' | 'data' | 'app';
const TABS: { value: Tab; label: string }[] = [
  { value: 'business', label: 'Business' },
  { value: 'branding', label: 'Branding' },
  { value: 'financial', label: 'Financial' },
  { value: 'numbering', label: 'Numbering' },
  { value: 'data', label: 'Data & backup' },
  { value: 'app', label: 'App & privacy' },
];

export default function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.value === params.get('tab'))?.value ?? 'business') as Tab;
  const s = useSettingsDraft();
  const confirm = useConfirm();

  const blocker = useBlocker(({ currentLocation, nextLocation }) => s.dirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    void confirm({ title: 'Discard unsaved settings?', message: 'You have changes that have not been saved.', confirmLabel: 'Discard', cancelLabel: 'Keep editing' }).then(({ confirmed }) =>
      confirmed ? blocker.proceed() : blocker.reset(),
    );
  }, [blocker, confirm]);

  const editable = tab !== 'data' && tab !== 'app';

  return (
    <>
      <PageHeader kicker="Configuration" title="Settings" subtitle="Business details, branding, tax, numbering and your data." />
      <Tabs<Tab> value={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} tabs={TABS} className="mb-6" />

      {tab === 'business' && (
        <Card>
          <CardHeader title="Business details" subtitle="Shown on every invoice and quotation." />
          <CardBody>
            <BusinessSection s={s} />
          </CardBody>
        </Card>
      )}
      {tab === 'branding' && (
        <Card>
          <CardHeader title="Document branding" subtitle="The app uses the Cyber Luxury theme; client documents use a clean white design with your brand." />
          <CardBody>
            <BrandingSection s={s} />
          </CardBody>
        </Card>
      )}
      {tab === 'financial' && (
        <div className="space-y-6">
          <Card>
            <CardHeader title="Currency & region" />
            <CardBody>
              <RegionalSection s={s} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="VAT" subtitle="Disabled by default until you confirm your VAT registration." />
            <CardBody>
              <VatSection s={s} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Document defaults" />
            <CardBody>
              <DocumentDefaultsSection s={s} />
            </CardBody>
          </Card>
        </div>
      )}
      {tab === 'numbering' && (
        <Card>
          <CardHeader title="Document numbering" subtitle="Automatic, sequential and unique." />
          <CardBody>
            <NumberingSection s={s} />
          </CardBody>
        </Card>
      )}
      {tab === 'data' && <DataSection />}
      {tab === 'app' && <AppSection />}

      {editable && s.dirty && (
        <div className="sticky bottom-[4.75rem] z-20 mt-6 animate-pop-in rounded-2xl border border-blue/30 bg-[#0e1626]/95 shadow-2xl backdrop-blur-xl lg:bottom-6">
          <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm text-muted">You have unsaved changes</span>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={s.reset}>
                Discard
              </Button>
              <Button variant="primary" icon={<Save className="h-4 w-4" />} loading={s.saving} onClick={() => void s.save()}>
                Save changes
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
