import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { UserRole } from '../types';
import { STAFF_PATH, breadcrumbsForPath, pathToTab } from '../constants/nav';
import CommandPalette from './CommandPalette';
import AppContextBar from './AppContextBar';
import BrandMark from './BrandMark';
import PilotbaseWordmark from './PilotbaseWordmark';
import InAppNotificationBell from './InAppNotificationBell';

const NAV_ITEMS: { id: string; label: string; icon: string; roles?: UserRole[] }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '⊞' },
  { id: 'account', label: 'Account', icon: '👤' },
  { id: 'queue', label: 'Approval Queue', icon: '✓' },
  { id: 'activity', label: 'Activity Feed', icon: '◎' },
  { id: 'students', label: 'Students', icon: '⚑', roles: ['admin'] },
  { id: 'analysis', label: 'Analysis', icon: '▲', roles: ['admin', 'scheduler'] },
  { id: 'config', label: 'Policy Config', icon: '⚙', roles: ['admin'] },
];

const SIDEBAR_W_EXPANDED = 220;
const SIDEBAR_W_COLLAPSED = 72;
const SIDEBAR_STORAGE_KEY = 'scheduler-sidebar-collapsed';

function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export default function Layout({
  notificationCount = 0,
}: {
  notificationCount?: number;
}) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed);
  const navigate = useNavigate();
  const location = useLocation();
  const activeTab = pathToTab(location.pathname);
  const crumbs = breadcrumbsForPath(location.pathname);

  const navItems = NAV_ITEMS.filter(item => !item.roles || (user?.role && item.roles.includes(user.role)));

  const handleNav = (id: string) => {
    const path = STAFF_PATH[id as keyof typeof STAFF_PATH];
    if (path) navigate(path);
    setMobileOpen(false);
  };

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed(c => {
      const next = !c;
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? '1' : '0');
      } catch { /* ignore */ }
      return next;
    });
  }, []);

  const sidebarW = sidebarCollapsed ? SIDEBAR_W_COLLAPSED : SIDEBAR_W_EXPANDED;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b' && !e.shiftKey && !e.altKey) {
        const el = e.target as HTMLElement | null;
        if (el?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
        e.preventDefault();
        toggleSidebarCollapsed();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleSidebarCollapsed]);

  const userInitials = (() => {
    const n = user?.name?.trim();
    if (!n) return '?';
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return n.slice(0, 2).toUpperCase();
  })();

  const Sidebar = ({
    railMode,
    showRailToggle,
  }: {
    railMode: boolean;
    showRailToggle: boolean;
  }) => (
    <div style={{
      width: '100%',
      flexShrink: 0,
      background: 'var(--sidebar-bg)',
      display: 'flex', flexDirection: 'column' as const,
      height: '100%',
      minWidth: 0,
    }}>
      <div style={{
        padding: railMode ? '16px 8px 12px' : '20px 16px 16px',
        borderBottom: '1px solid var(--sidebar-border, rgba(255,255,255,0.1))',
      }}>
        <div style={{
          display: 'flex',
          flexDirection: railMode ? 'column' as const : 'row',
          alignItems: railMode ? 'center' : 'center',
          gap: railMode ? 10 : 12,
          flexWrap: 'nowrap' as const,
        }}>
          <BrandMark size={railMode ? 34 : 36} />
          {!railMode && (
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ color: 'var(--sidebar-text)', fontWeight: 700, fontSize: '13px', lineHeight: 1.2 }}>Scheduler</div>
              <div style={{ marginTop: 6 }}>
                <PilotbaseWordmark height={14} />
              </div>
            </div>
          )}
          {!railMode && notificationCount > 0 && (
            <button
              type="button"
              aria-label={`Open approval queue, ${notificationCount} pending`}
              onClick={() => handleNav('queue')}
              style={{
                flexShrink: 0,
                position: 'relative' as const, cursor: 'pointer',
                background: 'none', border: 'none', padding: 4, lineHeight: 1,
              }}
            >
              <span style={{ fontSize: '16px' }}>🔔</span>
              <span style={{
                position: 'absolute' as const, top: '-4px', right: '-4px', background: '#ef4444', color: '#fff',
                borderRadius: '50%', width: '14px', height: '14px', fontSize: '9px', fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{notificationCount}</span>
            </button>
          )}
          {railMode && notificationCount > 0 && (
            <button
              type="button"
              aria-label={`Open approval queue, ${notificationCount} pending`}
              onClick={() => handleNav('queue')}
              style={{
                position: 'relative' as const, cursor: 'pointer',
                background: 'none', border: 'none', padding: 4, lineHeight: 1,
              }}
            >
              <span style={{ fontSize: '18px' }}>🔔</span>
              <span style={{
                position: 'absolute' as const, top: '-4px', right: '-4px', background: '#ef4444', color: '#fff',
                borderRadius: '50%', width: '14px', height: '14px', fontSize: '9px', fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{notificationCount}</span>
            </button>
          )}
        </div>
      </div>

      <nav style={{ flex: 1, padding: railMode ? '8px 6px' : '12px 10px', overflowY: 'auto' as const }}>
        {navItems.map(item => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              title={item.label}
              onClick={() => handleNav(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: railMode ? 0 : 10,
                justifyContent: railMode ? 'center' : 'flex-start',
                width: '100%',
                padding: railMode ? '10px 8px' : '10px 12px',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                marginBottom: '2px',
                background: isActive ? 'rgba(6, 182, 212, 0.15)' : 'transparent',
                color: isActive ? '#fff' : 'rgba(255,255,255,0.72)',
                fontSize: '13px',
                fontWeight: isActive ? 600 : 450,
                transition: 'all .15s',
                borderLeft: isActive ? '3px solid #06b6d4' : '3px solid transparent',
              }}
            >
              <span style={{ fontSize: railMode ? '16px' : '14px', width: railMode ? 'auto' : '18px', textAlign: 'center' as const, flexShrink: 0 }}>{item.icon}</span>
              {!railMode && (
                <span style={{ textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
              )}
            </button>
          );
        })}
      </nav>

      {showRailToggle && (
        <div style={{ padding: railMode ? '0 8px 8px' : '0 10px 8px' }}>
          <button
            type="button"
            onClick={toggleSidebarCollapsed}
            title={railMode ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!railMode}
            aria-label={railMode ? 'Expand sidebar' : 'Collapse sidebar'}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: '8px',
              background: 'rgba(255,255,255,0.04)',
              color: 'rgba(255,255,255,0.85)',
              fontSize: '16px',
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            {railMode ? '»' : '«'}
          </button>
        </div>
      )}

      <div style={{ padding: railMode ? '8px 8px 12px' : '12px 10px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        {railMode ? (
          <div
            title={`${user?.name ?? ''} (${user?.role ?? ''})`}
            style={{
              display: 'flex',
              justifyContent: 'center',
              marginBottom: 10,
            }}
          >
            <div style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              background: 'rgba(6, 182, 212, 0.22)',
              color: '#e0f2fe',
              fontSize: 12,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            >
              {userInitials}
            </div>
          </div>
        ) : (
          <div style={{ padding: '8px 12px', marginBottom: '10px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--sidebar-text)' }}>{user?.name}</div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', textTransform: 'capitalize' as const, marginTop: '1px' }}>{user?.role}</div>
          </div>
        )}
        <button
          type="button"
          onClick={toggleTheme}
          title={theme === 'light' ? 'Dark mode' : 'Light mode'}
          style={{
            width: '100%',
            padding: railMode ? '8px' : '8px 12px',
            marginBottom: '8px',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '8px',
            background: 'transparent',
            color: 'rgba(255,255,255,0.75)',
            fontSize: railMode ? '18px' : '12px',
            cursor: 'pointer',
            textAlign: 'center' as const,
          }}
        >
          {theme === 'light' ? '🌙' : '☀️'}
          {!railMode && (theme === 'light' ? ' Dark mode' : ' Light mode')}
        </button>
        <button
          type="button"
          onClick={logout}
          title="Sign out"
          style={{
            width: '100%',
            padding: railMode ? '8px' : '8px 12px',
            border: '1px solid rgba(6, 182, 212, 0.35)',
            borderRadius: '8px',
            background: 'transparent',
            color: '#06b6d4',
            fontSize: railMode ? '18px' : '13px',
            cursor: 'pointer',
            textAlign: 'center' as const,
          }}
        >
          {railMode ? '🚪' : 'Sign out'}
        </button>
      </div>
    </div>
  );

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        background: 'var(--bg-app)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        ...({ ['--sidebar-w']: `${sidebarW}px` } as CSSProperties),
      }}
    >
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <style>{`
        @media (min-width: 768px) {
          .desktop-sidebar {
            display: block !important;
            width: var(--sidebar-w, 220px) !important;
            min-width: var(--sidebar-w, 220px) !important;
            transition: width 0.2s ease, min-width 0.2s ease;
          }
          .mobile-header { display: none !important; }
          .mobile-overlay { display: none !important; }
          .main-content {
            margin-left: var(--sidebar-w, 220px) !important;
            transition: margin-left 0.2s ease;
          }
        }
        @media (max-width: 767px) {
          .desktop-sidebar { display: none !important; }
          .main-content { margin-left: 0 !important; }
        }
        .mobile-sidebar-drawer {
          position: fixed;
          top: 0; left: 0; bottom: 0;
          width: 220px;
          z-index: 200;
          transform: translateX(-100%);
          transition: transform 0.25s ease;
        }
        .mobile-sidebar-drawer.open {
          transform: translateX(0);
        }
      `}</style>

      <div style={{
        position: 'fixed' as const, top: 0, left: 0, bottom: 0,
        width: 'var(--sidebar-w)',
        minWidth: 'var(--sidebar-w)',
        zIndex: 10,
      }} className="desktop-sidebar">
        <Sidebar railMode={sidebarCollapsed} showRailToggle />
      </div>

      <div className="mobile-header" style={{
        position: 'fixed' as const, top: 0, left: 0, right: 0,
        height: '56px', background: 'var(--sidebar-bg)', display: 'flex',
        alignItems: 'center', padding: '0 16px', gap: '12px', zIndex: 100,
      }}>
        <button
          type="button"
          aria-label="Open menu"
          onClick={() => setMobileOpen(v => !v)}
          style={{ background: 'none', border: 'none', color: '#fff', fontSize: '20px', cursor: 'pointer', padding: '4px', lineHeight: 1 }}
        >
          ☰
        </button>
        <BrandMark size={28} />
        <PilotbaseWordmark height={15} />
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <InAppNotificationBell />
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          style={{
            padding: '6px 10px',
            fontSize: 12,
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.2)',
            background: 'rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.85)',
            cursor: 'pointer',
          }}
        >
          ⌘K
        </button>
        {notificationCount > 0 && (
          <button
            type="button"
            aria-label={`Open approval queue, ${notificationCount} pending`}
            onClick={() => handleNav('queue')}
            style={{
              position: 'relative' as const, cursor: 'pointer',
              background: 'none', border: 'none', padding: 4, lineHeight: 1,
            }}
          >
            <span style={{ fontSize: '20px' }}>🔔</span>
            <span style={{
              position: 'absolute' as const, top: '-4px', right: '-4px', background: '#ef4444', color: '#fff',
              borderRadius: '50%', width: '16px', height: '16px', fontSize: '9px', fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{notificationCount}</span>
          </button>
        )}
        </div>
      </div>

      {mobileOpen && (
        <div
          className="mobile-overlay"
          onClick={() => setMobileOpen(false)}
          onKeyDown={e => e.key === 'Escape' && setMobileOpen(false)}
          role="presentation"
          style={{ position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 150 }}
        />
      )}

      <div className={`mobile-sidebar-drawer${mobileOpen ? ' open' : ''}`}>
        <Sidebar railMode={false} showRailToggle={false} />
      </div>

      <div className="main-content" style={{ flex: 1, minHeight: '100vh', minWidth: 0 }}>
        <main style={{ padding: '28px 24px', background: 'var(--bg-app)', minHeight: '100vh' }} className="main-padding">
          <style>{`
            @media (max-width: 767px) {
              .main-padding { padding: 70px 16px 20px !important; }
            }
          `}</style>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' as const, marginBottom: 8 }}>
            <nav aria-label="Breadcrumb" style={{ fontSize: 12, color: 'var(--text-secondary, #64748b)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const }}>
              {crumbs.map((c, i) => (
                <span key={`${c.label}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {i > 0 && <span style={{ opacity: 0.5 }}>/</span>}
                  {c.path && i < crumbs.length - 1 ? (
                    <button
                      type="button"
                      onClick={() => navigate(c.path!)}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#0891b2', fontSize: 12, fontWeight: 500 }}
                    >
                      {c.label}
                    </button>
                  ) : (
                    <span style={{ color: 'var(--text-primary, #0f172a)', fontWeight: 600 }}>{c.label}</span>
                  )}
                </span>
              ))}
            </nav>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <InAppNotificationBell />
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              style={{
                padding: '8px 12px',
                fontSize: 12,
                borderRadius: 8,
                border: '1px solid var(--border-subtle, #e2e8f0)',
                background: 'var(--bg-panel, #fff)',
                color: 'var(--text-secondary, #475569)',
                cursor: 'pointer',
              }}
            >
              Search pages ⌘K
            </button>
            </div>
          </div>
          <AppContextBar />
          <Outlet />
        </main>
      </div>
    </div>
  );
}
