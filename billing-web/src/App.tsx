import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useSearchParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { BrandingProvider } from './context/BrandingContext';
import { CartProvider } from './context/CartContext';
import { AdminLayout, ClientLayout } from './components/Layout';
import { isFullAdmin, isStaffOrAdmin } from './lib/roles';
import { LandingPage } from './pages/Landing';
import { LoginPage, RegisterPage } from './pages/Auth';

const DashboardPage = lazy(() =>
  import('./pages/client/Dashboard').then((m) => ({ default: m.DashboardPage })),
);
const GameHostingPage = lazy(() =>
  import('./pages/client/Store').then((m) => ({ default: m.GameHostingPage })),
);
const CategoryPlansPage = lazy(() =>
  import('./pages/client/Store').then((m) => ({ default: m.CategoryPlansPage })),
);
const CartPage = lazy(() => import('./pages/client/Cart').then((m) => ({ default: m.CartPage })));
const ServicesPage = lazy(() =>
  import('./pages/client/Services').then((m) => ({ default: m.ServicesPage })),
);
const ServiceDetailPage = lazy(() =>
  import('./pages/client/Services').then((m) => ({ default: m.ServiceDetailPage })),
);
const InvoicesPage = lazy(() =>
  import('./pages/client/Invoices').then((m) => ({ default: m.InvoicesPage })),
);
const InvoiceDetailPage = lazy(() =>
  import('./pages/client/Invoices').then((m) => ({ default: m.InvoiceDetailPage })),
);
const ProfilePage = lazy(() =>
  import('./pages/client/Profile').then((m) => ({ default: m.ProfilePage })),
);
const TicketsPage = lazy(() =>
  import('./pages/client/Tickets').then((m) => ({ default: m.TicketsPage })),
);
const TicketDetailPage = lazy(() =>
  import('./pages/client/Tickets').then((m) => ({ default: m.TicketDetailPage })),
);

const AdminOverview = lazy(() =>
  import('./pages/admin/AdminPages').then((m) => ({ default: m.AdminOverview })),
);
const AdminSettings = lazy(() =>
  import('./pages/admin/AdminSettings').then((m) => ({ default: m.AdminSettings })),
);
const AdminServices = lazy(() =>
  import('./pages/admin/AdminServices').then((m) => ({ default: m.AdminServices })),
);
const AdminServiceCreate = lazy(() =>
  import('./pages/admin/AdminServiceCreate').then((m) => ({ default: m.AdminServiceCreate })),
);
const AdminServiceDetail = lazy(() =>
  import('./pages/admin/AdminServiceDetail').then((m) => ({ default: m.AdminServiceDetail })),
);
const AdminInvoices = lazy(() =>
  import('./pages/admin/AdminInvoices').then((m) => ({ default: m.AdminInvoices })),
);
const AdminInvoiceDetail = lazy(() =>
  import('./pages/admin/AdminInvoiceDetail').then((m) => ({ default: m.AdminInvoiceDetail })),
);
const AdminCategories = lazy(() =>
  import('./pages/admin/AdminCategories').then((m) => ({ default: m.AdminCategories })),
);
const AdminCategoryEdit = lazy(() =>
  import('./pages/admin/AdminCategories').then((m) => ({ default: m.AdminCategoryEdit })),
);
const AdminCoupons = lazy(() =>
  import('./pages/admin/AdminCoupons').then((m) => ({ default: m.AdminCoupons })),
);
const AdminProducts = lazy(() =>
  import('./pages/admin/AdminProducts').then((m) => ({ default: m.AdminProducts })),
);
const AdminProductEdit = lazy(() =>
  import('./pages/admin/AdminProducts').then((m) => ({ default: m.AdminProductEdit })),
);
const AdminUsers = lazy(() =>
  import('./pages/admin/AdminUsers').then((m) => ({ default: m.AdminUsers })),
);
const AdminUserDetail = lazy(() =>
  import('./pages/admin/AdminUsers').then((m) => ({ default: m.AdminUserDetail })),
);
const AdminLogs = lazy(() =>
  import('./pages/admin/AdminLogs').then((m) => ({ default: m.AdminLogs })),
);
const AdminAnalytics = lazy(() =>
  import('./pages/admin/AdminAnalytics').then((m) => ({ default: m.AdminAnalytics })),
);
const AdminTickets = lazy(() =>
  import('./pages/admin/AdminTickets').then((m) => ({ default: m.AdminTickets })),
);
const AdminTicketDetail = lazy(() =>
  import('./pages/admin/AdminTickets').then((m) => ({ default: m.AdminTicketDetail })),
);
const AdminTicketCategories = lazy(() =>
  import('./pages/admin/AdminTicketCategories').then((m) => ({ default: m.AdminTicketCategories })),
);

