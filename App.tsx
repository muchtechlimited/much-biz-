import { Navigate, Route, Routes } from 'react-router-dom';
import {
  BarChart3, Boxes, Building2, ClipboardList, CreditCard, FileText, HelpCircle, LayoutDashboard, LifeBuoy,
  ScrollText, Settings as SettingsIcon, ShoppingCart, ShieldCheck, Store, Truck, Receipt, Users, UserCog,
  Wallet, Package, Bell, Tags, Banknote,
} from 'lucide-react';
import { AppShell } from './components/AppShell';
import type { NavItem } from './components/AppShell';
import { RequireBusinessUser, RequirePermission, RequirePlatformAdmin } from './components/Guards';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import Onboarding from './pages/auth/Onboarding';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import POS from './pages/POS';
import Invoices from './pages/Invoices';
import Reports from './pages/Reports';
import Support from './pages/Support';
import NotificationsPage from './pages/Notifications';
import CustomerStatement from './pages/CustomerStatement';
import Settings from './pages/Settings';
import Receipt_ from './pages/Receipt';
import {
  Customers, Expenses, Help, Inventory, Purchases, Sales, StaffPage, Suppliers,
} from './pages/modules';
import {
  AdminAdmins, AdminAudit, AdminBusinesses, AdminNotifications, AdminOverview, AdminPayments,
  AdminSettings, AdminSubscriptions, AdminTickets, AdminUsers,
} from './pages/admin/AdminPages';
import Setup2FA from './pages/admin/Setup2FA';
import PlanEditor from './pages/admin/PlanEditor';
import Billing from './pages/billing/Billing';
import BillingCallback from './pages/billing/BillingCallback';
import { useAuth } from './lib/auth';

const shopNav: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/pos', label: 'Point of Sale', icon: ShoppingCart },
  { to: '/products', label: 'Products', icon: Package },
  { to: '/inventory', label: 'Inventory', icon: Boxes },
  { to: '/sales', label: 'Sales', icon: Receipt },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/suppliers', label: 'Suppliers', icon: Truck },
  { to: '/purchases', label: 'Purchases', icon: ClipboardList },
  { to: '/expenses', label: 'Expenses', icon: Wallet, permission: 'expenses.write' },
  { to: '/invoices', label: 'Invoices', icon: FileText, permission: 'invoices.write' },
  { to: '/reports', label: 'Reports', icon: BarChart3, permission: 'reports.view' },
  { to: '/staff', label: 'Staff', icon: UserCog, permission: 'staff.manage' },
  { to: '/billing', label: 'Subscription', icon: CreditCard, permission: 'billing.view' },
  { to: '/support', label: 'Support', icon: LifeBuoy },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
  { to: '/help', label: 'Help', icon: HelpCircle },
];

const adminNav: NavItem[] = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard },
  { to: '/admin/businesses', label: 'Businesses', icon: Building2, permission: 'businesses.view' },
  { to: '/admin/users', label: 'Users', icon: Users, permission: 'users.view' },
  { to: '/admin/plans', label: 'Subscription Plans', icon: Tags, permission: 'plans.view' },
  { to: '/admin/subscriptions', label: 'Subscriptions', icon: CreditCard, permission: 'subscriptions.view' },
  { to: '/admin/payments', label: 'Payments', icon: Banknote, permission: 'payments.view' },
  { to: '/admin/tickets', label: 'Support Tickets', icon: LifeBuoy, permission: 'tickets.view' },
  { to: '/admin/administrators', label: 'Administrators & Roles', icon: ShieldCheck, permission: 'admins.view' },
  { to: '/admin/audit-logs', label: 'Audit Logs', icon: ScrollText, permission: 'audit.view' },
  { to: '/admin/notifications', label: 'Notifications', icon: Bell },
  { to: '/admin/settings', label: 'Platform Settings', icon: SettingsIcon, permission: 'settings.view' },
];

function ShopShell() {
  const { user } = useAuth();
  return <AppShell items={shopNav} title={user?.business?.name ?? 'Much Biz'} notificationsTo="/notifications" helpTo="/help" />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/admin/login" element={<Login admin />} />

      <Route element={<RequireBusinessUser />}>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/receipt/:id" element={<Receipt_ />} />
        <Route element={<ShopShell />}>
          <Route index element={<Dashboard />} />
          <Route path="pos" element={<POS />} />
          <Route path="products" element={<Products />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="sales" element={<Sales />} />
          <Route path="customers" element={<Customers />} />
          <Route path="customers/:id/statement" element={<RequirePermission permission="customers.payments"><CustomerStatement /></RequirePermission>} />
          <Route path="suppliers" element={<Suppliers />} />
          <Route path="purchases" element={<Purchases />} />
          <Route path="expenses" element={<RequirePermission permission="expenses.write"><Expenses /></RequirePermission>} />
          <Route path="invoices" element={<RequirePermission permission="invoices.write"><Invoices /></RequirePermission>} />
          <Route path="reports" element={<RequirePermission permission="reports.view"><Reports /></RequirePermission>} />
          <Route path="staff" element={<RequirePermission permission="staff.manage"><StaffPage /></RequirePermission>} />
          <Route path="billing" element={<RequirePermission permission="billing.view"><Billing /></RequirePermission>} />
          <Route path="billing/callback" element={<BillingCallback />} />
          <Route path="settings" element={<Settings />} />
          <Route path="help" element={<Help />} />
          <Route path="support" element={<Support />} />
          <Route path="notifications" element={<NotificationsPage base="/notifications" />} />
        </Route>
      </Route>

      <Route element={<RequirePlatformAdmin />}>
        <Route path="/admin" element={<AppShell items={adminNav} title="Much Biz Platform Control" variant="admin" notificationsTo="/admin/notifications" />}>
          <Route index element={<AdminOverview />} />
          <Route path="businesses" element={<RequirePermission permission="businesses.view"><AdminBusinesses /></RequirePermission>} />
          <Route path="users" element={<RequirePermission permission="users.view"><AdminUsers /></RequirePermission>} />
          <Route path="plans" element={<RequirePermission permission="plans.view"><PlanEditor /></RequirePermission>} />
          <Route path="subscriptions" element={<RequirePermission permission="subscriptions.view"><AdminSubscriptions /></RequirePermission>} />
          <Route path="payments" element={<RequirePermission permission="payments.view"><AdminPayments /></RequirePermission>} />
          <Route path="tickets" element={<RequirePermission permission="tickets.view"><AdminTickets /></RequirePermission>} />
          <Route path="administrators" element={<RequirePermission permission="admins.view"><AdminAdmins /></RequirePermission>} />
          <Route path="audit-logs" element={<RequirePermission permission="audit.view"><AdminAudit /></RequirePermission>} />
          <Route path="notifications" element={<AdminNotifications />} />
          <Route path="settings" element={<RequirePermission permission="settings.view"><AdminSettings /></RequirePermission>} />
          <Route path="security" element={<Setup2FA />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
