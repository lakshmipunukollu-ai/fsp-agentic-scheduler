export default function PageSkeleton() {
  return (
    <div style={{ padding: '8px 0', animation: 'opacityPulse 1.2s ease-in-out infinite' }}>
      <style>{`
        @keyframes opacityPulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 0.85; }
        }
      `}</style>
      <div
        style={{
          height: 22,
          width: '40%',
          maxWidth: 280,
          borderRadius: 6,
          background: 'var(--skeleton-bg, #e2e8f0)',
          marginBottom: 12,
        }}
      />
      <div
        style={{
          height: 14,
          width: '65%',
          maxWidth: 420,
          borderRadius: 6,
          background: 'var(--skeleton-bg, #e2e8f0)',
          marginBottom: 24,
        }}
      />
      <div
        style={{
          height: 120,
          borderRadius: 10,
          background: 'var(--skeleton-bg, #e2e8f0)',
        }}
      />
    </div>
  );
}
