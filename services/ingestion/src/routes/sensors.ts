import { type FastifyInstance } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sensorEventSchema } from '@civic-sync/types';
import { publishSensorEvent } from '../queue/producer.js';

export async function sensorRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>();

  /**
   * GET /sensors/types
   * Returns the list of supported sensor types.
   */
  server.get(
    '/sensors/types',
    {
      schema: {
        response: {
          200: z.object({
            types: z.array(z.string()),
          }),
        },
      },
    },
    async () => {
      const types = [
        'nivel_rio',
        'umidade_solo',
        'deslocamento_encosta',
        'temperatura_floresta',
      ];
      return { types };
    },
  );

  /**
   * POST /sensors/event
   * Validates the sensor payload and enqueues it for persistence.
   * Returns 202 Accepted with the BullMQ job ID.
   */
  server.post(
    '/sensors/event',
    {
      schema: {
        body: sensorEventSchema,
        response: {
          202: z.object({
            status: z.literal('accepted'),
            jobId: z.string(),
          }),
          400: z.object({
            statusCode: z.number(),
            error: z.string(),
            message: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const event = request.body;
      const jobId = await publishSensorEvent(event);

      return reply.status(202).send({
        status: 'accepted',
        jobId,
      });
    },
  );
}
