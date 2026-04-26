import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { type SensorEvent, PROCESSING_QUEUE_NAME } from '@civic-sync/types';
import { prisma } from '@civic-sync/database';
import { evaluateSensorEvent } from './scoring/engine.js';
import { saveAlertAssessment } from './repository.js';

// ─── ANSI colors ──────────────────────────────────────────────────────────────

const RESET   = '\x1b[0m';
const CYAN    = '\x1b[36m';
const GREEN   = '\x1b[32m';
const YELLOW  = '\x1b[33m';
const MAGENTA = '\x1b[35m';
const RED     = '\x1b[31m';
const BOLD    = '\x1b[1m';

const SEVERITY_COLORS: Record<string, string> = {
  normal:  GREEN,
  atencao: YELLOW,
  alerta:  MAGENTA,
  critico: RED + BOLD,
};

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
  console.error('[Processing] Redis connection error:', err.message);
});

// ─── Job Processor ────────────────────────────────────────────────────────────

async function processJob(job: Job<SensorEvent>): Promise<void> {
  const event = job.data;

  console.log(
    `${CYAN}[Processing] 📥 Received  | jobId=${job.id} | sensorId=${event.sensorId.slice(-4)} | type=${event.sensorType}${RESET}`,
  );

  // 1. Evaluate the sensor event
  const assessment = evaluateSensorEvent(event);

  // 2. Persist the assessment
  const assessmentId = await saveAlertAssessment(assessment);

  // 3. Log the result with appropriate severity color
  const color = SEVERITY_COLORS[assessment.severity] ?? RESET;
  const icon = SEVERITY_ICONS[assessment.severity] ?? '❓';

  console.log(
    `${color}[Processing] ${icon} ${assessment.severity.toUpperCase().padEnd(7)}${RESET} | ` +
    `score=${String(assessment.score).padStart(3)}/100 | ` +
    `${color}${assessment.message}${RESET}`,
  );
  console.log(
    `${CYAN}[Processing] ✅ Saved     | assessmentId=${assessmentId}${RESET}`,
  );
}

// ─── Worker Instance ──────────────────────────────────────────────────────────

const worker = new Worker<SensorEvent>(PROCESSING_QUEUE_NAME, processJob, {
  connection,
  concurrency: 5,
});

worker.on('completed', (job) => {
  console.log(`[Processing] 🎉 Completed | jobId=${job.id}`);
});

worker.on('failed', (job, err) => {
  console.error(
    `[Processing] ❌ Failed    | jobId=${job?.id} | error=${err.message} | attempt=${job?.attemptsMade}`,
  );
});

worker.on('error', (err) => {
  console.error('[Processing] Worker error:', err.message);
});

console.log(`[Processing] 🟢 Listening on queue "${PROCESSING_QUEUE_NAME}"...`);

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  console.log(`\n[Processing] Received ${signal}. Closing worker...`);
  await worker.close();
  await prisma.$disconnect();
  console.log('[Processing] Shutdown complete.');
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
