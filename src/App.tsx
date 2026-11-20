import { lazy, type ReactNode } from 'react';
import { createHashRouter, RouterProvider, useRouteError, isRouteErrorResponse, Link } from 'react-router-dom';
import { AlertTriangle, Compass, Loader2 } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { ToastProvider } from '@/components/ui/Toast';
import { ConfirmProvider } from '@/components/ui/Confirm';
import { AppProvider } from '@/hooks/useApp';
import { LogoMark } from '@/components/brand/Logo';
import { Button } from '@/components/ui/Button';

// Route-level code splitting keeps the first load fast; the service worker
// precaches every chunk so all pages still work offline.
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const InvoicesPage = lazy(() => import('@/pages/invoices/InvoicesPage'));
const InvoiceEditorPage = lazy(() => import('@/pages/invoices/InvoiceEditorPage'));
const InvoiceDetailPage = lazy(() => import('@/pages/invoices/InvoiceDetailPage'));
const QuotationsPage = lazy(() => import('@/pages/quotations/QuotationsPage'));
const QuotationEditorPage = lazy(() => import('@/pages/quotations/QuotationEditorPage'));
const QuotationDetailPage = lazy(() => import('@/pages/quotations/QuotationDetailPage'));
const ProjectsPage = lazy(() => import('@/pages/projects/ProjectsPage'));
const ProjectDetailPage = lazy(() => import('@/pages/projects/ProjectDetailPage'));
const ClientsPage = lazy(() => import('@/pages/clients/ClientsPage'));
const ClientDetailPage = lazy(() => import('@/pages/clients/ClientDetailPage'));
const ServicesPage = lazy(() => import('@/pages/services/ServicesPage'));
const PaymentsPage = lazy(() => import('@/pages/payments/PaymentsPage'));
const ExpensesPage = lazy(() => import('@/pages/expenses/ExpensesPage'));
const ReportsPage = lazy(() => import('@/pages/ReportsPage'));
const SettingsPage = lazy(() => import('@/pages/settings/SettingsPage'));
const SetupPage = lazy(() => import('@/pages/SetupPage'));

function RouteError() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  console.error(error);
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center px-6 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-card text-accent">
        {notFound ? <Compass className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6 text-warning" />}
      </div>
      <h1 className="font-display text-xl font-semibold">{notFound ? 'Page not found' : 'Something went wrong'}</h1>
      <p className="mt-2 max-w-sm text-sm text-muted">
        {notFound
          ? 'The page you were looking for does not exist.'
          : 'This screen hit an unexpected error. Your saved records are safe — they are stored separately on this device.'}
      </p>
      <div className="mt-6 flex gap-2">
        <Link to="/" className="inline-flex h-10 items-center rounded-lg bg-blue px-4 text-sm font-medium text-white">
          Go to dashboard
        </Link>
        {!notFound && (
          <Button variant="secondary" onClick={() => window.location.reload()}>
            Reload
          </Button>
        )}
      </div>
    </div>
  );
}

const router = createHashRouter([
  {
    element: <AppShell />,
    errorElement: (
      <div className="min-h-dvh bg-bg">
        <RouteError />
      </div>
    ),
    children: [
      {
        errorElement: <RouteError />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'invoices', element: <InvoicesPage /> },
          { path: 'invoices/new', element: <InvoiceEditorPage /> },
          { path: 'invoices/:id', element: <InvoiceDetailPage /> },
          { path: 'invoices/:id/edit', element: <InvoiceEditorPage /> },
          { path: 'quotations', element: <QuotationsPage /> },
          { path: 'quotations/new', element: <QuotationEditorPage /> },
          { path: 'quotations/:id', element: <QuotationDetailPage /> },
          { path: 'quotations/:id/edit', element: <QuotationEditorPage /> },
          { path: 'projects', element: <ProjectsPage /> },
          { path: 'projects/:id', element: <ProjectDetailPage /> },
          { path: 'clients', element: <ClientsPage /> },
          { path: 'clients/:id', element: <ClientDetailPage /> },
          { path: 'services', element: <ServicesPage /> },
          { path: 'payments', element: <PaymentsPage /> },
          { path: 'expenses', element: <ExpensesPage /> },
          { path: 'reports', element: <ReportsPage /> },
          { path: 'settings', element: <SettingsPage /> },
          { path: 'setup', element: <SetupPage /> },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
]);

function NotFound(): ReactNode {
  throw new Response('Not found', { status: 404 });
}

function BootScreen({ error }: { error?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
      <LogoMark className="h-14 w-14" />
      {error ? (
        <>
          <h1 className="font-display text-lg font-semibold">The app could not start</h1>
          <p className="max-w-md text-sm text-muted">{error}</p>
          <Button variant="secondary" onClick={() => window.location.reload()}>
            Try again
          </Button>
        </>
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin text-blue" /> Opening your workspace…
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <AppProvider fallback={({ error }) => <BootScreen error={error} />}>
          <RouterProvider router={router} future={{ v7_startTransition: true }} />
        </AppProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}
