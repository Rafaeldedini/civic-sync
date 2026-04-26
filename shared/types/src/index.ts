import { z } from 'zod';

// ─── Sensor Type Enum ────────────────────────────────────────────────────────

export const SensorTypeEnum = z.enum([
  'nivel_rio',
  'umidade_solo',
  'deslocamento_encosta',
  'temperatura_floresta',
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

// ─── Alert Severity Enum ──────────────────────────────────────────────────────

export const AlertSeverityEnum = z.enum([
  'normal',
  'atencao',
  'alerta',
  'critico',
]);

export type AlertSeverity = z.infer<typeof AlertSeverityEnum>;

// ─── Alert Assessment Schema ─────────────────────────────────────────────────

export const alertAssessmentSchema = z.object({
  sensorEventId: z.string().uuid().optional(),
  sensorId: z.string().uuid(),
  sensorType: SensorTypeEnum,
  value: z.number(),
  unit: z.string(),
  severity: AlertSeverityEnum,
  score: z.number().int().min(0).max(100),
  message: z.string(),
  thresholds: z.record(z.unknown()),
  location: z.object({
    lat: z.number(),
    lng: z.number(),
  }),
  timestamp: z.string().datetime(),
});

export type AlertAssessment = z.infer<typeof alertAssessmentSchema>;

// ─── Queue Config ─────────────────────────────────────────────────────────────

export const QUEUE_NAME = 'sensor-events' as const;
export const PROCESSING_QUEUE_NAME = 'sensor-processing' as const;
