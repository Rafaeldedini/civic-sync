import { createLogger } from '@civic-sync/logger';
import { buildGateway } from './gateway.js';

const PORT = Number(process.env.GATEWAY_PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';
const log = createLogger('gateway');

async function main(): Promise<void> {
  const app = await buildGateway();

  try {
    await app.listen({ port: PORT, host: HOST });
    log.info(`🚀 Gateway service listening on http://${HOST}:${PORT}`);
  } catch (err) {
    log.error(err, 'Failed to start gateway service');
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
