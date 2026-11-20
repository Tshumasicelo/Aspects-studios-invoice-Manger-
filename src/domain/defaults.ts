import type {
  Address,
  BusinessSettings,
  ClientStatus,
  PaymentMethod,
  PricingModel,
  ProjectStatus,
  Service,
  VatCategory,
} from './types';

export const emptyAddress = (): Address => ({
  line1: '',
  line2: '',
  city: '',
  province: '',
  postalCode: '',
  country: 'South Africa',
});

/**
 * Default business settings for a fresh installation.
 * VAT is DISABLED by default: the owner must confirm their VAT registration
 * and rate before VAT is applied to any document.
 * No banking or personal details are pre-filled.
 */
export function defaultSettings(): BusinessSettings {
  return {
    id: 'business',
    businessName: 'ASPECTS STUDIOS',
    tagline: 'Creative Technology Studio',
    logoDataUrl: null,
    email: '',
    phone: '',
    website: '',
    address: emptyAddress(),
    registrationNumber: '',
    vatRegistrationNumber: '',
    paymentDetails: '',
    currency: 'ZAR',
    locale: 'en-ZA',
    dateFormat: 'DD MMM YYYY',
    vatEnabled: false,
    vatRate: 15,
    vatLabel: 'VAT',
    defaultPaymentTermsDays: 14,
    quotationValidityDays: 30,
    defaultInvoiceNotes: 'Thank you for choosing ASPECTS STUDIOS.',
    defaultInvoiceTerms:
      'Payment is due by the date shown on this invoice. Please use the invoice number as your payment reference.',
    defaultQuotationNotes: 'We look forward to working with you.',
    defaultQuotationTerms:
      'This quotation is valid until the expiry date shown. Work commences once the quotation has been accepted in writing.',
    invoiceNumbering: { pattern: '{PREFIX}-{YYYY}-{SEQ}', prefix: 'AS-INV', padding: 4, resetYearly: true },
    quotationNumbering: { pattern: '{PREFIX}-{YYYY}-{SEQ}', prefix: 'AS-QUO', padding: 4, resetYearly: true },
    paymentNumbering: { pattern: '{PREFIX}-{YYYY}-{SEQ}', prefix: 'AS-PAY', padding: 4, resetYearly: true },
    documentAccentColor: '#3985FF',
    onboarding: { welcomeDismissed: false, setupCompleted: false },
    updatedAt: new Date().toISOString(),
  };
}

export const PRICING_MODEL_LABELS: Record<PricingModel, string> = {
  fixed: 'Fixed price',
  hourly: 'Hourly',
  daily: 'Daily',
  custom: 'Custom quotation',
};

export const PRICING_MODEL_UNITS: Record<PricingModel, string> = {
  fixed: 'item',
  hourly: 'hour',
  daily: 'day',
  custom: 'item',
};

export const VAT_CATEGORY_LABELS: Record<VatCategory, string> = {
  standard: 'Standard',
  zero: 'Zero-rated',
  exempt: 'Exempt',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  eft: 'EFT',
  bank_transfer: 'Bank transfer',
  cash: 'Cash',
  card: 'Card',
  other: 'Other',
};

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  active: 'Active',
  lead: 'Lead',
  inactive: 'Inactive',
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  planning: 'Planning',
  quoted: 'Quoted',
  approved: 'Approved',
  in_progress: 'In Progress',
  review: 'Review',
  completed: 'Completed',
  on_hold: 'On Hold',
  cancelled: 'Cancelled',
};

export const EXPENSE_CATEGORIES = [
  'Software subscriptions',
  'Hosting',
  'Domains',
  'Hardware',
  'Internet',
  'Marketing',
  'Advertising',
  'Business operations',
  'Contractor payments',
  'Miscellaneous',
];

export const SERVICE_CATEGORIES = [
  'Web Design & Development',
  'Web Applications',
  'Design',
  'Support & Maintenance',
  'Infrastructure',
  'Integration & Automation',
  'Engineering',
  'Consulting',
];

export const PROJECT_CATEGORIES = [
  'Website',
  'Website Redesign',
  'Web Application',
  'Progressive Web App',
  'UI/UX Design',
  'Automation',
  'Integration',
  'Maintenance',
  'Consulting',
  'Other',
];

type SeedService = Pick<Service, 'name' | 'category' | 'description' | 'pricingModel' | 'deliveryEstimate'>;

/**
 * Initial ASPECTS STUDIOS service catalogue. Prices are intentionally 0 so the owner
 * sets their own rates — no financial figures are hard-coded.
 */
