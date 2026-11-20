# ASPECTS STUDIOS — Invoice Manager

A local-first **Progressive Web App** for running the business side of ASPECTS STUDIOS: clients, a service catalogue, projects, quotations, invoices, payments, expenses and reports. It works offline, installs on desktop and Android (and iOS via *Add to Home Screen*), and generates professional A4 PDF invoices and quotations.

- **Design identity:** *Cyber Luxury* (dark, glass, metallic silver, restrained electric blue) for the app. Client documents use a separate clean white corporate design.
- **Storage:** IndexedDB (via Dexie) on the device. No server, no account and no paid services. Nothing is sent anywhere.
- **Region:** South Africa by default: ZAR shown as `R 1,250.00`. VAT is **off** until you enable it.

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

| Script | What it does |
|---|---|
| `npm run dev` | Development server with hot reload (service worker disabled in dev) |
| `npm test` | Unit and service tests (Vitest + fake IndexedDB) |
| `npm run typecheck` | Strict TypeScript check |
| `npm run build` | Type-check + production build into `dist/` (including the service worker) |
| `npm run preview` | Serve the production build locally |

Requires Node 20+ (CI uses Node 22).

---

## Features

| Area | Highlights |
|---|---|
| **Dashboard** | Revenue received, revenue this month, outstanding, overdue, expenses, net profit; revenue vs expenses, profit trend, invoice status and project distribution charts; recent activity; date-range filter; first-run welcome and setup checklist |
| **Invoices** | Automatic numbering (`AS-INV-2026-0001`), catalogue and custom line items, decimal quantities, % or fixed discount, VAT with zero-rated/exempt lines, live totals, preview, PDF, print, duplicate, mark as sent, partial payments, cancel, history. Statuses: Draft · Sent · Partially Paid · Paid · Overdue · Cancelled |
| **Quotations** | Same editor, expiry dates, Draft · Sent · Accepted · Rejected · Expired, signature block on the PDF, **one-click conversion to invoice** (idempotent, never duplicates) |
| **Projects** | Budget, dates, status pipeline, linked quotation and invoices, budget-used bar, services delivered, history |
| **Clients** | Full profile, billing vs physical address, duplicate detection, lifetime billing, payments, outstanding and overdue balances, all linked documents |
| **Services** | The 15 standard ASPECTS STUDIOS services with professional descriptions, pricing models (fixed / hourly / daily / custom), archive, restore defaults |
| **Payments** | Record EFT/transfer/cash/card payments against invoices; partial payments; overpayment blocked; edit and remove with automatic recalculation |
| **Expenses** | Categories, supplier, reference, search, date and category filters, CSV export |
| **Reports** | Revenue by month, client and service; expenses by category; outstanding and overdue invoices; payments; project performance; CSV export for every report; data-table view of charts |
| **Settings** | Business details, logo upload, document accent colour, branding preview, currency, date format, VAT, payment terms, default notes/terms, numbering patterns and next sequence, backup/restore, CSV exports, integrity check, clear data, install and privacy info |
| **PWA** | Installable, offline app shell, offline indicator, update notification (never auto-reloads), storage-persistence request |

---

## Architecture

```
src/
├── domain/        Pure business logic: no React, no storage (fully unit-tested)
│   ├── types.ts         Entity types (money = integer cents, dates = ISO strings)
│   ├── money.ts         Rounding, parsing, "R 1,250.00" formatting
│   ├── calculations.ts  Subtotal, discount, VAT, totals, payment allocation
│   ├── status.ts        Derived invoice/quotation statuses (incl. overdue/expired)
│   ├── numbering.ts     Document number patterns and collision-free allocation
│   ├── validation.ts    Field validation rules
│   └── defaults.ts      Default settings, labels, seed service catalogue
├── data/          Data-access layer
│   ├── types.ts         Storage-agnostic interfaces (Repository, DataStore)
│   ├── dexie/           IndexedDB implementation (schema + repositories)
│   └── store.ts         The active DataStore (swap-in point for a cloud backend)
├── services/      Transactional business workflows (create/issue invoice, record
│                  payment, convert quotation, backup/restore, analytics, CSV)
├── pdf/           Client-facing PDF engine (jsPDF + autotable, lazy-loaded)
├── hooks/         React glue: live queries, settings/formatting context, PWA hooks
├── components/    Design system (ui/), layout, forms, document editor, charts
└── pages/         One folder/page per section
```

### Cloud-ready data layer

UI and services only talk to the interfaces in `src/data/types.ts`:

