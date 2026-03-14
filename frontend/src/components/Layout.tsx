import { ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';

interface LayoutProps {
  children: ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: '\u2302' },
  { id: 'queue', label: 'Approval Queue', icon: '\u2611' },
  { id: 'activity', label: 'Activity Feed', icon: '\u23F1' },
  { id: 'config', label: 'Policy Config', icon: '\u2699' },
];

export default function Layout({ children, activeTab, onTabChange }: LayoutProps) {
  const { user, logout } = useAuth();

  return (
    <div style={styles.wrapper}>
      <nav style={styles.sidebar}>
        <div style={styles.brand}>
          <div style={styles.logo}>FSP</div>
          <span style={styles.brandText}>Agentic Scheduler</span>
        </div>
        <div style={styles.nav}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              style={{
                ...styles.navItem,
                ...(activeTab === tab.id ? styles.navItemActive : {}),
              }}
            >
              <span style={styles.navIcon}>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
        <div style={styles.userSection}>
          <div style={styles.userInfo}>
            <div style={styles.userName}>{user?.name}</div>
            <div style={styles.userRole}>{user?.role}</div>
          </div>
          <button onClick={logout} style={styles.logoutBtn}>Sign Out</button>
        </div>
      </nav>
      <main style={styles.main}>
        {children}
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    minHeight: '100vh',
    background: '#f1f5f9',
  },
  sidebar: {
    width: '260px',
    background: '#0f172a',
    color: '#fff',
    display: 'flex',
    flexDirection: 'column',
    padding: '0',
    flexShrink: 0,
  },
  brand: {
    padding: '24px 20px',
    borderBottom: '1px solid #1e293b',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  logo: {
    background: '#2563eb',
    color: '#fff',
    fontWeight: 800,
    fontSize: '14px',
    padding: '6px 10px',
    borderRadius: '6px',
    letterSpacing: '1px',
  },
  brandText: {
    fontWeight: 600,
    fontSize: '15px',
    color: '#e2e8f0',
  },
  nav: {
    flex: 1,
    padding: '16px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 14px',
    border: 'none',
    background: 'transparent',
    color: '#94a3b8',
    fontSize: '14px',
    cursor: 'pointer',
    borderRadius: '8px',
    textAlign: 'left' as const,
    fontWeight: 500,
  },
  navItemActive: {
    background: '#1e293b',
    color: '#fff',
  },
  navIcon: {
    fontSize: '18px',
    width: '24px',
    textAlign: 'center' as const,
  },
  userSection: {
    padding: '16px 20px',
    borderTop: '1px solid #1e293b',
  },
  userInfo: {
    marginBottom: '12px',
  },
  userName: {
    fontWeight: 600,
    fontSize: '14px',
    color: '#e2e8f0',
  },
  userRole: {
    fontSize: '12px',
    color: '#64748b',
    textTransform: 'capitalize' as const,
  },
  logoutBtn: {
    width: '100%',
    padding: '8px',
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '6px',
    color: '#94a3b8',
    fontSize: '13px',
    cursor: 'pointer',
  },
  main: {
    flex: 1,
    padding: '32px',
    overflowY: 'auto' as const,
  },
};
