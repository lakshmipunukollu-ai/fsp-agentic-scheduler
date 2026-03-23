// Railway's network lacks IPv6 connectivity — force all DNS lookups to return IPv4 first.
// This must be at the very top before any network calls (SMTP, Anthropic, etc.).
import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');

import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { config } from './config';
import { errorHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth';
import suggestionRoutes from './routes/suggestions';
import operatorRoutes from './routes/operators';
import auditLogRoutes from './routes/auditLog';
import dashboardRoutes from './routes/dashboard';
import agentRoutes from './routes/agent';
import studentRoutes from './routes/students';
import webhookRoutes from './routes/webhooks';
import eventsRoutes from './routes/events';
import insightsRoutes from './routes/insights';
import analysisRoutes from './routes/analysis';
import meRoutes from './routes/me';

// When running node dist/index.js, __dirname is backend/dist; public is backend/public
const publicDir = path.join(__dirname, '..', 'public');

export const app = express();

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      config.corsOrigin,
      'https://fsp-frontend-production.up.railway.app',
      'http://localhost:5001',
      'http://localhost:3000',
    ].filter(Boolean);
    if (!origin || allowed.some(o => origin.startsWith(o as string))) {
      callback(null, true);
    } else {
      callback(null, true); // allow all for now — tighten in production
    }
  },
  credentials: true,
}));
app.use(express.json());

// Health check - no auth required
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/suggestions', suggestionRoutes);
app.use('/api/operators', operatorRoutes);
app.use('/api/audit-log', auditLogRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/insights', insightsRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/me', meRoutes);