function RouteFallback() {
  return <div className="ds-page" style={{ padding: '2rem', color: 'var(--muted)' }}>Loading…</div>;
}

function safeNextPath(raw: string | null) {
  if (!raw) return null;
  let value = raw.trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    return null;
  }
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\') || /\s/.test(value)) {
    return null;
  }
  if (value.includes('://') || value.toLowerCase().includes('%2f%2f')) return null;
  return value;
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [searchParams] = useSearchParams();
  if (loading) return null;
  if (user) {
    const next = safeNextPath(searchParams.get('next'));
    return <Navigate to={next || (isStaffOrAdmin(user.role) ? '/admin' : '/dashboard')} replace />;
  }
  return children;
}

/** Catalog / settings routes — full administrators only (API already enforces). */
function FullAdminOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user || !isStaffOrAdmin(user.role)) return <Navigate to="/login" replace />;
  if (!isFullAdmin(user.role)) return <Navigate to="/admin" replace />;
  return children;
}

export default function App() {
  return (
    <BrandingProvider>
      <AuthProvider>
        <CartProvider>
          <BrowserRouter>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
                <Route path="/register" element={<PublicOnly><RegisterPage /></PublicOnly>} />

                <Route element={<ClientLayout />}>
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/game-hosting" element={<GameHostingPage />} />
                  <Route path="/game-hosting/:categoryId" element={<CategoryPlansPage />} />
                  <Route path="/cart" element={<CartPage />} />
                  <Route path="/store" element={<Navigate to="/game-hosting" replace />} />
                  <Route path="/services" element={<ServicesPage />} />
                  <Route path="/services/:id" element={<ServiceDetailPage />} />
                  <Route path="/invoices" element={<InvoicesPage />} />
                  <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
                  <Route path="/tickets" element={<TicketsPage />} />
                  <Route path="/tickets/:id" element={<TicketDetailPage />} />
                  <Route path="/profile" element={<ProfilePage />} />
                </Route>

                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<AdminOverview />} />
                  <Route path="categories" element={<FullAdminOnly><AdminCategories /></FullAdminOnly>} />
                  <Route path="categories/new" element={<FullAdminOnly><AdminCategoryEdit /></FullAdminOnly>} />
                  <Route path="categories/:id" element={<FullAdminOnly><AdminCategoryEdit /></FullAdminOnly>} />
                  <Route path="products" element={<FullAdminOnly><AdminProducts /></FullAdminOnly>} />
                  <Route path="products/new" element={<FullAdminOnly><AdminProductEdit /></FullAdminOnly>} />
                  <Route path="products/:id" element={<FullAdminOnly><AdminProductEdit /></FullAdminOnly>} />
                  <Route path="invoices" element={<AdminInvoices />} />
                  <Route path="invoices/:id" element={<AdminInvoiceDetail />} />
                  <Route path="services" element={<AdminServices />} />
                  <Route path="services/new" element={<FullAdminOnly><AdminServiceCreate /></FullAdminOnly>} />
                  <Route path="services/:id" element={<AdminServiceDetail />} />
                  <Route path="coupons" element={<FullAdminOnly><AdminCoupons /></FullAdminOnly>} />
                  <Route path="users" element={<AdminUsers />} />
                  <Route path="users/:id" element={<AdminUserDetail />} />
                  <Route path="tickets" element={<AdminTickets />} />
                  <Route path="tickets/:id" element={<AdminTicketDetail />} />
                  <Route path="ticket-categories" element={<FullAdminOnly><AdminTicketCategories /></FullAdminOnly>} />
                  <Route path="logs" element={<AdminLogs />} />
                  <Route path="analytics" element={<AdminAnalytics />} />
                  <Route path="settings" element={<FullAdminOnly><AdminSettings /></FullAdminOnly>} />
                </Route>

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </CartProvider>
      </AuthProvider>
    </BrandingProvider>
  );
}
