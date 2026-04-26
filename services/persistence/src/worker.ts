import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { type SensorEvent, QUEUE_NAME } from '@civic-sync/types';
import { prisma } from '@civic-sync/database';
import { saveSensorEvent } from './repository.js';

// ─── Redis Connection ─────────────────────────────────────────────────────────

const connection = new Redis({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
  maxRetriesPerRequest: null, // Required by BullMQ
});

connection.on('error', (err: Error) => {
  console.error('[Worker] Redis connection error:', err.message);
});

// ─── Job Processor ────────────────────────────────────────────────────────────

async function processJob(job: Job<SensorEvent>): Promise<void> {
  console.log(
    `[Worker] 📥 Received  | jobId=${job.id} | sensorId=${job.data.sensorId} | type=${job.data.sensorType} | attempt=${job.attemptsMade + 1}`,
  );

  await saveSensorEvent(job.data);

  console.log(
    `[Worker] ✅ Persisted | jobId=${job.id} | sensorId=${job.data.sensorId}`,
  );
}

// ─── Worker Instance ──────────────────────────────────────────────────────────

const worker = new Worker<SensorEvent>(QUEUE_NAME, processJob, {
  connection,
  concurrency: 5,
});

worker.on('completed', (job) => {
  console.log(`[Worker] 🎉 Completed | jobId=${job.id}`);
});

worker.on('failed', (job, err) => {
  console.error(
    `[Worker] ❌ Failed    | jobId=${job?.id} | error=${err.message} | attempt=${job?.attemptsMade}`,
  );
});

worker.on('error', (err) => {
  console.error('[Worker] Worker error:', err.message);
});

console.log(`[Worker] 🟢 Listening on queue "${QUEUE_NAME}"...`);

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  console.log(`\n[Worker] Received ${signal}. Closing worker...`);
  await worker.close();
  await prisma.$disconnect();
  console.log('[Worker] Shutdown complete.');
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
