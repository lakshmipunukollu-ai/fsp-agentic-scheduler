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

// When running node dist/index.js, __dirname is backend/dist; public is backend/public
const publicDir = path.join(__dirname, '..', 'public');

export const app = express();

// Middleware
app.use(cors({ origin: config.corsOrigin, credentials: true }));
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
  });
}

export default app;
