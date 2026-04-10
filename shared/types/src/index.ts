import { z } from 'zod';

// ─── Sensor Type Enum ────────────────────────────────────────────────────────

export const SensorTypeEnum = z.enum([
  'river_level',
  'soil_moisture',
  'slope_displacement',
  'forest_temperature',
]);

export type SensorType = z.infer<typeof SensorTypeEnum>;

// ─── Sensor Event Schema ─────────────────────────────────────────────────────

export const sensorEventSchema = z.object({
  sensorId: z.string().uuid({ message: 'sensorId must be a valid UUID' }),
  sensorType: SensorTypeEnum,
  value: z.number({ required_error: 'value is required' }),
  unit: z.string().min(1, 'unit is required'),
  timestamp: z.string().datetime({ message: 'timestamp must be ISO 8601' }),
  location: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
});

export type SensorEvent = z.infer<typeof sensorEventSchema>;

// ─── Queue Config ─────────────────────────────────────────────────────────────

export const QUEUE_NAME = 'sensor-events' as const;
