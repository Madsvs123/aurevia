import type { ReactNode } from 'react';
import { LayoutDashboard, Wallet, ListChecks, Target, FileText, Users, FileBarChart2, Bell, Settings, Menu, X, Sun, Moon, LogOut, Lightbulb, User as UserIcon } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import clsx from 'clsx';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../hooks/useTheme';
import { useNotifications } from '../../hooks/useNotifications';
import { useInsightsUnread } from '../../hooks/useInsights';
import { InstrumentSearch } from '../search/InstrumentSearch';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
  advisorOnly?: boolean;
  badge?: number;
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  const { unreadCount } = useNotifications();
  const insightsUnread = useInsightsUnread();
  const navigate = useNavigate();

  const items: NavItem[] = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/portfolios', label: 'Portfolios', icon: Wallet },
    { to: '/watchlists', label: 'Watchlists', icon: ListChecks },
    { to: '/goals', label: 'Goals', icon: Target },
    { to: '/insights', label: 'Insights', icon: Lightbulb, badge: insightsUnread },
    { to: '/research', label: 'Research', icon: FileText },
    { to: '/clients', label: 'Clients', icon: Users },
    { to: '/reports', label: 'Reports', icon: FileBarChart2 },
    { to: '/notifications', label: 'Notifications', icon: Bell, badge: unreadCount },
    { to: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2.5 px-5 h-[var(--topbar-h)] shrink-0">
        <div
          className="flex items-center justify-center rounded-lg font-bold text-white"
          style={{ width: 32, height: 32, background: 'var(--primary)' }}
        >
          A
        </div>
        <span className="text-lg font-bold tracking-tight">Aurevia</span>
      </div>

      <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto" aria-label="Main navigation">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) => clsx('sidebar-link', isActive && 'sidebar-link-active')}
            >
              <Icon size={17} className="shrink-0" />
              <span className="flex-1">{item.label}</span>
              {item.badge !== undefined && item.badge > 0 ? (
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white"
                  style={{ background: 'var(--danger)' }}
                >
                  {item.badge > 9 ? '99+' : item.badge}
                </span>
              ) : null}
            </NavLink>
          );
        })}
      </nav>

      <div className="p-3 border-t shrink-0" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2.5 px-2 py-2">
          <div
            className="flex items-center justify-center rounded-full text-white font-semibold text-xs"
            style={{ width: 32, height: 32, background: 'var(--accent)' }}
          >
            {user ? user.first_name.charAt(0).toUpperCase() : '?'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate">
              {user ? `${user.first_name} ${user.last_name}`.trim() : 'Guest'}
            </p>
            <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>
              {user?.email}
            </p>
          </div>
          <button
            onClick={() => {
              logout();
              navigate('/auth/login');
            }}
            className="btn btn-ghost btn-sm !px-1.5"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { theme, toggle } = useTheme();
  const { unreadCount } = useNotifications();
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <aside
        className="hidden lg:block shrink-0 h-full"
        style={{ width: 'var(--sidebar-w)', background: 'var(--surface)', borderRight: '1px solid var(--border)' }}
      >
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0" style={{ background: 'rgb(0 0 0 / 0.5)' }} onClick={() => setDrawerOpen(false)} />
          <aside
            className="absolute left-0 top-0 h-full w-[280px]"
            style={{ background: 'var(--surface)', borderRight: '1px solid var(--border)', animation: 'slide-in 0.2s ease-out' }}
          >
            <button
              onClick={() => setDrawerOpen(false)}
              className="btn btn-ghost btn-sm absolute right-2 top-3"
              aria-label="Close menu"
            >
              <X size={16} />
            </button>
            <SidebarContent onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>
      ) : null}

      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header
          className="flex items-center gap-3 px-4 lg:px-6 shrink-0 z-30"
          style={{
            height: 'var(--topbar-h)',
            background: 'var(--surface)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <button
            className="btn btn-ghost btn-sm !px-1.5 lg:hidden"
            onClick={() => setDrawerOpen(false)}
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>

          <div className="flex-1 max-w-md">
            <InstrumentSearch
              onSelect={(instrument) => navigate(`/research?instrument=${encodeURIComponent(instrument.symbol)}`)}
            />
          </div>

          <div className="flex-1" />

          <button
            onClick={toggle}
            className="btn btn-ghost btn-sm !px-2"
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>

          <NavLink to="/notifications" className="relative btn btn-ghost btn-sm !px-2" aria-label="Notifications">
            <Bell size={17} />
            {unreadCount > 0 ? (
              <span
                className="absolute -top-0.5 -right-0.5 rounded-full px-1 text-[9px] font-bold text-white"
                style={{ background: 'var(--danger)', minWidth: 16, textAlign: 'center' }}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            ) : null}
          </NavLink>

          <button
            onClick={() => navigate('/settings')}
            className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:opacity-80"
            aria-label="Account settings"
          >
            <div
              className="flex items-center justify-center rounded-full text-white font-semibold text-xs"
              style={{ width: 30, height: 30, background: 'var(--accent)' }}
            >
              {user ? user.first_name.charAt(0).toUpperCase() : <UserIcon size={14} />}
            </div>
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

export type { ReactNode };