- `Repository<T>`: `list`, `get`, `findBy`, `put`, `bulkPut`, `delete`, `count`, `clear`
- `DataStore`: all repositories, plus `transaction(fn)` (atomic) and `watch(query, onNext)` (live updates)

To move to a cloud or sync backend later, implement `DataStore` (for example over a REST API, Firestore, Supabase or a sync engine) and call `setDataStore(...)` at start-up. No component or service needs to change. All IDs are UUIDs and every record has `createdAt`/`updatedAt`, which is what a sync layer needs.

---

## Financial rules

All arithmetic happens in **integer cents** in one module (`domain/calculations.ts`), which the editor, PDFs, dashboard and reports all share, so the figures always agree.

```
Line total     = quantity × unit price            (rounded to the cent, per line)
Subtotal       = Σ line totals
Discount       = % of subtotal, or a fixed amount (never more than the subtotal)
Taxable amount = Subtotal − Discount
VAT            = VAT rate × (standard-rated lines − their pro-rata share of the discount)
Total          = Taxable amount + VAT
Outstanding    = Total − payments received        (never negative)
```

- Rounding is *half away from zero* and corrects floating-point artefacts (`1.005 → 1.01`).
- **VAT is disabled by default.** When enabled, each line can be *standard*, *zero-rated* or *exempt*. A document-level discount is shared across lines pro rata, so zero-rated and exempt lines never attract VAT. VAT-enabled invoices are titled **"TAX INVOICE"**, as South African VAT vendors require.
- **Revenue = payments actually received** (by payment date). *Invoiced* amounts are reported separately. **Net profit = revenue received − expenses.** *Revenue by service* allocates each payment across the invoice's lines in proportion to their value, and the parts always add up exactly to the payment.
- **Statuses are derived, never stored by hand.** An issued invoice is *Overdue* when its due date has passed and a balance remains (Cancelled overrides this). It is *Paid* when the balance is zero, and *Partially Paid* when some payment has been received. A sent quotation past its expiry date is *Expired*. "Today" is re-evaluated every minute, so statuses change at midnight without a reload.

## Data integrity safeguards

- **Unique numbers:** a database-level unique index on invoice/quotation numbers and payment references, plus collision-skipping allocation inside the same transaction as the write. Numbers are never reused, even when a draft is deleted.
- **Atomic workflows:** recording a payment (validate → store → recalculate the invoice → append history), converting a quotation, restoring a backup and clearing data each run in a single IndexedDB transaction. They either fully succeed or change nothing.
- **Recalculated, not incremented:** an invoice's paid amount is always recomputed from its payment records.
- **Finalised invoices are locked.** Corrections use **Unlock for correction**: allowed only when no payments exist, it requires a reason, keeps the invoice number and records the reason in the invoice history.
- **Client snapshots:** each document stores a frozen copy of the client's billing details, so later edits to a client don't rewrite historical invoices. VAT settings are also captured per document.
- **Referential protection:** clients with documents cannot be deleted (mark them *Inactive* instead). Deleting a project unlinks, but keeps, its documents.
- **Validated imports:** backups are checked for structure, types, cents, dates, duplicate IDs and numbers, and app/schema version. You see a preview (added/updated/skipped per collection) before anything is written.
- **Integrity check** (Settings → Data): recomputes every cached total and paid amount.
- **Safe CSV:** values that start with `= + - @` are neutralised to prevent spreadsheet formula injection.

---

## Engineering decisions (where the spec was open)

| Decision | Why |
|---|---|
| **Hash routing** (`#/invoices/…`) and relative `base: './'` | Works at a domain root *and* in any subdirectory (GitHub Pages) with no server rewrites, and offline. |
| **Numbers are allocated when a draft is created** | Matches "automatically generated invoice number". Deleted drafts leave a gap, which is the audit-friendly behaviour. The next sequence can be set in Settings (for example, to continue from a previous system). |
| **Per-year counters** (`invoice:2026`) when "restart each year" is on | Yearly resets can never collide with earlier years. |
| **Payments only on sent invoices; no overpayments** | The spec forbids overpayment without an authorised adjustment process, so none is provided. |
| **Cancel is blocked while payments exist** | Prevents cancelled invoices that still hold money. Remove the payments first, which is recorded in history. |
| **Editing a sent quotation returns it to draft** | A revised quotation should be re-sent. Accepted or rejected quotations are read-only (duplicate to revise). |
| **Accepting a quotation moves a linked project from Planning/Quoted to Approved** | Keeps the project pipeline in step with sales. |
| **Converted invoices start as drafts** | Lets you review dates and terms before issuing. Conversion is idempotent. |
| **Service catalogue prices start at R 0** | No financial figures are hard-coded. A banner prompts you to set your rates. |
| **"Mark as sent" instead of emailing from the app** | Sending email would transmit business data to an external service. You download the PDF and send it from your own email. |
| **Logo stored as a resized PNG data URL in settings** | It's included in backups automatically, works offline and embeds reliably in PDFs. Re-encoding also strips metadata and any script content from SVGs. |
| **Integer-cents arithmetic instead of a decimal library** | Exact for currency, with zero dependencies. |
| **Strict Content-Security-Policy in production** (`connect-src 'self'`) | The app technically cannot send data to any other server. |

