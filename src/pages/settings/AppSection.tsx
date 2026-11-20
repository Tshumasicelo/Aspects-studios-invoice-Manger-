import { CheckCircle2, Download, Lock, Share, Smartphone, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { isIOS, useInstallPrompt, useOnlineStatus } from '@/hooks/usePwa';

export function AppSection() {
  const { canInstall, installed, install } = useInstallPrompt();
  const online = useOnlineStatus();
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader icon={<Smartphone className="h-4 w-4" />} title="Install the app" />
        <CardBody className="space-y-3 text-sm text-muted">
          {installed ? (
            <p className="flex items-center gap-2 text-success">
              <CheckCircle2 className="h-4 w-4" /> Running as an installed app.
            </p>
          ) : canInstall ? (
            <Button variant="primary" icon={<Download className="h-4 w-4" />} onClick={() => void install()}>
              Install on this device
            </Button>
          ) : isIOS() ? (
            <p className="flex items-start gap-2">
              <Share className="mt-0.5 h-4 w-4 shrink-0 text-blue" />
              In Safari, tap the Share button, then “Add to Home Screen”.
            </p>
          ) : (
            <p>
              Use your browser’s menu (“Install app” / “Add to Home screen”) to install. Supported in Chrome, Edge and Android browsers. If the option is
              missing, the app may already be installed.
            </p>
          )}
          <p className="flex items-center gap-2 text-xs">
            <WifiOff className="h-3.5 w-3.5" /> Works offline once loaded. Current status: <span className={online ? 'text-success' : 'text-warning'}>{online ? 'online' : 'offline'}</span>
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader icon={<Lock className="h-4 w-4" />} title="Privacy & local storage" />
        <CardBody className="space-y-3 text-sm leading-relaxed text-muted">
          <p>
            All records are stored <span className="text-text">only in this browser on this device</span> (IndexedDB). Nothing is uploaded, synced or shared with any
            service. PDFs and CSV files are generated on the device.
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Data does not sync between devices or browsers. Use backups to move data.</li>
            <li>Clearing browser data / site data for this app deletes your records. Private/incognito windows do not keep data.</li>
            <li>Anyone with access to this device and browser profile can open the app and see the data. Protect the device with a screen lock and a strong password.</li>
            <li>Local storage is not encrypted by the app. It is not a substitute for proper device security or off-device backups.</li>
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="About" />
        <CardBody className="space-y-1 text-sm text-muted">
          <p>
            <span className="text-text">ASPECTS STUDIOS — Invoice Manager</span> · version {__APP_VERSION__}
          </p>
          <p className="text-xs text-faint">Local-first PWA · React · IndexedDB (Dexie) · jsPDF</p>
        </CardBody>
      </Card>
    </div>
  );
}
