import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Badge } from './Badge';

function NavItem({ to, children, end = false }: { to: string; children: ReactNode; end?: boolean }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
      {children}
    </NavLink>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  return (
    <div className="layout">
      <header className="topbar">
        <span className="brand">Mini ERP</span>
        <nav aria-label="Main navigation">
          <NavItem to="/dashboard" end>
            Dashboard
          </NavItem>
          <NavItem to="/imports">
            Imports
          </NavItem>
          <NavItem to="/conflicts">
            Conflicts
          </NavItem>
          <NavItem to="/products">
            Products
          </NavItem>
          <NavItem to="/stock">
            Stock
          </NavItem>
          <NavItem to="/orders">
            Orders
          </NavItem>
          <NavItem to="/reports">
            Reports
          </NavItem>
          {isAdmin && (
            <NavItem to="/audit">
              Audit
            </NavItem>
          )}
        </nav>
        <div className="userbox">
          {user && (
            <span className="user-meta">
              {user.name} <Badge>{user.role}</Badge>
            </span>
          )}
          <button type="button" className="btn" onClick={logout}>
            Log out
          </button>
        </div>
      </header>
      <main className="content">{children}</main>
    </div>
  );
}