---

## PWA and offline

- `vite-plugin-pwa` (Workbox) precaches the app shell and every route chunk, including the PDF engine, so **all screens, data and PDF generation work offline** once the app has loaded.
- **Updates:** a banner asks before reloading ("Update now" or "Later"), so an update can never discard a half-filled form. Your records live in IndexedDB, which updates never touch. The database schema is versioned (Dexie `version(n)`) for safe future migrations.
- Business records and generated PDFs are **never** written to the service-worker cache.
- **Install:** Chrome/Edge/Android show an *Install app* button (sidebar, *More* menu, Settings → App). On iOS use Safari → Share → *Add to Home Screen*.

---

## Privacy and local storage limitations (please read)

- Data is stored **only in this browser on this device**. It does **not** sync between devices or browsers. Use **Settings → Data & backup** to download a JSON backup and restore it elsewhere.
- **Clearing site data / browser data deletes your records.** Private/incognito windows do not keep data. The app asks the browser to protect its storage from automatic clean-up ("persistent storage"). Installing the app usually grants this, but it is not guaranteed.
- **Local storage is not a security boundary.** Anyone with access to the device and browser profile can open the app and read the data. The app does not encrypt data at rest. Protect the device with a screen lock and strong password, and keep off-device backups.
- No analytics, tracking, fonts or other third-party requests are made. Everything is self-hosted.

---

## Deployment

The build output (`dist/`) is fully static. Because routing is hash-based and the base path is relative, **the same build works at a root domain or in any subdirectory**.

### GitHub Pages (automated)

1. Push this repository to GitHub.
2. In the repository's **Settings → Pages → Build and deployment**, set **Source: GitHub Actions**.
3. Pushing to `main` runs `.github/workflows/deploy.yml`, which installs dependencies, runs the tests, builds and deploys. The app is served at `https://<user>.github.io/<repo>/`.

`public/.nojekyll` is included so GitHub Pages serves every file as-is.

### Netlify / Cloudflare Pages

Build command `npm run build`, publish directory `dist`. `public/_headers` sets `no-cache` on `sw.js`/`index.html` (so updates are picked up promptly), long-term caching for hashed assets, and security headers.

### Vercel

Framework preset "Vite", output `dist`. `vercel.json` applies the same headers.

### Custom base path (optional)

The relative default works everywhere. If your host specifically requires an absolute base, set it at build time:

```bash
BASE_PATH=/my-app/ npm run build
```

There are no runtime environment variables and no secrets.

---

## Testing

- **Unit and service tests:** `npm test`. They cover money rounding and formatting, discounts, VAT with zero-rated/exempt lines, payment allocation, status derivation (including overdue), numbering and collisions, validation, CSV escaping, the full invoice lifecycle, partial and full payments, overpayment rejection, controlled correction, quotation conversion (idempotency), analytics, backup round-trip/merge/malformed input, and PDF generation (single and multi-page).
- **End-to-end smoke test** of the production build in a real browser (Playwright). It covers setup, clients, invoices, payments, PDFs, quotation conversion, expenses, dashboard figures, reload persistence, backup → clear → restore, offline mode, and phone/tablet layouts:

  ```bash
  npm run build
  mkdir -p /tmp/site/aspects && cp -r dist/. /tmp/site/aspects/
  python3 -m http.server 4173 --directory /tmp/site &
  E2E_BASE=http://localhost:4173/aspects/ node e2e/smoke.cjs
  ```

  It requires the `playwright` package and Chromium (`npx playwright install chromium`).

## Known limitations

- Some phone browsers (notably iOS Safari) show only the first page in the in-app PDF preview, and can't print an embedded PDF. The app opens the PDF in a new tab there, and *Download PDF* always contains every page.
- PDFs use the standard PDF fonts. Currency symbols outside Latin-1 (for example ₦) are printed as the ISO code (`NGN 1,250.00`).
- Single business, single user, single device by design for this version. Multi-user, cloud sync, client portals and online payments are intentionally not implemented yet, but the data layer is prepared for them.
