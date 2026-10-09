'use strict';

require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const { Pool } = require('pg');

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({ limit: '32kb', strict: true }));

const port = Number(process.env.PORT || 8080);
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : undefined,
      max: 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000
    })
  : null;

app.get('/health', (_req, res) => {
  res.status(200).json({
    ok: true,
    service: 'rahlet-sayd-financial-backend',
    mode: process.env.NODE_ENV || 'development',
    databaseConfigured: Boolean(pool),
    depositsEnabled: process.env.ENABLE_DEPOSITS === 'true',
    withdrawalsEnabled: process.env.ENABLE_WITHDRAWALS === 'true'
  });
});

app.get('/api/v1/wallet/me', (_req, res) => {
  // Intentionally closed until real authentication and authorization middleware exists.
  res.status(501).json({
    error: 'NOT_IMPLEMENTED',
    message: 'Wallet API is disabled until authentication and database-backed ledger services are implemented.'
  });
});

app.post('/api/v1/deposits/quote', (_req, res) => {
  res.status(503).json({
    error: 'DEPOSITS_DISABLED',
    message: 'Do not send funds yet. Deposit address assignment and on-chain confirmation monitoring are not active.'
  });
});

app.post('/api/v1/withdrawals', (_req, res) => {
  res.status(503).json({
    error: 'WITHDRAWALS_DISABLED',
    message: 'Withdrawals are disabled until authentication, withdrawal holds, admin review and secure signing are implemented.'
  });
});

app.use((_req, res) => res.status(404).json({ error: 'NOT_FOUND' }));

app.use((err, _req, res, _next) => {
  // Never return stack traces, credentials, database errors or provider payloads to clients.
  console.error('request_error', { name: err && err.name, message: 'Request failed' });
  res.status(400).json({ error: 'BAD_REQUEST', message: 'The request could not be processed.' });
});

const server = app.listen(port, () => {
  console.log(`Financial backend listening on port ${port}; deposits/withdrawals remain disabled.`);
});

async function shutdown(signal) {
  console.log(`Received ${signal}; shutting down.`);
  server.close(async () => {
    if (pool) await pool.end().catch(() => {});
    process.exit(0);
  });
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
