import { type FastifyInstance } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { QUEUE_NAME, PROCESSING_QUEUE_NAME } from '@civic-sync/types';

// ─── Admin Routes ─────────────────────────────────────────────────────────────
//
// Operational endpoints for monitoring system health, inspecting failed jobs
// (Dead Letter Queue), and viewing runtime metrics.
//

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>();

  // ═══════════════════════════════════════════════════════════════════════════
  //  GET /admin/metrics
  //
  //  Returns runtime metrics: memory, uptime, queue sizes, and throughput.
  //  Used by the dashboard's system health panel.
  // ═══════════════════════════════════════════════════════════════════════════

  server.get(
    '/admin/metrics',
    {
      schema: {
        response: {
          200: z.object({
            runtime: z.object({
              uptime: z.number(),
              memoryUsage: z.object({
                rss: z.string(),
                heapUsed: z.string(),
                heapTotal: z.string(),
              }),
              nodeVersion: z.string(),
              platform: z.string(),
            }),
            queues: z.object({
              persistence: z.object({
                waiting: z.number(),
                active: z.number(),
                completed: z.number(),
                failed: z.number(),
                delayed: z.number(),
              }),
              processing: z.object({
                waiting: z.number(),
                active: z.number(),
                completed: z.number(),
                failed: z.number(),
                delayed: z.number(),
              }),
            }),
          }),
        },
      },
    },
    async () => {
      const { persistenceQueue, processingQueue } = await import('../queue/producer.js');

      // Fetch queue counts in parallel
      const [persistCounts, processCounts] = await Promise.all([
        persistenceQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
        processingQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
      ]);

      const mem = process.memoryUsage();
      const formatMB = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

      return {
        runtime: {
          uptime: Math.round(process.uptime()),
          memoryUsage: {
            rss: formatMB(mem.rss),
            heapUsed: formatMB(mem.heapUsed),
            heapTotal: formatMB(mem.heapTotal),
          },
          nodeVersion: process.version,
          platform: process.platform,
        },
        queues: {
          persistence: {
            waiting:   persistCounts.waiting   ?? 0,
            active:    persistCounts.active    ?? 0,
            completed: persistCounts.completed ?? 0,
            failed:    persistCounts.failed    ?? 0,
            delayed:   persistCounts.delayed   ?? 0,
          },
          processing: {
            waiting:   processCounts.waiting   ?? 0,
            active:    processCounts.active    ?? 0,
            completed: processCounts.completed ?? 0,
            failed:    processCounts.failed    ?? 0,
            delayed:   processCounts.delayed   ?? 0,
          },
        },
      };
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  //  GET /admin/dlq
  //
  //  Dead Letter Queue — lists jobs that exhausted all retry attempts.
  //  These jobs failed 8 times and are now permanently in the "failed" state.
  //  This ensures no data is silently lost.
  // ═══════════════════════════════════════════════════════════════════════════

  server.get(
    '/admin/dlq',
    {
      schema: {
        querystring: z.object({
          queue: z.enum(['persistence', 'processing', 'all']).default('all'),
          limit: z.coerce.number().int().min(1).max(100).default(20),
        }),
        response: {
          200: z.object({
            deadLetters: z.array(
              z.object({
                id: z.string().nullable(),
                queue: z.string(),
                failedReason: z.string(),
                attemptsMade: z.number(),
                data: z.any(),
                timestamp: z.number().nullable(),
                finishedOn: z.number().nullable(),
              }),
            ),
            total: z.object({
              persistence: z.number(),
              processing: z.number(),
            }),
          }),
        },
      },
    },
    async (request) => {
      const { queue, limit } = request.query;
      const { persistenceQueue, processingQueue } = await import('../queue/producer.js');

      const queues: Array<{ q: typeof persistenceQueue; name: string }> = [];
      if (queue === 'all' || queue === 'persistence') {
        queues.push({ q: persistenceQueue, name: 'persistence' });
      }
      if (queue === 'all' || queue === 'processing') {
        queues.push({ q: processingQueue, name: 'processing' });
      }

      const deadLetters: Array<{
        id: string | null;
        queue: string;
        failedReason: string;
        attemptsMade: number;
        data: unknown;
        timestamp: number | null;
        finishedOn: number | null;
      }> = [];

      for (const { q, name } of queues) {
        const failedJobs = await q.getFailed(0, limit - 1);
        for (const job of failedJobs) {
          deadLetters.push({
            id: job.id ?? null,
            queue: name,
            failedReason: job.failedReason ?? 'Unknown',
            attemptsMade: job.attemptsMade,
            data: job.data,
            timestamp: job.timestamp ?? null,
            finishedOn: job.finishedOn ?? null,
          });
        }
      }

      // Sort by most recent failure first
      deadLetters.sort((a, b) => (b.finishedOn ?? 0) - (a.finishedOn ?? 0));

      // Get total counts
      const [persistFailed, processFailed] = await Promise.all([
        persistenceQueue.getJobCounts('failed'),
        processingQueue.getJobCounts('failed'),
      ]);

      return {
        deadLetters: deadLetters.slice(0, limit),
        total: {
          persistence: persistFailed.failed ?? 0,
          processing: processFailed.failed ?? 0,
        },
      };
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  //  POST /admin/dlq/retry
  //
  //  Retries all failed jobs in a specific queue (or both).
  //  Useful for manual recovery after a prolonged outage.
  // ═══════════════════════════════════════════════════════════════════════════

  server.post(
    '/admin/dlq/retry',
    {
      schema: {
        body: z.object({
          queue: z.enum(['persistence', 'processing', 'all']).default('all'),
        }),
        response: {
          200: z.object({
            retried: z.object({
              persistence: z.number(),
              processing: z.number(),
            }),
          }),
        },
      },
    },
    async (request) => {
      const { queue } = request.body;
      const { persistenceQueue, processingQueue } = await import('../queue/producer.js');

      let persistRetried = 0;
      let processRetried = 0;

      if (queue === 'all' || queue === 'persistence') {
        const failed = await persistenceQueue.getFailed(0, 999);
        for (const job of failed) {
          await job.retry();
          persistRetried++;
        }
      }

      if (queue === 'all' || queue === 'processing') {
        const failed = await processingQueue.getFailed(0, 999);
        for (const job of failed) {
          await job.retry();
          processRetried++;
        }
      }

      app.log.info(
        { persistRetried, processRetried },
        '🔄 DLQ retry executed',
      );

      return {
        retried: {
          persistence: persistRetried,
          processing: processRetried,
        },
      };
    },
  );
}
