import { createLogger } from '@civic-sync/logger';
import { buildApp } from './app.js';

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? '0.0.0.0';
const log = createLogger('ingestion');

async function main(): Promise<void> {
  const app = await buildApp();

  try {
    await app.listen({ port: PORT, host: HOST });
    log.info(`🚀 Ingestion service listening on http://${HOST}:${PORT}`);
  } catch (err) {
    log.error(err, 'Failed to start ingestion service');
    process.exit(1);
  }
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  log.info({ signal }, 'Received shutdown signal. Shutting down gracefully...');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

main();
