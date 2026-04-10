import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { type SensorEvent, QUEUE_NAME } from '@civic-sync/types';

// ─── Redis Connection ─────────────────────────────────────────────────────────

const connection = new Redis({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
  maxRetriesPerRequest: null, // Required by BullMQ for blocking commands
});

connection.on('error', (err: Error) => {
  console.error('[Producer] Redis connection error:', err.message);
});

// ─── Queue Instance ───────────────────────────────────────────────────────────

const sensorQueue = new Queue<SensorEvent>(QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000, // 1s, 2s, 4s
    },
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 500,     // Keep last 500 failed jobs
  },
});

sensorQueue.on('error', (err) => {
  console.error(`[Queue:${QUEUE_NAME}] Queue error:`, err.message);
});

// ─── Public API ───────────────────────────────────────────────────────────────

export async function publishSensorEvent(event: SensorEvent): Promise<string> {
  const job = await sensorQueue.add('ingest', event, {
    jobId: `${event.sensorId}-${event.timestamp}`,
  });
  console.log(`[Producer] Job enqueued | jobId=${job.id} | sensorId=${event.sensorId} | type=${event.sensorType}`);
  return job.id!;
}

export { sensorQueue };
