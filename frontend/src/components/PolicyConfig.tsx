import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { OperatorConfig, FeatureFlags } from '../types';

export default function PolicyConfig() {
  const { user } = useAuth();
  const [config, setConfig] = useState<OperatorConfig | null>(null);
  const [flags, setFlags] = useState<FeatureFlags | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    if (!user) return;
    try {
      const [configRes, flagsRes] = await Promise.all([
        api.getOperatorConfig(user.operatorId),
        api.getFeatureFlags(user.operatorId),
      ]);
      setConfig(configRes.data as OperatorConfig);
      setFlags(flagsRes.data as FeatureFlags);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    if (!user || !config) return;
    setSaving(true);
    setMessage('');
    try {
      await api.updateOperatorConfig(user.operatorId, config);
      setMessage('Configuration saved successfully');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const saveFlags = async () => {
    if (!user || !flags) return;
    setSaving(true);
    setMessage('');
    try {
      await api.updateFeatureFlags(user.operatorId, flags);
      setMessage('Feature flags saved successfully');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const updateWeight = (key: keyof OperatorConfig['priorityWeights'], value: number) => {
    if (!config) return;
    setConfig({
      ...config,
      priorityWeights: { ...config.priorityWeights, [key]: value },
    });
  };

  if (loading) return <div style={styles.loading}>Loading configuration...</div>;
  if (error) return <div style={styles.error}>{error}</div>;
  if (!config || !flags) return null;

  return (
    <div>
      <h1 style={styles.title}>Policy Configuration</h1>
      <p style={styles.subtitle}>Configure scheduling policies and agent behavior</p>

      {message && <div style={styles.success}>{message}</div>}
      {!isAdmin && (
        <div style={styles.notice}>View-only mode. Admin role required to modify settings.</div>
      )}

      <div style={styles.sections}>
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Priority Weights</h2>
          <p style={styles.sectionDesc}>
            Configure how candidates are scored when filling schedule openings.
            Weights should sum to 1.0 for normalized scoring.
          </p>
          <div style={styles.weightGrid}>
            {Object.entries(config.priorityWeights).map(([key, value]) => (
              <div key={key} style={styles.weightItem}>
                <label style={styles.weightLabel}>
                  {key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}
                </label>
                <div style={styles.weightControl}>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={value}
                    onChange={e => updateWeight(key as keyof OperatorConfig['priorityWeights'], parseFloat(e.target.value))}
                    disabled={!isAdmin}
                    style={styles.slider}
                  />
                  <span style={styles.weightValue}>{value.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
          <div style={styles.weightSum}>
            Total: {Object.values(config.priorityWeights).reduce((a, b) => a + b, 0).toFixed(2)}
            {Math.abs(Object.values(config.priorityWeights).reduce((a, b) => a + b, 0) - 1.0) > 0.01 && (
              <span style={styles.warning}> (should be 1.0)</span>
            )}
          </div>
          {isAdmin && (
            <button onClick={saveConfig} disabled={saving} style={styles.saveBtn}>
              {saving ? 'Saving...' : 'Save Weights'}
            </button>
          )}
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>General Settings</h2>
          <div style={styles.settingsGrid}>
            <div style={styles.settingItem}>
              <label style={styles.settingLabel}>Suggestions Per Opening</label>
              <input
                type="number"
                min="1"
                max="10"
                value={config.suggestionsPerOpening}
                onChange={e => setConfig({ ...config, suggestionsPerOpening: parseInt(e.target.value) || 3 })}
                disabled={!isAdmin}
                style={styles.numberInput}
              />
            </div>
            <div style={styles.settingItem}>
              <label style={styles.settingLabel}>Search Window (days)</label>
              <input
                type="number"
                min="1"
                max="30"
                value={config.searchWindowDays}
                onChange={e => setConfig({ ...config, searchWindowDays: parseInt(e.target.value) || 7 })}
                disabled={!isAdmin}
                style={styles.numberInput}
              />
            </div>
            <div style={styles.settingItem}>
              <label style={styles.settingLabel}>Expiration (hours)</label>
              <input
                type="number"
                min="1"
                max="168"
                value={config.expirationHours}
                onChange={e => setConfig({ ...config, expirationHours: parseInt(e.target.value) || 24 })}
                disabled={!isAdmin}
                style={styles.numberInput}
              />
            </div>
          </div>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Feature Flags</h2>
          <p style={styles.sectionDesc}>
            Enable or disable agent capabilities per tenant. Changes take effect immediately.
          </p>
          <div style={styles.flagList}>
            {Object.entries(flags).map(([key, enabled]) => (
              <div key={key} style={styles.flagItem}>
                <div>
                  <div style={styles.flagName}>
                    {key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </div>
                  <div style={styles.flagDesc}>{getFlagDescription(key)}</div>
                </div>
                <label style={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={e => setFlags({ ...flags, [key]: e.target.checked })}
                    disabled={!isAdmin}
                    style={styles.toggleInput}
                  />
                  <span style={{
                    ...styles.toggleSlider,
                    background: enabled ? '#10b981' : '#d1d5db',
                  }} />
                </label>
              </div>
            ))}
          </div>
          {isAdmin && (
            <button onClick={saveFlags} disabled={saving} style={styles.saveBtn}>
              {saving ? 'Saving...' : 'Save Feature Flags'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function getFlagDescription(key: string): string {
  const descriptions: Record<string, string> = {
    waitlist_automation: 'Automatically generate suggestions when schedule openings are detected',
    reschedule_on_cancellation: 'Suggest alternative times when a student cancels',
    discovery_flight_booking: 'Auto-suggest bookings for new discovery flight requests',
    auto_approve_low_risk: 'Phase 2: Auto-approve suggestions with high confidence scores',
  };
  return descriptions[key] || '';
}

const styles: Record<string, React.CSSProperties> = {
  title: { fontSize: '28px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px 0' },
  subtitle: { color: '#64748b', margin: '0 0 28px 0', fontSize: '15px' },
  sections: { display: 'flex', flexDirection: 'column' as const, gap: '24px' },
  section: { background: '#fff', borderRadius: '10px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' },
  sectionTitle: { fontSize: '18px', fontWeight: 600, color: '#0f172a', margin: '0 0 8px 0' },
  sectionDesc: { fontSize: '13px', color: '#64748b', margin: '0 0 20px 0', lineHeight: '1.5' },
  weightGrid: { display: 'flex', flexDirection: 'column' as const, gap: '16px' },
  weightItem: {},
  weightLabel: { display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' },
  weightControl: { display: 'flex', alignItems: 'center', gap: '12px' },
  slider: { flex: 1, accentColor: '#2563eb' },
  weightValue: { fontSize: '14px', fontWeight: 600, color: '#2563eb', width: '40px', textAlign: 'right' as const },
  weightSum: { marginTop: '12px', fontSize: '13px', color: '#475569', fontWeight: 500 },
  warning: { color: '#dc2626' },
  settingsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' },
  settingItem: {},
  settingLabel: { display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' },
  numberInput: { width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' as const },
  flagList: { display: 'flex', flexDirection: 'column' as const, gap: '12px' },
  flagItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#f8fafc', borderRadius: '8px' },
  flagName: { fontWeight: 600, fontSize: '14px', color: '#0f172a' },
  flagDesc: { fontSize: '12px', color: '#64748b', marginTop: '2px' },
  toggle: { position: 'relative' as const, display: 'inline-block', width: '44px', height: '24px', flexShrink: 0 },
  toggleInput: { opacity: 0, width: 0, height: 0 },
  toggleSlider: { position: 'absolute' as const, cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, borderRadius: '24px', transition: '0.3s' },
  saveBtn: { marginTop: '16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 24px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' },
  loading: { color: '#64748b', padding: '40px', textAlign: 'center' as const },
  error: { color: '#dc2626', padding: '16px', background: '#fef2f2', borderRadius: '8px', marginBottom: '16px' },
  success: { color: '#059669', padding: '12px 16px', background: '#ecfdf5', borderRadius: '8px', marginBottom: '16px', fontSize: '14px' },
  notice: { color: '#d97706', padding: '12px 16px', background: '#fffbeb', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' },
};
