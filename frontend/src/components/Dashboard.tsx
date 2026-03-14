import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { DashboardStats } from '../types';

const TYPE_LABELS: Record<string, string> = {
  waitlist: 'Waitlist Fill',
  reschedule: 'Reschedule',
  discovery: 'Discovery Flight',
  next_lesson: 'Next Lesson',
};

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const data = await api.getDashboardStats();
      setStats(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div style={styles.loading}>Loading dashboard...</div>;
  if (error) return <div style={styles.error}>{error}</div>;
  if (!stats) return null;

  const statCards = [
    { label: 'Pending Suggestions', value: stats.pending, color: '#f59e0b', bg: '#fffbeb' },
    { label: 'Approved Today', value: stats.approvedToday, color: '#10b981', bg: '#ecfdf5' },
    { label: 'Declined Today', value: stats.declinedToday, color: '#ef4444', bg: '#fef2f2' },
    { label: 'Avg Response (hrs)', value: stats.avgResponseTime.toFixed(1), color: '#6366f1', bg: '#eef2ff' },
  ];

  return (
    <div>
      <h1 style={styles.title}>Dashboard</h1>
      <p style={styles.subtitle}>Overview of scheduling suggestions and activity</p>

      <div style={styles.grid}>
        {statCards.map(card => (
          <div key={card.label} style={{ ...styles.card, borderLeft: `4px solid ${card.color}` }}>
            <div style={{ ...styles.cardValue, color: card.color }}>{card.value}</div>
            <div style={styles.cardLabel}>{card.label}</div>
          </div>
        ))}
      </div>

      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Suggestions by Type</h2>
        <div style={styles.typeGrid}>
          {Object.entries(stats.suggestionsByType).map(([type, count]) => (
            <div key={type} style={styles.typeCard}>
              <div style={styles.typeCount}>{count}</div>
              <div style={styles.typeLabel}>{TYPE_LABELS[type] || type}</div>
            </div>
          ))}
          {Object.keys(stats.suggestionsByType).length === 0 && (
            <p style={styles.empty}>No suggestions yet</p>
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  title: {
    fontSize: '28px',
    fontWeight: 700,
    color: '#0f172a',
    margin: '0 0 4px 0',
  },
  subtitle: {
    color: '#64748b',
    margin: '0 0 28px 0',
    fontSize: '15px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '16px',
    marginBottom: '32px',
  },
  card: {
    background: '#fff',
    borderRadius: '10px',
    padding: '20px 24px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  cardValue: {
    fontSize: '32px',
    fontWeight: 700,
    marginBottom: '4px',
  },
  cardLabel: {
    fontSize: '13px',
    color: '#64748b',
    fontWeight: 500,
  },
  section: {
    background: '#fff',
    borderRadius: '10px',
    padding: '24px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#0f172a',
    margin: '0 0 16px 0',
  },
  typeGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '12px',
  },
  typeCard: {
    background: '#f8fafc',
    borderRadius: '8px',
    padding: '16px',
    textAlign: 'center' as const,
  },
  typeCount: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#2563eb',
  },
  typeLabel: {
    fontSize: '12px',
    color: '#64748b',
    marginTop: '4px',
  },
  loading: { color: '#64748b', padding: '40px', textAlign: 'center' as const },
  error: { color: '#dc2626', padding: '40px', textAlign: 'center' as const },
  empty: { color: '#94a3b8', gridColumn: '1 / -1', textAlign: 'center' as const },
};
