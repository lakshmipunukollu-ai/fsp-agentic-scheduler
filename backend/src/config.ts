import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function parseDatabaseUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || '5432', 10),
    name: parsed.pathname.slice(1),
    user: parsed.username,
    password: parsed.password,
    ssl: false,
  };
}

const dbFromUrl = process.env.DATABASE_URL ? parseDatabaseUrl(process.env.DATABASE_URL) : null;

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  database: {
    host: dbFromUrl?.host || process.env.DB_HOST || 'localhost',
    port: dbFromUrl?.port || parseInt(process.env.DB_PORT || '5432', 10),
    name: dbFromUrl?.name || process.env.DB_NAME || 'fsp_scheduler',
    user: dbFromUrl?.user || process.env.DB_USER || 'postgres',
    password: dbFromUrl?.password || process.env.DB_PASSWORD || 'postgres',
    ssl: dbFromUrl?.ssl || process.env.DB_SSL === 'true',
  },
  databaseUrl: process.env.DATABASE_URL,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5001',
  agentPollIntervalMs: parseInt(process.env.AGENT_POLL_INTERVAL_MS || '300000', 10),
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    fromNumber: process.env.TWILIO_FROM_NUMBER || '',
  },
  fspApiMode: (process.env.FSP_API_MODE || 'mock') as 'mock' | 'live',
  openWeatherApiKey: process.env.OPENWEATHER_API_KEY || '',
};
