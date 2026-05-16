import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { createLogger } from '@civic-sync/logger';
import { type SensorEvent, QUEUE_NAME, PROCESSING_QUEUE_NAME } from '@civic-sync/types';

const log = createLogger('producer');

// ─── Redis Connection ─────────────────────────────────────────────────────────

const connection = new Redis({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
  maxRetriesPerRequest: null, // Required by BullMQ for blocking commands
});

connection.on('error', (err: Error) => {
  log.error({ err: err.message }, 'Redis connection error');
});

// ─── Fault-Tolerant Job Options ───────────────────────────────────────────────
//
// If PostgreSQL is down, workers will fail to persist data. BullMQ will hold
// the jobs in Redis and retry them with exponential backoff:
//   attempt 1 →   2s
//   attempt 2 →   4s
//   attempt 3 →   8s
//   attempt 4 →  16s
//   attempt 5 →  32s
//   attempt 6 →  64s  (~1 min)
//   attempt 7 → 128s  (~2 min)
//   attempt 8 → 256s  (~4 min)
//
// Total window: ~8.5 minutes of retries before a job is declared failed.
//

const JOB_OPTIONS = {
  attempts: 8,
  backoff: {
    type: 'exponential' as const,
    delay: 2000, // base delay: 2 seconds
  },
  removeOnComplete: 100,
  removeOnFail: false,   // ← KEEP failed jobs (Dead Letter Queue pattern)
};

/** Persistence queue — raw events → PostgreSQL sensor_events */
const persistenceQueue = new Queue<SensorEvent>(QUEUE_NAME, {
  connection,
  defaultJobOptions: JOB_OPTIONS,
});

/** Processing queue — raw events → score engine → PostgreSQL alert_assessments */
const processingQueue = new Queue<SensorEvent>(PROCESSING_QUEUE_NAME, {
  connection,
  defaultJobOptions: JOB_OPTIONS,
});

persistenceQueue.on('error', (err) => {
  log.error({ queue: QUEUE_NAME, err: err.message }, 'Queue error');
});

processingQueue.on('error', (err) => {
  log.error({ queue: PROCESSING_QUEUE_NAME, err: err.message }, 'Queue error');
});

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Publishes a sensor event to BOTH queues simultaneously:
 *  - sensor-events       → Persistence Service (raw storage)
 *  - sensor-processing   → Processing Service  (scoring + alerts)
 *
 * The correlationId is stored in the job data so workers can trace
 * the event back to the original HTTP request (end-to-end observability).
 *
 * Returns the jobId (same for both queues).
 */
export async function publishSensorEvent(
  event: SensorEvent,
  correlationId?: string,
): Promise<string> {
  const jobId = `${event.sensorId}-${event.timestamp}`;

  // Inject the correlation ID into the event data for end-to-end tracing
  const enrichedEvent = correlationId
    ? { ...event, _correlationId: correlationId }
    : event;

  const [persistenceJob] = await Promise.all([
    persistenceQueue.add('ingest', enrichedEvent, { jobId }),
    processingQueue.add('process', enrichedEvent, { jobId }),
  ]);

  log.info(
    { jobId: persistenceJob.id, sensorId: event.sensorId, type: event.sensorType, correlationId },
    'Job enqueued',
  );

  return persistenceJob.id!;
}

/**
 * Exposes the Redis connection for the /health endpoint to ping.
 */
export function getRedisConnection(): Redis {
  return connection;
}

export { persistenceQueue, processingQueue };
