import {
  BarChart3,
  Briefcase,
  CreditCard,
  FileText,
  FolderKanban,
  LayoutDashboard,
  Receipt,
  ScrollText,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Shown in the phone bottom bar (others are under "More"). */
  primaryMobile?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, primaryMobile: true },
  { to: '/invoices', label: 'Invoices', icon: FileText, primaryMobile: true },
  { to: '/quotations', label: 'Quotations', icon: ScrollText, primaryMobile: true },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/clients', label: 'Clients', icon: Users, primaryMobile: true },
  { to: '/services', label: 'Services', icon: Briefcase },
  { to: '/payments', label: 'Payments', icon: CreditCard },
  { to: '/expenses', label: 'Expenses', icon: Receipt },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export const QUICK_CREATE = [
  { to: '/invoices/new', label: 'New invoice', icon: FileText },
  { to: '/quotations/new', label: 'New quotation', icon: ScrollText },
  { to: '/payments?new=1', label: 'Record payment', icon: CreditCard },
  { to: '/expenses?new=1', label: 'Add expense', icon: Receipt },
  { to: '/clients?new=1', label: 'New client', icon: Users },
  { to: '/projects?new=1', label: 'New project', icon: FolderKanban },
];
