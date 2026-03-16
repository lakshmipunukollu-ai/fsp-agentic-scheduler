import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: '⊞' },
  { id: 'queue', label: 'Approval Queue', icon: '✓' },
  { id: 'activity', label: 'Activity Feed', icon: '◎' },
  { id: 'students', label: 'Students', icon: '⚑' },
  { id: 'config', label: 'Policy Config', icon: '⚙' },
];

export default function Layout({
  children,
  activeTab,
  onTabChange,
  notificationCount = 0,
}: {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  notificationCount?: number;
}) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const d = theme === 'dark';

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: d ? '#0f172a' : '#f1f5f9', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Sidebar */}
      <div style={{
        width: '220px', flexShrink: 0,
        background: d ? '#020617' : '#0f172a',
        display: 'flex', flexDirection: 'column',
        position: 'fixed', top: 0, left: 0, bottom: 0,
        zIndex: 10,
      }}>
        {/* Logo */}
        <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ background: '#2563eb', color: '#fff', fontWeight: 800, fontSize: '13px', padding: '5px 9px', borderRadius: '7px', letterSpacing: '0.5px' }}>FSP</div>
            <div>
              <div style={{ color: '#f1f5f9', fontWeight: 700, fontSize: '14px', lineHeight: 1.2 }}>Agentic Scheduler</div>
            </div>
            {notificationCount > 0 && (
              <div
                onClick={() => onTabChange('queue')}
                style={{ marginLeft: 'auto', position: 'relative', cursor: 'pointer' }}
                title={`${notificationCount} pending`}
              >
                <span style={{ fontSize: '18px' }}>🔔</span>
                <span style={{
                  position: 'absolute', top: '-4px', right: '-4px',
                  background: '#ef4444', color: '#fff', borderRadius: '50%',
                  width: '15px', height: '15px', fontSize: '9px', fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{notificationCount}</span>
              </div>
            )}
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto' }}>
          {NAV_ITEMS.map(item => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  width: '100%', padding: '10px 12px', border: 'none',
                  borderRadius: '8px', cursor: 'pointer', textAlign: 'left',
                  marginBottom: '2px',
                  background: isActive ? 'rgba(37,99,235,0.2)' : 'transparent',
                  color: isActive ? '#60a5fa' : '#94a3b8',
                  fontSize: '13px', fontWeight: isActive ? 600 : 400,
                  transition: 'all .15s',
                }}
              >
                <span style={{ fontSize: '14px', width: '18px', textAlign: 'center', opacity: isActive ? 1 : 0.6 }}>{item.icon}</span>
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Bottom: theme toggle + user + sign out */}
        <div style={{ padding: '12px 10px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {/* Theme toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', color: '#64748b' }}>{d ? '🌙 Dark' : '☀ Light'}</span>
            <div
              onClick={toggleTheme}
              style={{
                width: '36px', height: '20px', borderRadius: '10px', cursor: 'pointer',
                background: d ? '#2563eb' : '#475569',
                position: 'relative', transition: 'background .2s',
              }}
            >
              <div style={{
                position: 'absolute', top: '3px',
                left: d ? '17px' : '3px',
                width: '14px', height: '14px', borderRadius: '50%',
                background: '#fff', transition: 'left .2s',
              }} />
            </div>
          </div>

          {/* User info */}
          <div style={{ padding: '8px 12px', marginBottom: '6px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0' }}>{user?.name}</div>
            <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'capitalize', marginTop: '1px' }}>{user?.role}</div>
          </div>

          {/* Sign out — always visible */}
          <button
            onClick={logout}
            style={{
              width: '100%', padding: '9px 12px', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '8px', background: 'rgba(255,255,255,0.04)',
              color: '#94a3b8', fontSize: '13px', cursor: 'pointer',
              textAlign: 'center', transition: 'all .15s',
            }}
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Main content */}
      <div style={{ marginLeft: '220px', flex: 1, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <main style={{
          flex: 1, padding: '32px 36px',
          background: d ? '#0f172a' : '#f1f5f9',
          color: d ? '#e2e8f0' : '#0f172a',
          minHeight: '100vh',
        }}>
          {children}
        </main>
      </div>
    </div>
  );
}
