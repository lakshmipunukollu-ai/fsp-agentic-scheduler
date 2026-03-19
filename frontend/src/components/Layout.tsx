import { useAuth } from '../context/AuthContext';

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

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f1f5f9', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Sidebar */}
      <div style={{
        width: '210px', flexShrink: 0,
        background: '#1e3a5f',
        display: 'flex', flexDirection: 'column' as const,
        position: 'fixed' as const, top: 0, left: 0, bottom: 0,
        zIndex: 10,
      }}>
        {/* Logo */}
        <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ background: '#2563eb', color: '#fff', fontWeight: 800, fontSize: '13px', padding: '5px 9px', borderRadius: '6px', letterSpacing: '0.5px' }}>PB</div>
            <div>
              <div style={{ color: '#f1f5f9', fontWeight: 700, fontSize: '13px', lineHeight: 1.2 }}>Agentic Scheduler</div>
              <div style={{ color: '#93c5fd', fontSize: '10px', marginTop: '2px' }}>Pilotbase</div>
            </div>
            {notificationCount > 0 && (
              <div onClick={() => onTabChange('queue')} style={{ marginLeft: 'auto', position: 'relative' as const, cursor: 'pointer' }}>
                <span style={{ fontSize: '16px' }}>🔔</span>
                <span style={{ position: 'absolute' as const, top: '-4px', right: '-4px', background: '#ef4444', color: '#fff', borderRadius: '50%', width: '14px', height: '14px', fontSize: '9px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{notificationCount}</span>
              </div>
            )}
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '10px 8px', overflowY: 'auto' as const }}>
          {NAV_ITEMS.map(item => {
            const isActive = activeTab === item.id;
            return (
              <button key={item.id} onClick={() => onTabChange(item.id)} style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                width: '100%', padding: '9px 12px', border: 'none',
                borderRadius: '6px', cursor: 'pointer', textAlign: 'left' as const,
                marginBottom: '2px',
                background: isActive ? 'rgba(255,255,255,0.12)' : 'transparent',
                color: isActive ? '#fff' : '#93c5fd',
                fontSize: '13px', fontWeight: isActive ? 600 : 400,
                transition: 'all .15s',
                borderLeft: isActive ? '3px solid #60a5fa' : '3px solid transparent',
              }}>
                <span style={{ fontSize: '13px', width: '16px', textAlign: 'center' as const }}>{item.icon}</span>
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Bottom */}
        <div style={{ padding: '12px 10px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ padding: '8px 12px', marginBottom: '8px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9' }}>{user?.name}</div>
            <div style={{ fontSize: '11px', color: '#93c5fd', textTransform: 'capitalize' as const, marginTop: '1px' }}>{user?.role}</div>
          </div>
          <button onClick={logout} style={{
            width: '100%', padding: '8px 12px',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '6px', background: 'transparent',
            color: '#93c5fd', fontSize: '13px', cursor: 'pointer',
            textAlign: 'center' as const,
          }}>
            Sign Out
          </button>
        </div>
      </div>

      {/* Main content */}
      <div style={{ marginLeft: '210px', flex: 1, minHeight: '100vh' }}>
        <main style={{ padding: '28px 32px', background: '#f1f5f9', minHeight: '100vh' }}>
          {children}
        </main>
      </div>
    </div>
  );
}
