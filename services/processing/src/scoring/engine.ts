import {
  type SensorEvent,
  type AlertAssessment,
  type SensorType,
} from '@civic-sync/types';
import {
  DEFAULT_RULES,
  classifySeverity,
  buildMessage,
} from './rules.js';

// ─── Scoring Engine ───────────────────────────────────────────────────────────

/**
 * Evaluates a raw sensor event and produces a scored AlertAssessment.
 *
 * The engine:
 *  1. Resolves the applicable rules for the sensor type
 *  2. Classifies the severity based on thresholds
 *  3. Calculates a normalized score (0–100)
 *  4. Generates a human-readable message
 *
 * @param event - The raw SensorEvent from the queue
 * @param sensorEventId - Optional DB id of the persisted SensorEvent
 */
export function evaluateSensorEvent(
  event: SensorEvent,
  sensorEventId?: string,
): AlertAssessment {
  const sensorType = event.sensorType as SensorType;
  const rule = DEFAULT_RULES[sensorType];

  const severity = classifySeverity(event.value, rule);
  const score = rule.normalize(event.value);
  const message = buildMessage(sensorType, severity, event.value, event.unit);

  return {
    sensorEventId,
    sensorId: event.sensorId,
    sensorType,
    value: event.value,
    unit: event.unit,
    severity,
    score,
    message,
    thresholds: rule.thresholds as unknown as Record<string, unknown>,
    location: event.location,
    timestamp: event.timestamp,
  };
}
