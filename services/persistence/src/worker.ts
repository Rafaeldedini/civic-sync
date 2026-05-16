import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { createLogger } from '@civic-sync/logger';
import { type SensorEvent, QUEUE_NAME } from '@civic-sync/types';
import { prisma } from '@civic-sync/database';
import { saveSensorEvent } from './repository.js';

const log = createLogger('persistence');

// ─── Redis Connection ─────────────────────────────────────────────────────────

const connection = new Redis({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
  maxRetriesPerRequest: null, // Required by BullMQ
});

connection.on('error', (err: Error) => {
  log.error({ err: err.message }, 'Redis connection error');
});

// ─── Job Processor ────────────────────────────────────────────────────────────

async function processJob(job: Job<SensorEvent & { _correlationId?: string }>): Promise<void> {
  const { _correlationId, ...event } = job.data;

  log.info(
    {
      jobId: job.id,
      correlationId: _correlationId,
      sensorId: event.sensorId,
      type: event.sensorType,
      attempt: job.attemptsMade + 1,
    },
    '📥 Received job',
  );

  // If this throws (e.g. Prisma can't reach PostgreSQL), BullMQ will
  // catch the error and schedule a retry based on the job's backoff config.
  // The error is NOT swallowed — it propagates to trigger the retry mechanism.
  await saveSensorEvent(event);

  log.info(
    { jobId: job.id, correlationId: _correlationId, sensorId: event.sensorId },
    '✅ Persisted',
  );
}

// ─── Worker Instance ──────────────────────────────────────────────────────────

const worker = new Worker<SensorEvent>(QUEUE_NAME, processJob, {
  connection,
  concurrency: 5,
});

worker.on('completed', (job) => {
  log.info({ jobId: job.id }, '🎉 Completed');
});

worker.on('failed', (job, err) => {
  const isDeadLetter = job?.attemptsMade === job?.opts?.attempts;
  log.error(
    {
      jobId: job?.id,
      error: err.message,
      attempt: job?.attemptsMade,
      maxAttempts: job?.opts?.attempts,
      deadLetter: isDeadLetter,
    },
    isDeadLetter
      ? '🪦 DEAD LETTER — Exhausted all retries, job moved to DLQ'
      : '❌ Failed',
  );
});

worker.on('error', (err) => {
  log.error({ err: err.message }, 'Worker error');
});

log.info({ queue: QUEUE_NAME }, `🟢 Listening on queue "${QUEUE_NAME}"...`);

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  log.info({ signal }, 'Closing worker...');
  await worker.close();
  await prisma.$disconnect();
  log.info('Shutdown complete.');
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