export const SEED_SERVICES: SeedService[] = [
  {
    name: 'Website Design & Development',
    category: 'Web Design & Development',
    pricingModel: 'fixed',
    deliveryEstimate: '3–6 weeks',
    description:
      "Professional website design and development tailored to the client's business objectives. Includes website structure, responsive layouts, frontend implementation, content organisation and deployment preparation.",
  },
  {
    name: 'Website Redesign & Modernisation',
    category: 'Web Design & Development',
    pricingModel: 'fixed',
    deliveryEstimate: '2–5 weeks',
    description:
      'Comprehensive redesign of an existing website to improve its visual presentation, user experience, navigation, responsiveness and overall functionality. Includes layout modernisation and interface improvements.',
  },
  {
    name: 'Responsive Website Development',
    category: 'Web Design & Development',
    pricingModel: 'fixed',
    deliveryEstimate: '2–4 weeks',
    description:
      'Development of websites optimised for desktop, tablet and mobile devices, ensuring consistent presentation, usability and functionality across different screen sizes.',
  },
  {
    name: 'Progressive Web Application (PWA) Development',
    category: 'Web Applications',
    pricingModel: 'fixed',
    deliveryEstimate: '4–10 weeks',
    description:
      'Design and development of installable web applications featuring responsive interfaces, application-like navigation, service worker integration, offline capabilities where supported and device installation support.',
  },
  {
    name: 'Web Application Development',
    category: 'Web Applications',
    pricingModel: 'fixed',
    deliveryEstimate: '6–12 weeks',
    description:
      'Development of custom browser-based applications designed to solve specific business requirements. Includes interface development, application logic, data management and functional implementation.',
  },
  {
    name: 'UI/UX Design',
    category: 'Design',
    pricingModel: 'fixed',
    deliveryEstimate: '1–3 weeks',
    description:
      'User interface and user experience design focused on usability, visual consistency, intuitive navigation and efficient user interactions.',
  },
  {
    name: 'Website Maintenance & Support',
    category: 'Support & Maintenance',
    pricingModel: 'fixed',
    deliveryEstimate: 'Monthly',
    description:
      'Ongoing technical maintenance covering software updates, minor improvements, troubleshooting, performance monitoring and general website support.',
  },
  {
    name: 'Website Performance Optimisation',
    category: 'Support & Maintenance',
    pricingModel: 'fixed',
    deliveryEstimate: '3–7 days',
    description:
      'Technical optimisation aimed at improving loading performance, resource efficiency, responsiveness and overall website experience.',
  },
  {
    name: 'Domain & Hosting Configuration',
    category: 'Infrastructure',
    pricingModel: 'fixed',
    deliveryEstimate: '1–3 days',
    description:
      'Configuration and deployment assistance involving domain connections, DNS settings, hosting environments, SSL certificates and production deployment.',
  },
  {
    name: 'Third-Party API Integration',
    category: 'Integration & Automation',
    pricingModel: 'hourly',
    deliveryEstimate: '',
    description:
      'Integration of external APIs and third-party services to extend application functionality, automate processes and enable communication between software systems.',
  },
  {
    name: 'Business Automation Solutions',
    category: 'Integration & Automation',
    pricingModel: 'custom',
    deliveryEstimate: '',
    description:
      'Development and configuration of digital automation workflows designed to reduce repetitive administrative tasks and improve operational efficiency.',
  },
  {
    name: 'Bug Fixing & Technical Troubleshooting',
    category: 'Engineering',
    pricingModel: 'hourly',
    deliveryEstimate: '',
    description:
      'Identification, investigation and resolution of software defects, interface issues, compatibility problems and unexpected application behaviour.',
  },
  {
    name: 'Database Design & Implementation',
    category: 'Engineering',
    pricingModel: 'fixed',
    deliveryEstimate: '1–3 weeks',
    description:
      'Design and implementation of structured data storage solutions, including database architecture, data relationships, CRUD functionality and data management.',
  },
  {
    name: 'Custom Software Development',
    category: 'Engineering',
    pricingModel: 'custom',
    deliveryEstimate: '',
    description:
      'Development of specialised software solutions tailored to unique business processes, technical requirements and operational objectives.',
  },
  {
    name: 'Digital Consultation & Technical Advisory',
    category: 'Consulting',
    pricingModel: 'hourly',
    deliveryEstimate: '',
    description:
      'Professional technical consultation covering digital strategy, software requirements, technology selection, implementation planning and solution recommendations.',
  },
];
