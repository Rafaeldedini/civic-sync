import { type SensorEvent } from '@civic-sync/types';
import { prisma } from './client.js';

/**
 * Persists a raw sensor event to the database without any transformation.
 * The original payload is stored in `raw_payload` (jsonb) for auditability.
 */
export async function saveSensorEvent(event: SensorEvent): Promise<void> {
  await prisma.sensorEvent.create({
    data: {
      sensorId: event.sensorId,
      sensorType: event.sensorType,
      value: event.value,
      unit: event.unit,
      timestamp: new Date(event.timestamp),
      locationLat: event.location.lat,
      locationLng: event.location.lng,
      rawPayload: event as object,
    },
  });
}
