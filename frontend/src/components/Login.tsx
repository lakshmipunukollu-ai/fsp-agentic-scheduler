import { useState, FormEvent, useRef, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import BrandMark from './BrandMark';
import PilotbaseWordmark from './PilotbaseWordmark';
import './Login.css';

const DEMO_ACCOUNTS = [
  { role: 'Admin', email: 'admin@skyhigh.com', password: 'admin123', color: '#a78bfa', icon: '⚙', desc: 'Full dashboard + Students tab' },
  { role: 'Dispatcher', email: 'dispatcher@skyhigh.com', password: 'scheduler123', color: '#38bdf8', icon: '📋', desc: 'Approval queue + agent' },
  { role: 'Student — PPL (37h)', email: 'emma@skyhigh.com', password: 'student123', color: '#34d399', icon: '✈', desc: 'Private Pilot, 53% complete' },
  { role: 'Student — CPL (112h)', email: 'carlos@skyhigh.com', password: 'student123', color: '#fb923c', icon: '🎓', desc: 'Commercial Pilot, 45% complete' },
] as const;

/** Free stock footage (Pexels CDN). Override with VITE_LOGIN_HERO_VIDEO_URL — e.g. your own MP4 in /public. */
function heroVideoSources(): string[] {
  const custom = import.meta.env.VITE_LOGIN_HERO_VIDEO_URL as string | undefined;
  const defaults = [
    'https://videos.pexels.com/video-files/3129671/3129671-hd_1280_720_30fps.mp4',
    'https://videos.pexels.com/video-files/855029/855029-hd_1920_1080_30fps.mp4',
  ];
  const list = [custom, ...defaults].filter((u): u is string => typeof u === 'string' && u.trim().length > 0);
  return [...new Set(list)];
}

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('admin@skyhigh.com');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const videoSources = useMemo(() => heroVideoSources(), []);
  const [videoSrcIndex, setVideoSrcIndex] = useState(0);
  const [motionOk, setMotionOk] = useState(true);
  const [pointerFine, setPointerFine] = useState(true);
  const [mouse, setMouse] = useState({ px: 0.5, py: 0.5 });

  useEffect(() => {
    const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const mqCoarse = window.matchMedia('(pointer: coarse)');
    const sync = () => {
      setMotionOk(!mqReduce.matches);
      setPointerFine(!mqCoarse.matches);
    };
    sync();
    mqReduce.addEventListener('change', sync);
    mqCoarse.addEventListener('change', sync);
    return () => {
      mqReduce.removeEventListener('change', sync);
      mqCoarse.removeEventListener('change', sync);
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !motionOk || !pointerFine) return;

    const onMove = (e: MouseEvent) => {
      const r = root.getBoundingClientRect();
      const px = (e.clientX - r.left) / Math.max(r.width, 1);
      const py = (e.clientY - r.top) / Math.max(r.height, 1);
      setMouse({
        px: Math.min(1, Math.max(0, px)),
        py: Math.min(1, Math.max(0, py)),
      });
    };

    const onLeave = () => setMouse({ px: 0.5, py: 0.5 });

    root.addEventListener('mousemove', onMove);
    root.addEventListener('mouseleave', onLeave);
    return () => {
      root.removeEventListener('mousemove', onMove);
      root.removeEventListener('mouseleave', onLeave);
    };
  }, [motionOk, pointerFine]);

  const parallaxActive = motionOk && pointerFine;
  const vidX = parallaxActive ? (mouse.px - 0.5) * 32 : 0;
  const vidY = parallaxActive ? (mouse.py - 0.5) * 24 : 0;
  const tiltX = parallaxActive ? (mouse.py - 0.5) * -5.5 : 0;
  const tiltY = parallaxActive ? (mouse.px - 0.5) * 6.5 : 0;

  const videoAvailable = videoSrcIndex < videoSources.length;
  /** Skip video entirely when user prefers reduced motion (lighter + calmer). */
  const showVideoLayer = motionOk && videoAvailable;
  const cardTransform = parallaxActive
    ? `perspective(1100px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) translateZ(22px)`
    : undefined;
  const brandTransform = parallaxActive
    ? `perspective(1100px) rotateX(${tiltX * 0.4}deg) rotateY(${tiltY * 0.4}deg) translateZ(10px)`
    : undefined;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-root" ref={rootRef}>
      <div className={`login-bg${showVideoLayer ? ' login-bg--has-video' : ''}`} aria-hidden>
        {showVideoLayer && (
          <div className="login-video-stack">
            <div
              className="login-video-parallax"
              style={{ transform: `translate3d(${vidX}px, ${vidY}px, 0)` }}
            >
              <div className="login-video-zoom">
                <video
                  key={videoSrcIndex}
                  className="login-video-el"
                  src={videoSources[videoSrcIndex]}
                  autoPlay
                  muted
                  loop
                  playsInline
                  onError={() => setVideoSrcIndex(i => i + 1)}
                />
              </div>
            </div>
            <div className="login-video-scrim" />
          </div>
        )}
        <div className="login-bg-gradient" />
        <div className="login-orbs">
          <div className="login-orb" />
          <div className="login-orb" />
          <div className="login-orb" />
        </div>
        <div className="login-stars" />
        <div className="login-noise" />
        <div className="login-horizon" />
        <div className="login-vignette" />
      </div>

      <div className="login-content">
        <header className="login-brand" style={{ transform: brandTransform }}>
          <p className="login-kicker">
            <span className="login-kicker-dot" />
            Pilot Experience Platform
          </p>
          <h1 className="login-headline">
            Advance pilots through{' '}
            <span className="login-headline-accent">flight school and career</span>.
          </h1>
          <p className="login-lede">
            The revolutionary flight ops platform idea: keep student pilots on track with visibility
            beyond schedules — student progress, AI-powered flight ops, and pathways that connect
            training to what comes next. Safely progress students from first flight toward final
            destination. This demo echoes public themes from{' '}
            <a href="https://pilotbase.com/" target="_blank" rel="noopener noreferrer" className="login-inline-link">
              pilotbase.com
            </a>
            ; not affiliated.
          </p>
          <div className="login-stats login-stats--pillars" aria-label="Pilotbase public themes (paraphrased)">
            <div className="login-stat">
              <span className="login-stat-value">Student progress</span>
              <span className="login-stat-label">Training synced with advancement</span>
            </div>
            <div className="login-stat">
              <span className="login-stat-value">AI flight ops</span>
              <span className="login-stat-label">Scheduling &amp; insights</span>
            </div>
            <div className="login-stat">
              <span className="login-stat-value">Pathways</span>
              <span className="login-stat-label">Career &amp; outcomes</span>
            </div>
          </div>
        </header>

        <div className="login-card" style={{ transform: cardTransform }}>
          <div className="login-card-header">
            <div className="login-logo-wrap" aria-hidden>
              <BrandMark size={52} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
              <PilotbaseWordmark height={26} />
            </div>
            <h2 className="login-title">Agentic Scheduler</h2>
            <p className="login-subtitle">Sign in to your dispatcher or student workspace</p>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            {error && <div className="login-error">{error}</div>}
            <div className="login-field">
              <label htmlFor="login-email">Email</label>
              <input
                id="login-email"
                className="login-input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="username"
                required
              />
            </div>
            <div className="login-field">
              <label htmlFor="login-password">Password</label>
              <input
                id="login-password"
                className="login-input"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <button type="submit" className="login-submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="login-demo">
            <div className="login-demo-title">Demo accounts — tap to autofill</div>
            <div className="login-demo-grid">
              {DEMO_ACCOUNTS.map(account => (
                <button
                  key={account.email}
                  type="button"
                  className="login-demo-btn"
                  onClick={() => {
                    setEmail(account.email);
                    setPassword(account.password);
                  }}
                >
                  <span
                    className="login-demo-icon"
                    style={{ background: `${account.color}18`, color: account.color }}
                  >
                    {account.icon}
                  </span>
                  <div>
                    <div className="login-demo-role" style={{ color: account.color }}>
                      {account.role}
                    </div>
                    <div className="login-demo-email">{account.email}</div>
                    <div className="login-demo-desc">{account.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <footer className="login-footer">
        Mission language above is paraphrased from public pages at{' '}
        <a href="https://pilotbase.com/" target="_blank" rel="noopener noreferrer">
          pilotbase.com
        </a>
        . Background video:{' '}
        <a href="https://www.pexels.com/license/" target="_blank" rel="noopener noreferrer">
          Pexels
        </a>
        . Independent demo — not Pilotbase or FSP.
      </footer>
    </div>
  );
}
