import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { OperatorConfig, FeatureFlags } from '../types';

export default function PolicyConfig() {
  const { user } = useAuth();
  const [config, setConfig] = useState<OperatorConfig | null>(null);
  const [flags, setFlags] = useState<FeatureFlags | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState('');
  const [weights, setWeights] = useState({ daysSinceLastFlight: 30, daysUntilNextFlight: 20, totalFlightHours: 10, waitlistPosition: 40 });

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api.getOperatorConfig(user.operatorId),
      api.getFeatureFlags(user.operatorId),
    ]).then(([c, f]) => {
      const cfg = c.data as OperatorConfig;
      setConfig(cfg);
      setWeights({
        daysSinceLastFlight: Math.round((cfg.priorityWeights.daysSinceLastFlight || 0.3) * 100),
        daysUntilNextFlight: Math.round((cfg.priorityWeights.daysUntilNextFlight || 0.2) * 100),
        totalFlightHours: Math.round((cfg.priorityWeights.totalFlightHours || 0.1) * 100),
        waitlistPosition: Math.round((cfg.priorityWeights.waitlistPosition || 0.4) * 100),
      });
      setFlags(f.data as FeatureFlags);
    }).finally(() => setLoading(false));
  }, [user]);

  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);

  const updateWeight = (key: keyof typeof weights, val: number) => {
    setWeights(prev => ({ ...prev, [key]: val }));
  };

  const handleSaveWeights = async () => {
    if (!user || !config) return;
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    await api.updateOperatorConfig(user.operatorId, {
      ...config,
      priorityWeights: {
        daysSinceLastFlight: weights.daysSinceLastFlight / total,
        daysUntilNextFlight: weights.daysUntilNextFlight / total,
        totalFlightHours: weights.totalFlightHours / total,
        waitlistPosition: weights.waitlistPosition / total,
      },
    });
    setSaved('weights');
    setTimeout(() => setSaved(''), 2000);
  };

  const handleSaveSettings = async () => {
    if (!user || !config) return;
    await api.updateOperatorConfig(user.operatorId, config);
    setSaved('settings');
    setTimeout(() => setSaved(''), 2000);
  };

  const handleSaveFlags = async () => {
    if (!user || !flags) return;
    await api.updateFeatureFlags(user.operatorId, flags);
    setSaved('flags');
    setTimeout(() => setSaved(''), 2000);
  };

  if (loading) return <div style={s.loading}>Loading configuration...</div>;

  const total = totalWeight;

  return (
    <div>
      <h1 style={s.title}>Policy Configuration</h1>
      <p style={s.subtitle}>Configure scheduling policies and agent behavior</p>

      {/* Priority Weights */}
      <div style={s.card}>
        <h2 style={s.cardTitle}>Priority Weights</h2>
        <p style={s.cardSub}>Configure how candidates are scored when filling schedule openings. Sliders auto-normalize to 1.0.</p>

        {[
          { key: 'totalFlightHours' as const, label: 'Total Flight Hours' },
          { key: 'waitlistPosition' as const, label: 'Waitlist Position' },
          { key: 'daysSinceLastFlight' as const, label: 'Days Since Last Flight' },
          { key: 'daysUntilNextFlight' as const, label: 'Days Until Next Flight' },
        ].map(({ key, label }) => {
          const normalizedVal = (weights[key] / total).toFixed(2);
          return (
            <div key={key} style={s.weightRow}>
              <span style={s.weightLabel}>{label}</span>
              <input type="range" min={1} max={100} value={weights[key]}
                onChange={e => updateWeight(key, parseInt(e.target.value))}
                style={{ flex: 1, accentColor: '#2563eb' }} />
              <span style={s.weightVal}>{normalizedVal}</span>
            </div>
          );
        })}

        <div style={s.totalRow}>
          Total: <span style={s.totalOk}>1.00</span>
          <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '8px' }}>auto-normalized</span>
        </div>

        <button onClick={handleSaveWeights} style={s.saveBtn}>
          {saved === 'weights' ? '✓ Saved!' : 'Save Weights'}
        </button>
      </div>

      {/* General Settings */}
      {config && (
        <div style={s.card}>
          <h2 style={s.cardTitle}>General Settings</h2>
          <div style={s.settingsGrid}>
            <div>
              <div style={s.settingLabel}>Suggestions Per Opening</div>
              <input style={s.settingInput} type="number" value={config.suggestionsPerOpening}
                onChange={e => setConfig({ ...config, suggestionsPerOpening: parseInt(e.target.value) })} />
            </div>
            <div>
              <div style={s.settingLabel}>Search Window (days)</div>
              <input style={s.settingInput} type="number" value={config.searchWindowDays}
                onChange={e => setConfig({ ...config, searchWindowDays: parseInt(e.target.value) })} />
            </div>
            <div>
              <div style={s.settingLabel}>Expiration (hours)</div>
              <input style={s.settingInput} type="number" value={config.expirationHours}
                onChange={e => setConfig({ ...config, expirationHours: parseInt(e.target.value) })} />
            </div>
          </div>
          <button onClick={handleSaveSettings} style={s.saveBtn}>
            {saved === 'settings' ? '✓ Saved!' : 'Save Settings'}
          </button>
        </div>
      )}

      {/* Feature Flags */}
      {flags && (
        <div style={s.card}>
          <h2 style={s.cardTitle}>Feature Flags</h2>
          <p style={s.cardSub}>Enable or disable agent capabilities per tenant. Changes take effect immediately.</p>

          {[
            { key: 'waitlist_automation' as const, label: 'Waitlist Automation', desc: 'Automatically generate suggestions when schedule openings are detected' },
            { key: 'reschedule_on_cancellation' as const, label: 'Reschedule On Cancellation', desc: 'Suggest alternative times when a student cancels' },
            { key: 'discovery_flight_booking' as const, label: 'Discovery Flight Booking', desc: 'Auto-suggest bookings for new discovery flight requests' },
            { key: 'auto_approve_low_risk' as const, label: 'Auto Approve Low Risk', desc: 'Phase 2: auto-approve suggestions with high confidence scores' },
          ].map(({ key, label, desc }) => (
            <div key={key} style={s.flagRow}>
              <div style={{ flex: 1 }}>
                <div style={s.flagTitle}>{label}</div>
                <div style={s.flagDesc}>{desc}</div>
              </div>
              <div
                onClick={() => setFlags({ ...flags, [key]: !flags[key] })}
                style={{ ...s.toggle, background: flags[key] ? '#10b981' : '#d1d5db' }}
              >
                <div style={{ ...s.toggleThumb, left: flags[key] ? '19px' : '3px' }} />
              </div>
            </div>
          ))}

          <button onClick={handleSaveFlags} style={s.saveBtn}>
            {saved === 'flags' ? '✓ Saved!' : 'Save Feature Flags'}
          </button>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  loading: { color: '#64748b', padding: '40px', textAlign: 'center' as const },
  title: { fontSize: '26px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px 0' },
  subtitle: { color: '#64748b', margin: '0 0 24px 0', fontSize: '14px' },
  card: { background: '#fff', borderRadius: '12px', padding: '22px 26px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: '16px' },
  cardTitle: { fontSize: '16px', fontWeight: 600, color: '#0f172a', margin: '0 0 6px 0' },
  cardSub: { fontSize: '13px', color: '#64748b', margin: '0 0 20px 0' },
  weightRow: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' },
  weightLabel: { fontSize: '13px', color: '#475569', width: '180px', flexShrink: 0 },
  weightVal: { fontSize: '14px', fontWeight: 700, color: '#2563eb', width: '40px', textAlign: 'right' as const },
  totalRow: { fontSize: '13px', color: '#64748b', marginBottom: '16px', marginTop: '4px' },
  totalOk: { color: '#10b981', fontWeight: 700 },
  settingsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '16px' },
  settingLabel: { fontSize: '12px', color: '#64748b', marginBottom: '6px', fontWeight: 500 },
  settingInput: { width: '100%', padding: '8px 12px', border: '0.5px solid #d1d5db', borderRadius: '8px', fontSize: '14px', color: '#0f172a', background: '#fff' },
  flagRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '0.5px solid #f1f5f9' },
  flagTitle: { fontSize: '14px', fontWeight: 600, color: '#0f172a', marginBottom: '3px' },
  flagDesc: { fontSize: '12px', color: '#64748b' },
  toggle: { width: '40px', height: '24px', borderRadius: '12px', cursor: 'pointer', position: 'relative' as const, flexShrink: 0, border: 'none', transition: 'background 0.2s' },
  toggleThumb: { width: '18px', height: '18px', background: '#fff', borderRadius: '50%', position: 'absolute' as const, top: '3px', transition: 'left 0.2s' },
  saveBtn: { background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 22px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', marginTop: '6px', transition: 'background 0.2s' },
};
