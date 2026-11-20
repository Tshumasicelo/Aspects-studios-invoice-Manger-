/**
 * End-to-end smoke test of a PRODUCTION build (see README → Testing).
 *
 *   npm run build
 *   mkdir -p /tmp/site/aspects && cp -r dist/. /tmp/site/aspects/
 *   python3 -m http.server 4173 --directory /tmp/site      # serves the app under a subdirectory
 *   E2E_BASE=http://localhost:4173/aspects/ node e2e/smoke.cjs
 *
 * Requires the `playwright` package and a Chromium build. Uses a fresh browser profile.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const BASE = process.env.E2E_BASE || 'http://localhost:4173/aspects/';
const SP = process.env.E2E_OUT || path.join(os.tmpdir(), 'aspects-e2e');
const SHOTS = path.join(SP, 'shots');
fs.mkdirSync(path.join(SP, 'pdf'), { recursive: true });
fs.mkdirSync(SHOTS, { recursive: true });
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
  const shot = (name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });
  const go = (hash) => page.goto(BASE + '#' + hash);

  // 1. First run
  await page.goto(BASE);
  await page.getByRole('heading', { name: /Invoice Manager/ }).waitFor();
  check('First-run welcome screen renders', true);
  await shot('01-welcome');

  // 2. Setup wizard
  await go('/setup');
  await page.getByLabel('Business email').fill('hello@aspects.studio');
  await page.getByLabel('Telephone').fill('+27 21 555 0101');
  await page.getByLabel('Website').fill('aspects.studio');
  await page.getByLabel('Street address').fill('12 Bree Street');
  await page.getByLabel('City').fill('Cape Town');
  await page.getByRole('button', { name: 'Save & continue' }).click();
  await page.getByRole('heading', { name: 'Logo & branding' }).waitFor();
  await page.getByRole('button', { name: /^(Continue|Save & continue)$/ }).click();
  await page.getByRole('heading', { name: 'Currency & region' }).waitFor();
  await page.getByRole('button', { name: /^(Continue|Save & continue)$/ }).click();
  await page.getByRole('heading', { name: 'VAT' }).waitFor();
  await page.getByRole('switch', { name: /VAT-registered/ }).click();
  await page.getByLabel('VAT registration number').fill('4123456789');
  await page.getByRole('button', { name: 'Save & continue' }).click();
  await page.getByRole('heading', { name: 'Payment details' }).waitFor();
  await page.getByLabel(/Payment \/ banking details/).fill('Bank: Example Bank\nAccount: 123456789\nBranch: 250655\nReference: Invoice number');
  await page.getByRole('button', { name: 'Save & continue' }).click();
  await page.getByRole('heading', { name: 'You’re ready' }).waitFor();
  check('Setup wizard saves every step', true);

  // 3. Client
  await go('/clients');
  await page.getByRole('button', { name: 'New client' }).first().click();
  await page.getByLabel('Contact name').fill('Thandi Mokoena');
  await page.getByLabel('Company name').fill('Mokoena Logistics (Pty) Ltd');
  await page.getByLabel('Email').fill('accounts@mokoena.co.za');
  await page.getByLabel('Street address').first().fill('45 Main Road');
  await page.getByLabel('City').first().fill('Johannesburg');
  await page.getByRole('button', { name: 'Create client' }).click();
  await page.waitForURL(/#\/clients\/[\w-]+$/);
  check('Client created and profile opened', true);

  // Duplicate detection
  await go('/clients?new=1');
  await page.getByLabel('Company name').fill('MOKOENA LOGISTICS (PTY) LTD');
  const dupVisible = await page.getByText('Possible duplicate').isVisible();
  check('Duplicate client warning shown', dupVisible);
  await page.getByRole('button', { name: 'Cancel' }).click();

  // 4. Invoice with catalogue + custom lines, discount, VAT
  await go('/invoices/new');
  await page.locator('#doc-client').selectOption({ label: 'Mokoena Logistics (Pty) Ltd' });
  await page.getByRole('button', { name: 'Add from catalogue' }).click();
  await page.getByRole('button', { name: /Website Design & Development/ }).first().click();
  await page.getByLabel('Unit price').nth(0).fill('18500');
  await page.getByRole('button', { name: 'Add custom item' }).click();
  await page.getByLabel('Item', { exact: true }).nth(1).fill('Hosting setup');
  await page.getByLabel('Unit price').nth(1).fill('1500');
  await page.getByLabel('Discount', { exact: true }).selectOption('percent');
  await page.getByLabel('Discount percentage').fill('10');
  await shot('02-invoice-editor');
  const editorTotal = await page.locator('aside').getByText('R 20,700.00').first().isVisible();
  check('Editor live total: (20,000 − 10%) + 15% VAT = R 20,700.00', editorTotal);
  await page.getByRole('button', { name: 'Save & mark sent' }).click();
  await page.waitForURL((u) => /#\/invoices\/[\w-]+$/.test(u.href) && !u.href.endsWith('/new'));
  await page.getByText(/AS-INV-\d{4}-0001/).first().waitFor();
  check('Invoice numbered AS-INV-YYYY-0001 and marked sent', await page.locator('h1').getByText('Sent', { exact: true }).waitFor({ timeout: 5000 }).then(() => true, () => false));
  await shot('03-invoice-detail');
  const invoiceUrl = page.url();

  // 5. Payments
  await page.getByRole('button', { name: 'Record payment' }).first().click();
  await page.getByLabel('Amount received').fill('5000');
  await page.getByRole('dialog').getByRole('button', { name: 'Record payment' }).click();
  await page.getByText('Partially Paid').first().waitFor({ timeout: 8000 }).catch(async (e) => {
    console.log('DIAG toasts:', await page.locator('[role=status],[role=alert]').allInnerTexts());
    await shot('diag-payment');
    throw e;
  });
  check('Partial payment → status Partially Paid', true);
  await page.getByRole('button', { name: 'Record payment' }).first().click();
  await page.getByLabel('Amount received').fill('99999');
  await page.getByRole('dialog').getByRole('button', { name: 'Record payment' }).click();
  check('Overpayment rejected', await page.getByRole('alert').filter({ hasText: 'exceeds' }).isVisible());
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

  // Finalised invoice is protected
  await page.goto(invoiceUrl + '/edit');
  check('Finalised invoice cannot be edited directly', await page.getByText('This invoice is finalised').waitFor({ timeout: 5000 }).then(() => true, () => false));
  await page.goto(invoiceUrl);

  // 6. PDF download
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'PDF' }).click()]);
  const pdfPath = path.join(SP, 'pdf', 'e2e-invoice.pdf');
  await dl.saveAs(pdfPath);
  const size = fs.statSync(pdfPath).size;
  check('PDF downloaded', size > 3000, `${dl.suggestedFilename()} (${size} bytes)`);
  try {
    execSync(`pdftoppm -r 70 -png -singlefile ${pdfPath} ${path.join(SHOTS, '04-invoice-pdf')}`);
  } catch {
    /* optional: poppler not installed */
  }

  // 7. Quotation → accept → convert
  await go('/quotations/new');
  await page.locator('#doc-client').selectOption({ label: 'Mokoena Logistics (Pty) Ltd' });
  await page.getByRole('button', { name: 'Add from catalogue' }).click();
  await page.getByRole('button', { name: /Progressive Web Application/ }).first().click();
  await page.getByLabel('Unit price').nth(0).fill('42000');
  await page.getByRole('button', { name: 'Save & mark sent' }).click();
  await page.waitForURL((u) => /#\/quotations\/[\w-]+$/.test(u.href) && !u.href.endsWith('/new'));
  await page.getByRole('button', { name: 'Accept' }).click();
  await page.getByRole('button', { name: 'Mark accepted' }).click();
  await page.getByText('Accepted', { exact: true }).first().waitFor();
  await page.getByRole('button', { name: 'Convert to invoice' }).click();
  await page.waitForURL((u) => /#\/invoices\/[\w-]+$/.test(u.href) && !u.href.endsWith('/new'));
  await page.getByText(/AS-INV-\d{4}-0002/).first().waitFor();
  check('Accepted quotation converted to invoice AS-INV-…-0002', await page.getByText(/AS-QUO-\d{4}-0001/).first().isVisible());
  page.goBack();
  await page.waitForURL((u) => /#\/quotations\/[\w-]+$/.test(u.href) && !u.href.endsWith('/new'));
  await page.getByRole('button', { name: 'Open invoice' }).click();
  await page.waitForURL((u) => /#\/invoices\/[\w-]+$/.test(u.href) && !u.href.endsWith('/new'));
  const invCount = await page.evaluate(async () => {
    const req = indexedDB.open('aspects-studios-invoice-manager');
    const db = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    return await new Promise((r) => {
      const c = db.transaction('invoices').objectStore('invoices').count();
      c.onsuccess = () => r(c.result);
    });
  });
  check('Second conversion does not create a duplicate invoice', invCount === 2, `invoices in DB: ${invCount}`);

  // 8. Expense
  await go('/expenses?new=1');
  await page.getByLabel('Description').fill('Figma subscription');
  await page.getByLabel('Amount').fill('450');
  await page.getByRole('dialog').getByRole('button', { name: 'Add expense' }).click();
  await page.getByText('Figma subscription').first().waitFor({ timeout: 6000 }).catch(async (e) => {
    console.log('DIAG:', await page.locator('[role=alert],[role=status]').allInnerTexts());
    await shot('diag-expense');
    throw e;
  });
  check('Expense recorded', true);

  // 9. Dashboard & reports reflect real data
  await go('/');
  await page.getByText('Revenue received').first().waitFor();
  const dash = await page.locator('main').innerText();
  check('Dashboard revenue = payments received (R 5,000.00)', dash.includes('R 5,000.00'));
  check('Dashboard net profit = 5,000 − 450 = R 4,550.00', dash.includes('R 4,550.00'));
  await page.waitForTimeout(600);
  await shot('05-dashboard');
  await page.screenshot({ path: path.join(SHOTS, '05-dashboard-full.png'), fullPage: true });
  await go('/reports');
  await page.getByText('Revenue by client').waitFor();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOTS, '06-reports-full.png'), fullPage: true });
  check('Reports render', true);
  await go('/services');
  await page.getByText('Website Performance Optimisation').waitFor();
  await shot('07-services');

  // 10. Persistence across reload
  await page.reload();
  await go('/invoices');
  await page.getByText(/AS-INV-\d{4}-0001/).first().waitFor();
  check('Data persists after browser refresh', true);
  await shot('08-invoices');

  // 11. Backup → clear → restore
  await go('/settings?tab=data');
  const [bk] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download backup' }).click()]);
  const backupPath = path.join(SP, 'backup.json');
  await bk.saveAs(backupPath);
  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  check('JSON backup contains all collections', backup.data.invoices.length === 2 && backup.data.payments.length === 1 && backup.data.services.length === 15, `${backup.data.invoices.length} invoices, ${backup.data.payments.length} payment(s)`);
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Invoices', exact: true }).click()]);
  const csvPath = path.join(SP, 'invoices.csv');
  await csv.saveAs(csvPath);
  check('CSV export', fs.readFileSync(csvPath, 'utf8').includes('Invoice number'));

  await page.getByRole('button', { name: 'Clear all data…' }).click();
  await page.getByRole('dialog').getByRole('textbox').fill('DELETE');
  await page.getByRole('button', { name: 'Delete all data' }).click();
  await page.getByText('All data cleared').waitFor();
  await go('/invoices');
  const cleared = await page.getByText('No invoices yet').waitFor({ timeout: 6000 }).then(() => true, async () => {
    await shot('diag-clear');
    return false;
  });
  check('Clear all data empties the database', cleared);
  await go('/settings?tab=data');
  await page.locator('input[type=file]').setInputFiles(backupPath);
  await page.getByRole('heading', { name: 'Restore backup' }).waitFor();
  await shot('09-restore-preview');
  await page.getByRole('button', { name: /Replace everything/ }).click();
  await page.getByRole('button', { name: 'Replace all data' }).click();
  await page.getByRole('dialog').getByRole('textbox').fill('REPLACE');
  await page.getByRole('button', { name: 'Replace everything' }).last().click();
  await page.getByText('Backup restored').waitFor();
  await go('/invoices');
  await page.getByText(/AS-INV-\d{4}-0002/).first().waitFor();
  check('Backup restored (invoices back)', true);

  // Malformed import rejected
  fs.writeFileSync(path.join(SP, 'bad.json'), '{"app":"something-else"}');
  await go('/settings?tab=data');
  await page.locator('input[type=file]').setInputFiles(path.join(SP, 'bad.json'));
  check('Malformed backup rejected', await page.getByText('Backup cannot be restored').isVisible());
  await page.getByRole('button', { name: 'Close' }).last().click();

  // 12. PWA: manifest + service worker + offline
  const manifest = await page.evaluate(async () => (await fetch(document.querySelector('link[rel=manifest]').href)).json());
  check('Web manifest served', manifest.name.includes('Aspects') && manifest.icons.length === 3);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.evaluate(() => navigator.serviceWorker.ready);
  const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
  check('Service worker controls the page', controlled);
  await context.setOffline(true);
  await page.reload();
  await go('/clients');
  await page.getByText('Mokoena Logistics (Pty) Ltd').first().waitFor({ timeout: 10000 });
  check('App loads and shows data while OFFLINE', true);
  check('Offline indicator visible', await page.getByText('Offline', { exact: true }).isVisible());
  await go('/invoices');
  await page.getByText(/AS-INV-\d{4}-0001/).first().click();
  const [offPdf] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'PDF' }).click()]);
  check('PDF generation works offline', !!(await offPdf.path()));
  await context.setOffline(false);

  // 13. Mobile
  const mobile = await browser.newContext({ ...require('playwright').devices['iPhone 13'] });
  const m = await mobile.newPage();
  m.on('pageerror', (e) => errors.push('mobile pageerror: ' + e.message));
  await m.goto(BASE);
  await m.getByRole('heading', { name: /Invoice Manager/ }).waitFor();
  await m.screenshot({ path: path.join(SHOTS, '10-mobile-welcome.png') });
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check('No horizontal scroll on phone', !overflow);
  await m.goto(BASE + '#/invoices/new');
  await m.getByRole('button', { name: 'Add from catalogue' }).waitFor();
  await m.screenshot({ path: path.join(SHOTS, '11-mobile-editor.png') });
  const overflow2 = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check('Invoice editor fits phone width', !overflow2);
  await m.getByRole('button', { name: 'More' }).click();
  await m.screenshot({ path: path.join(SHOTS, '12-mobile-more.png') });
  await mobile.close();

  // Tablet
  const tablet = await browser.newContext({ viewport: { width: 820, height: 1180 } });
  const t = await tablet.newPage();
  await t.goto(BASE + '#/services');
  await t.getByText('UI/UX Design').waitFor();
  check('Tablet layout has no horizontal scroll', !(await t.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)));
  await t.screenshot({ path: path.join(SHOTS, '13-tablet-services.png') });
  await tablet.close();

  const relevant = errors.filter((e) => !/net::ERR_INTERNET_DISCONNECTED|Failed to fetch|ERR_INTERNET/.test(e));
  check('No JavaScript errors in console', relevant.length === 0, relevant.slice(0, 5).join(' | '));
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error('E2E CRASH:', e.message.split('\n')[0]);
  process.exit(2);
});