// API documentation — rendered as clean HTML
app.get('/docs', (_req, res) => {
  const endpoints = [
    { method: 'GET',   path: '/health',                                    auth: false, roles: '',                      description: 'Health check' },
    { method: 'POST',  path: '/api/auth/login',                            auth: false, roles: '',                      description: 'Login — returns JWT' },
    { method: 'GET',   path: '/api/suggestions',                           auth: true,  roles: 'all',                   description: 'List suggestions (filter by status, type)' },
    { method: 'POST',  path: '/api/suggestions/:id/approve',               auth: true,  roles: 'admin, scheduler',      description: 'Approve a suggestion' },
    { method: 'POST',  path: '/api/suggestions/:id/decline',               auth: true,  roles: 'admin, scheduler',      description: 'Decline a suggestion' },
    { method: 'POST',  path: '/api/suggestions/bulk-approve-high-confidence', auth: true, roles: 'admin, scheduler',   description: 'Bulk approve all high-confidence pending suggestions' },
    { method: 'POST',  path: '/api/agent/run',                             auth: true,  roles: 'admin, scheduler',      description: 'Run scheduling agent — 30s cooldown per operator' },
    { method: 'GET',   path: '/api/dashboard',                             auth: true,  roles: 'all',                   description: 'Dashboard stats and KPIs' },
    { method: 'GET',   path: '/api/insights',                              auth: true,  roles: 'all',                   description: 'Agent effectiveness analytics' },
    { method: 'GET',   path: '/api/analysis/graduation-risk',              auth: true,  roles: 'all',                   description: 'All students: pace, projected graduation hours, extra cost' },
    { method: 'GET',   path: '/api/analysis/revenue-breakdown',            auth: true,  roles: 'all',                   description: 'Revenue opportunity, recovered, at-risk, projected loss' },
    { method: 'GET',   path: '/api/analysis/cancellation-stats',           auth: true,  roles: 'all',                   description: 'Cancellation recovery stats vs manual baseline (12%)' },
    { method: 'POST',  path: '/api/analysis/simulate-cancellation',        auth: true,  roles: 'admin, scheduler',      description: 'Simulate a cancellation event — agent fills the slot via SSE' },
    { method: 'GET',   path: '/api/analysis/at-risk-students',             auth: true,  roles: 'all',                   description: 'Students idle 7+ days — live from scheduled_lessons' },
    { method: 'POST',  path: '/api/analysis/nudge-student',                auth: true,  roles: 'admin, scheduler',      description: 'Generate an at_risk_nudge suggestion for a student' },
    { method: 'GET',   path: '/api/analysis/agent-narrative',              auth: true,  roles: 'all',                   description: 'Claude-written daily summary — cached 1h per operator' },
    { method: 'GET',   path: '/api/analysis/frequency-leaderboard',        auth: true,  roles: 'all',                   description: 'Students ranked by flights/week — live from scheduled_lessons' },
    { method: 'GET',   path: '/api/analysis/last-agent-run',               auth: true,  roles: 'all',                   description: 'Timestamp of last agent run for status chip' },
    { method: 'GET',   path: '/api/analysis/operator-school-type',         auth: true,  roles: 'all',                   description: 'Get current school type (part_141 / part_61)' },
    { method: 'PATCH', path: '/api/analysis/operator-school-type',         auth: true,  roles: 'admin',                 description: 'Switch school type mode' },
    { method: 'GET',   path: '/api/events/stream',                         auth: true,  roles: 'all',                   description: 'Server-Sent Events stream for real-time queue updates' },
    { method: 'POST',  path: '/api/webhooks/fsp',                          auth: false, roles: '',                      description: 'PILOTBASE webhook receiver (HMAC-verified)' },
    { method: 'GET',   path: '/api/audit-log/today-summary',               auth: true,  roles: 'all',                   description: 'Event counts for the current local day (all pages)' },
    { method: 'GET',   path: '/api/audit-log',                             auth: true,  roles: 'all',                   description: 'Immutable audit trail of all agent and dispatcher actions' },
    { method: 'GET',   path: '/api/operators/config',                      auth: true,  roles: 'all',                   description: 'Operator config and feature flags' },
    { method: 'PUT',   path: '/api/operators/config',                      auth: true,  roles: 'admin',                 description: 'Update operator config' },
    { method: 'POST',  path: '/api/students/lesson-requests/:requestId/submit', auth: true, roles: 'student',          description: 'Finalize edited AI schedule — updates queue + notifies admin & dispatchers' },
    { method: 'PATCH', path: '/api/students/lesson-requests/:requestId/draft', auth: true, roles: 'student',          description: 'Save pending schedule edits — audit trail + syncs approval queue payload' },
    { method: 'POST',  path: '/api/students/lessons/:lessonId/cancel',            auth: true, roles: 'student',          description: 'Cancel a confirmed lesson — notifies staff + surfaces fill in approval queue' },
    { method: 'GET',   path: '/api/students/profile',                      auth: true,  roles: 'student',               description: 'Student profile and flight history' },
    { method: 'GET',   path: '/api/students/lessons',                      auth: true,  roles: 'student',               description: 'Student scheduled lessons' },
    { method: 'GET',   path: '/api/me/contact',                            auth: true,  roles: 'all',                   description: 'Current user email & phone (for notifications)' },
    { method: 'PATCH', path: '/api/me/contact',                            auth: true,  roles: 'all',                   description: 'Update own email & phone' },
  ];

  const methodColor: Record<string, string> = { GET: '#22c55e', POST: '#3b82f6', PUT: '#f59e0b', PATCH: '#a855f7', DELETE: '#ef4444' };

  const rows = endpoints.map(e => `
    <tr>
      <td><span class="method" style="background:${methodColor[e.method] || '#64748b'}">${e.method}</span></td>
      <td><code>${e.path}</code></td>
      <td>${e.auth ? `<span class="auth">🔒 JWT</span>` : '<span class="open">open</span>'}</td>
      <td>${e.roles ? `<span class="role">${e.roles}</span>` : '—'}</td>
      <td>${e.description}</td>
    </tr>`).join('');

  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PILOTBASE API Docs</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;margin:0;background:#f8fafc;color:#1e293b}
  .header{background:#1e293b;color:#fff;padding:32px 40px}
  .header h1{margin:0 0 4px;font-size:24px}
  .header p{margin:0;color:#94a3b8;font-size:14px}
  .auth-note{background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 20px;margin:24px 40px;font-size:13px;color:#1e40af}
  .wrapper{padding:0 40px 40px}
  table{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06)}
  th{background:#f1f5f9;padding:10px 14px;font-size:12px;font-weight:700;text-align:left;color:#64748b;text-transform:uppercase;letter-spacing:.04em}
  td{padding:10px 14px;font-size:13px;border-top:1px solid #f1f5f9;vertical-align:middle}
  tr:hover td{background:#f8fafc}
  .method{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;color:#fff}
  code{background:#f1f5f9;border-radius:4px;padding:2px 6px;font-size:12px;color:#0f172a}
  .auth{font-size:11px;color:#1d4ed8;font-weight:600}
  .open{font-size:11px;color:#16a34a;font-weight:600}
  .role{font-size:11px;background:#f1f5f9;padding:2px 8px;border-radius:4px;color:#475569}
  .sim-note{background:#fefce8;border:1px solid #fde047;border-radius:8px;padding:14px 20px;margin:12px 40px 0;font-size:13px;color:#713f12}
</style>
</head><body>
<div class="header">
  <h1>PILOTBASE Agentic Scheduler API</h1>
  <p>v1.0.0 · Multi-tenant flight school scheduling · ${endpoints.length} endpoints</p>
</div>
<div class="auth-note">
  <strong>Authentication:</strong> All protected endpoints require <code>Authorization: Bearer &lt;JWT&gt;</code>.
  Obtain a token via <code>POST /api/auth/login</code> with <code>{"email":"...","password":"..."}</code>.
</div>
<div class="sim-note">
  ⚠️ <strong>Simulated PILOTBASE Integration:</strong> The FSP/PILOTBASE API client (<code>FSPClient</code>) is fully simulated — real API credentials were not available during development.
  All scheduling data (students, slots, cancellations) shown in the UI is demo data seeded from <code>seed.ts</code>. The webhook receiver at <code>POST /api/webhooks/fsp</code> accepts real HMAC-signed payloads but dispatches simulated events.
  Every simulated action is clearly labeled in the audit log with <code>source: simulated</code>.
</div>
<div class="wrapper">
<table>
  <thead><tr><th>Method</th><th>Path</th><th>Auth</th><th>Roles</th><th>Description</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
</div>
</body></html>`);
});

// Production: serve frontend static files and SPA fallback (skip /api so 404s hit errorHandler)
if (config.nodeEnv === 'production' && fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

// Error handler (must be last)
app.use(errorHandler);

// Start server (only when not in test mode)
if (process.env.NODE_ENV !== 'test') {
  app.listen(config.port, () => {
    console.log(`FSP Agentic Scheduler API running on port ${config.port}`);
    console.log(`Health check: http://localhost:${config.port}/health`);
    const smtpOk = !!(process.env.SMTP_HOST?.trim() && process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim());
    const logOnly =
      process.env.NOTIFICATIONS_LOG_ONLY === 'true' || process.env.NOTIFICATIONS_LOG_ONLY === '1';
    if (logOnly) {
      console.log('[Email] NOTIFICATIONS_LOG_ONLY — transactional email is logged only, not sent via SMTP');
    } else if (smtpOk) {
      console.log('[Email] SMTP configured — transactional email will send to users.email');
    } else {
      console.log('[Email] SMTP not configured — set SMTP_HOST, SMTP_USER, SMTP_PASS for real sends');
    }
  });
}

export default app;
