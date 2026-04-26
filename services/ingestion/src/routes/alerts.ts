import { type FastifyInstance } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AlertSeverityEnum } from '@civic-sync/types';
import { prisma } from '@civic-sync/database';

// ─── Pagination helper ────────────────────────────────────────────────────────

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function alertRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>();

  /**
   * GET /alerts
   * Returns recent alerts with optional filters.
   * Query params: severity, sensorType, limit, offset
   */
  server.get(
    '/alerts',
    {
      schema: {
        querystring: paginationSchema.extend({
          severity: AlertSeverityEnum.optional(),
          sensorType: z
            .enum(['nivel_rio', 'umidade_solo', 'deslocamento_encosta', 'temperatura_floresta'])
            .optional(),
        }),
        response: {
          200: z.object({
            data: z.array(z.any()),
            total: z.number(),
            limit: z.number(),
            offset: z.number(),
          }),
        },
      },
    },
    async (request) => {
      const { severity, sensorType, limit, offset } = request.query;

      const where = {
        ...(severity ? { severity } : {}),
        ...(sensorType ? { sensorType } : {}),
      };

      const [data, total] = await Promise.all([
        prisma.alertAssessment.findMany({
          where,
          orderBy: { processedAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        prisma.alertAssessment.count({ where }),
      ]);

      return { data, total, limit, offset };
    },
  );

  /**
   * GET /alerts/stats
   * Returns aggregate statistics on processed alerts.
   */
  server.get(
    '/alerts/stats',
    {
      schema: {
        response: {
          200: z.object({
            total: z.number(),
            bySeverity: z.object({
              normal: z.number(),
              atencao: z.number(),
              alerta: z.number(),
              critico: z.number(),
            }),
            topSensors: z.array(
              z.object({
                sensorId: z.string(),
                sensorType: z.string(),
                count: z.number(),
                avgScore: z.number(),
              }),
            ),
          }),
        },
      },
    },
    async () => {
      const [total, bySeverityRows, topSensors] = await Promise.all([
        prisma.alertAssessment.count(),

        prisma.alertAssessment.groupBy({
          by: ['severity'],
          _count: { severity: true },
        }),

        prisma.alertAssessment.groupBy({
          by: ['sensorId', 'sensorType'],
          _count: { sensorId: true },
          _avg: { score: true },
          orderBy: { _avg: { score: 'desc' } },
          take: 5,
        }),
      ]);

      const counts = Object.fromEntries(
        bySeverityRows.map((r) => [r.severity, r._count.severity]),
      ) as Record<string, number>;

      return {
        total,
        bySeverity: {
          normal:  counts['normal']  ?? 0,
          atencao: counts['atencao'] ?? 0,
          alerta:  counts['alerta']  ?? 0,
          critico: counts['critico'] ?? 0,
        },
        topSensors: topSensors.map((s) => ({
          sensorId: s.sensorId,
          sensorType: s.sensorType,
          count: s._count.sensorId,
          avgScore: Math.round(s._avg.score ?? 0),
        })),
      };
    },
  );

  /**
   * GET /alerts/:id
   * Returns a specific alert by UUID.
   */
  server.get(
    '/alerts/:id',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.any(),
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const record = await prisma.alertAssessment.findUnique({
        where: { id: request.params.id },
      });

      if (!record) {
        return reply.status(404).send({ error: 'Alert not found' });
      }

      return record;
    },
  );

  /**
   * GET /alerts/sensors/:sensorId
   * Returns alerts for a specific sensor.
   */
  server.get(
    '/alerts/sensors/:sensorId',
    {
      schema: {
        params: z.object({ sensorId: z.string().uuid() }),
        querystring: paginationSchema,
        response: {
          200: z.object({
            data: z.array(z.any()),
            total: z.number(),
          }),
        },
      },
    },
    async (request) => {
      const { sensorId } = request.params;
      const { limit, offset } = request.query;

      const [data, total] = await Promise.all([
        prisma.alertAssessment.findMany({
          where: { sensorId },
          orderBy: { processedAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        prisma.alertAssessment.count({ where: { sensorId } }),
      ]);

      return { data, total };
    },
  );
}
