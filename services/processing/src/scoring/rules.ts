import { type SensorType, type AlertSeverity } from '@civic-sync/types';

// ─── Threshold Definitions ────────────────────────────────────────────────────

export interface SeverityThreshold {
  atencao: number;  // value >= atencao → atencao
  alerta: number;   // value >= alerta  → alerta
  critico: number;  // value >= critico → critico
}

export interface SensorRule {
  unit: string;
  description: string;
  thresholds: SeverityThreshold;
  /** For umidade_solo, low values are also dangerous */
  lowThresholds?: SeverityThreshold;
  normalize: (value: number) => number; // returns 0-100 score
}

// ─── Rules per Sensor Type ────────────────────────────────────────────────────

export const DEFAULT_RULES: Record<SensorType, SensorRule> = {
  nivel_rio: {
    unit: 'm',
    description: 'Nível de rio — risco de enchente e inundação',
    thresholds: {
      atencao: 3.0,
      alerta: 6.0,
      critico: 10.0,
    },
    normalize: (v) => Math.min(100, Math.round((v / 15.0) * 100)),
  },

  umidade_solo: {
    unit: '%',
    description: 'Umidade do solo — risco de deslizamento por saturação ou seca',
    // High values are dangerous (saturation → landslide)
    thresholds: {
      atencao: 80,
      alerta: 90,
      critico: 95,
    },
    // Low values are also dangerous (drought, unstable)
    lowThresholds: {
      atencao: 40,  // value <= 40 → atencao
      alerta: 25,   // value <= 25 → alerta
      critico: 10,  // value <= 10 → critico
    },
    normalize: (v) => {
      // Score based on deviation from ideal (60%)
      const deviation = Math.abs(v - 60);
      return Math.min(100, Math.round(deviation * 2.5));
    },
  },

  deslocamento_encosta: {
    unit: 'mm',
    description: 'Deslocamento de encosta — risco de deslizamento de terra',
    thresholds: {
      atencao: 5,
      alerta: 15,
      critico: 30,
    },
    normalize: (v) => Math.min(100, Math.round((v / 50.0) * 100)),
  },

  temperatura_floresta: {
    unit: '°C',
    description: 'Temperatura de floresta — risco de incêndio florestal',
    thresholds: {
      atencao: 30,
      alerta: 40,
      critico: 50,
    },
    normalize: (v) => Math.min(100, Math.round(((v - 15) / 50.0) * 100)),
  },
};

// ─── Severity Classification ──────────────────────────────────────────────────

export function classifySeverity(
  value: number,
  rule: SensorRule,
): AlertSeverity {
  const { thresholds, lowThresholds } = rule;

  // Check high-value thresholds
  if (value >= thresholds.critico) return 'critico';
  if (value >= thresholds.alerta) return 'alerta';
  if (value >= thresholds.atencao) return 'atencao';

  // Check low-value thresholds (for umidade_solo)
  if (lowThresholds) {
    if (value <= lowThresholds.critico) return 'critico';
    if (value <= lowThresholds.alerta) return 'alerta';
    if (value <= lowThresholds.atencao) return 'atencao';
  }

  return 'normal';
}

// ─── Human-readable alert messages ───────────────────────────────────────────

const MESSAGES: Record<SensorType, Record<AlertSeverity, (v: number, u: string) => string>> = {
  nivel_rio: {
    normal:   (v, u) => `Nível do rio em ${v}${u} — dentro do normal.`,
    atencao:  (v, u) => `Nível do rio em ${v}${u} — ATENÇÃO: monitoramento recomendado.`,
    alerta:   (v, u) => `Nível do rio em ${v}${u} — ALERTA: risco de enchente nas margens.`,
    critico:  (v, u) => `Nível do rio em ${v}${u} — CRÍTICO: enchente iminente, evacuação necessária!`,
  },
  umidade_solo: {
    normal:   (v, u) => `Umidade do solo em ${v}${u} — condição normal.`,
    atencao:  (v, u) => `Umidade do solo em ${v}${u} — ATENÇÃO: condição fora do ideal.`,
    alerta:   (v, u) => `Umidade do solo em ${v}${u} — ALERTA: risco de instabilidade do terreno.`,
    critico:  (v, u) => `Umidade do solo em ${v}${u} — CRÍTICO: risco elevado de deslizamento!`,
  },
  deslocamento_encosta: {
    normal:   (v, u) => `Deslocamento de encosta em ${v}${u} — estável.`,
    atencao:  (v, u) => `Deslocamento de encosta em ${v}${u} — ATENÇÃO: monitoramento intensivo.`,
    alerta:   (v, u) => `Deslocamento de encosta em ${v}${u} — ALERTA: movimento detectado, evacuação preventiva.`,
    critico:  (v, u) => `Deslocamento de encosta em ${v}${u} — CRÍTICO: deslizamento em progresso, evacuação imediata!`,
  },
  temperatura_floresta: {
    normal:   (v, u) => `Temperatura da floresta em ${v}${u} — normal.`,
    atencao:  (v, u) => `Temperatura da floresta em ${v}${u} — ATENÇÃO: condição quente, vigilância recomendada.`,
    alerta:   (v, u) => `Temperatura da floresta em ${v}${u} — ALERTA: risco elevado de incêndio.`,
    critico:  (v, u) => `Temperatura da floresta em ${v}${u} — CRÍTICO: incêndio florestal iminente ou ativo!`,
  },
};

export function buildMessage(
  sensorType: SensorType,
  severity: AlertSeverity,
  value: number,
  unit: string,
): string {
  return MESSAGES[sensorType][severity](value, unit);
}
