import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { Layout } from './components/Layout';
import { Loading } from './components/Loading';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Imports } from './pages/Imports';
import { Conflicts } from './pages/Conflicts';
import { Products } from './pages/Products';
import { Stock } from './pages/Stock';
import { Orders } from './pages/Orders';
import { Reports } from './pages/Reports';
import { Audit } from './pages/Audit';

function RequireAuth() {
  const { status } = useAuth();
  if (status === 'loading') return <Loading label="Restoring session…" />;
  if (status === 'anonymous') return <Navigate to="/login" replace />;
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}

function LoginRoute() {
  const { status } = useAuth();
  if (status === 'authenticated') return <Navigate to="/dashboard" replace />;
  return <Login />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
          <Route element={<RequireAuth />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/imports" element={<Imports />} />
            <Route path="/conflicts" element={<Conflicts />} />
            <Route path="/products" element={<Products />} />
            <Route path="/stock" element={<Stock />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/audit" element={<Audit />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
