import { BrowserRouter, Navigate, Route, Routes, useSearchParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { BrandingProvider } from './context/BrandingContext';
import { CartProvider } from './context/CartContext';
import { AdminLayout, ClientLayout } from './components/Layout';
import { isStaffOrAdmin } from './lib/roles';
import { LandingPage } from './pages/Landing';
import { LoginPage, RegisterPage } from './pages/Auth';
import { DashboardPage } from './pages/client/Dashboard';
import { CategoryPlansPage, GameHostingPage } from './pages/client/Store';
import { CartPage } from './pages/client/Cart';
import { ServicesPage, ServiceDetailPage } from './pages/client/Services';
import { InvoicesPage, InvoiceDetailPage } from './pages/client/Invoices';
import { ProfilePage } from './pages/client/Profile';
import {
  AdminOverview,
} from './pages/admin/AdminPages';
import { AdminSettings } from './pages/admin/AdminSettings';
import { AdminServices } from './pages/admin/AdminServices';
import { AdminServiceCreate } from './pages/admin/AdminServiceCreate';
import { AdminServiceDetail } from './pages/admin/AdminServiceDetail';
import { AdminInvoices } from './pages/admin/AdminInvoices';
import { AdminInvoiceDetail } from './pages/admin/AdminInvoiceDetail';
import { AdminCategories, AdminCategoryEdit } from './pages/admin/AdminCategories';
import { AdminCoupons } from './pages/admin/AdminCoupons';
import { AdminProductEdit, AdminProducts } from './pages/admin/AdminProducts';
import { AdminUserDetail, AdminUsers } from './pages/admin/AdminUsers';
import { AdminLogs } from './pages/admin/AdminLogs';
import { AdminAnalytics } from './pages/admin/AdminAnalytics';
import { AdminTickets, AdminTicketDetail } from './pages/admin/AdminTickets';
import { AdminTicketCategories } from './pages/admin/AdminTicketCategories';
import { TicketsPage, TicketDetailPage } from './pages/client/Tickets';

function safeNextPath(raw: string | null) {
  if (!raw) return null;
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  return raw;
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

export default function App() {
  return (
    <BrandingProvider>
      <AuthProvider>
        <CartProvider>
          <BrowserRouter>
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
                <Route path="categories" element={<AdminCategories />} />
                <Route path="categories/new" element={<AdminCategoryEdit />} />
                <Route path="categories/:id" element={<AdminCategoryEdit />} />
                <Route path="products" element={<AdminProducts />} />
                <Route path="products/new" element={<AdminProductEdit />} />
                <Route path="products/:id" element={<AdminProductEdit />} />
                <Route path="invoices" element={<AdminInvoices />} />
                <Route path="invoices/:id" element={<AdminInvoiceDetail />} />
                <Route path="services" element={<AdminServices />} />
                <Route path="services/new" element={<AdminServiceCreate />} />
                <Route path="services/:id" element={<AdminServiceDetail />} />
                <Route path="coupons" element={<AdminCoupons />} />
                <Route path="users" element={<AdminUsers />} />
                <Route path="users/:id" element={<AdminUserDetail />} />
                <Route path="tickets" element={<AdminTickets />} />
                <Route path="tickets/:id" element={<AdminTicketDetail />} />
                <Route path="ticket-categories" element={<AdminTicketCategories />} />
                <Route path="logs" element={<AdminLogs />} />
                <Route path="analytics" element={<AdminAnalytics />} />
                <Route path="settings" element={<AdminSettings />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </CartProvider>
      </AuthProvider>
    </BrandingProvider>
  );
}
