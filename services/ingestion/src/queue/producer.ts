import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { type SensorEvent, QUEUE_NAME, PROCESSING_QUEUE_NAME } from '@civic-sync/types';

// ─── Redis Connection ─────────────────────────────────────────────────────────

const connection = new Redis({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
  maxRetriesPerRequest: null, // Required by BullMQ for blocking commands
});

connection.on('error', (err: Error) => {
  console.error('[Producer] Redis connection error:', err.message);
});

// ─── Queue Instances ──────────────────────────────────────────────────────────

const JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000, // 1s, 2s, 4s
  },
  removeOnComplete: 100,
  removeOnFail: 500,
} as const;

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
  console.error(`[Queue:${QUEUE_NAME}] error:`, err.message);
});

processingQueue.on('error', (err) => {
  console.error(`[Queue:${PROCESSING_QUEUE_NAME}] error:`, err.message);
});

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Publishes a sensor event to BOTH queues simultaneously:
 *  - sensor-events       → Persistence Service (raw storage)
 *  - sensor-processing   → Processing Service  (scoring + alerts)
 *
 * Returns the jobId (same for both queues).
 */
export async function publishSensorEvent(event: SensorEvent): Promise<string> {
  const jobId = `${event.sensorId}-${event.timestamp}`;

  const [persistenceJob] = await Promise.all([
    persistenceQueue.add('ingest', event, { jobId }),
    processingQueue.add('process', event, { jobId }),
  ]);

  console.log(
    `[Producer] Job enqueued | jobId=${persistenceJob.id} | sensorId=${event.sensorId} | type=${event.sensorType}`,
  );

  return persistenceJob.id!;
}

export { persistenceQueue, processingQueue };
