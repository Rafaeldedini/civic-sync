import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { createLogger } from '@civic-sync/logger';
import { type SensorEvent, PROCESSING_QUEUE_NAME } from '@civic-sync/types';
import { prisma } from '@civic-sync/database';
import { evaluateSensorEvent } from './scoring/engine.js';
import { saveAlertAssessment } from './repository.js';

const log = createLogger('processing');

// ─── Severity visual mapping (for dev-friendly logs) ─────────────────────────

const SEVERITY_ICONS: Record<string, string> = {
  normal:  '🟢',
  atencao: '🟡',
  alerta:  '🟠',
  critico: '🔴',
};

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

async function processJob(job: Job<SensorEvent>): Promise<void> {
  const event = job.data;

  log.info(
    { jobId: job.id, sensorId: event.sensorId.slice(-4), type: event.sensorType, attempt: job.attemptsMade + 1 },
    '📥 Received job',
  );

  // 1. Evaluate the sensor event (pure function — never fails due to DB)
  const assessment = evaluateSensorEvent(event);

  // 2. Persist the assessment.
  //    If PostgreSQL is down, this throws and BullMQ retries with backoff.
  const assessmentId = await saveAlertAssessment(assessment);

  // 3. Log the result with severity context
  const icon = SEVERITY_ICONS[assessment.severity] ?? '❓';

  log.info(
    {
      severity: assessment.severity,
      score: assessment.score,
      assessmentId,
      sensorType: assessment.sensorType,
      value: assessment.value,
      unit: assessment.unit,
    },
    `${icon} ${assessment.severity.toUpperCase().padEnd(7)} | score=${String(assessment.score).padStart(3)}/100 | ${assessment.message}`,
  );
}

// ─── Worker Instance ──────────────────────────────────────────────────────────

const worker = new Worker<SensorEvent>(PROCESSING_QUEUE_NAME, processJob, {
  connection,
  concurrency: 5,
});

worker.on('completed', (job) => {
  log.info({ jobId: job.id }, '🎉 Completed');
});

worker.on('failed', (job, err) => {
  log.error(
    { jobId: job?.id, error: err.message, attempt: job?.attemptsMade, maxAttempts: job?.opts?.attempts },
    '❌ Failed',
  );
});

worker.on('error', (err) => {
  log.error({ err: err.message }, 'Worker error');
});

log.info({ queue: PROCESSING_QUEUE_NAME }, `🟢 Listening on queue "${PROCESSING_QUEUE_NAME}"...`);

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
