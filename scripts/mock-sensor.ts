/**
 * mock-sensor.ts
 *
 * Sends 1 sensor event per second to the ingestion service.
 * Simulates realistic readings for all 4 sensor types.
 *
 * Usage:
 *   npx tsx scripts/mock-sensor.ts
 */

// ─── Config ───────────────────────────────────────────────────────────────────

const INGESTION_URL = process.env.INGESTION_URL ?? 'http://localhost:3001';
const INTERVAL_MS = 1000;

// ─── Brazilian disaster-prone locations ──────────────────────────────────────

const LOCATIONS = [
  { name: 'Petrópolis, RJ', lat: -22.505, lng: -43.178 },
  { name: 'Angra dos Reis, RJ', lat: -23.006, lng: -44.318 },
  { name: 'Blumenau, SC', lat: -26.919, lng: -49.066 },
  { name: 'Nova Friburgo, RJ', lat: -22.281, lng: -42.531 },
  { name: 'Presidente Figueiredo, AM', lat: -2.032, lng: -60.021 },
  { name: 'São Sebastião, SP', lat: -23.798, lng: -45.402 },
];

// ─── Fixed pool of sensor UUIDs (10 sensors) ─────────────────────────────────

const SENSOR_IDS = [
  'a1b2c3d4-0001-4000-8000-000000000001',
  'a1b2c3d4-0002-4000-8000-000000000002',
  'a1b2c3d4-0003-4000-8000-000000000003',
  'a1b2c3d4-0004-4000-8000-000000000004',
  'a1b2c3d4-0005-4000-8000-000000000005',
  'a1b2c3d4-0006-4000-8000-000000000006',
  'a1b2c3d4-0007-4000-8000-000000000007',
  'a1b2c3d4-0008-4000-8000-000000000008',
  'a1b2c3d4-0009-4000-8000-000000000009',
  'a1b2c3d4-0010-4000-8000-000000000010',
] as const;

// ─── Sensor type definitions ──────────────────────────────────────────────────

type SensorType =
  | 'nivel_rio'
  | 'umidade_solo'
  | 'desclocamento_encosta'
  | 'temperatura_floresta';

interface SensorSpec {
  unit: string;
  min: number;
  max: number;
}

const SENSOR_SPECS: Record<SensorType, SensorSpec> = {
  nivel_rio: { unit: 'm', min: 0.5, max: 15.0 },
  umidade_solo: { unit: '%', min: 10, max: 95 },
  desclocamento_encosta: { unit: 'mm', min: 0, max: 50 },
  temperatura_floresta: { unit: '°C', min: 15, max: 65 },
};

const SENSOR_TYPES = Object.keys(SENSOR_SPECS) as SensorType[];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randomBetween(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

function randomFrom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function buildPayload() {
  const sensorType = randomFrom(SENSOR_TYPES);
  const spec = SENSOR_SPECS[sensorType];
  const location = randomFrom(LOCATIONS);

  return {
    sensorId: randomFrom(SENSOR_IDS),
    sensorType,
    value: randomBetween(spec.min, spec.max),
    unit: spec.unit,
    timestamp: new Date().toISOString(),
    location: { lat: location.lat, lng: location.lng },
  };
}

// ─── ANSI colors ──────────────────────────────────────────────────────────────

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

const TYPE_COLORS: Record<SensorType, string> = {
  nivel_rio: '\x1b[34m',          // blue
  umidade_solo: '\x1b[32m',        // green
  desclocamento_encosta: '\x1b[35m',   // magenta
  temperatura_floresta: '\x1b[33m',   // yellow
};

// ─── Main loop ────────────────────────────────────────────────────────────────

let count = 0;

console.log(`${CYAN}[Mock] 🛰️  CIVIC-SYNC Mock Sensor Started${RESET}`);
console.log(`${CYAN}[Mock] Targeting: ${INGESTION_URL}/sensors/event${RESET}`);
console.log(`${CYAN}[Mock] Sending 1 event/second. Press Ctrl+C to stop.\n${RESET}`);

const interval = setInterval(async () => {
  const payload = buildPayload();
  count++;

  const typeColor = TYPE_COLORS[payload.sensorType];

  try {
    const res = await fetch(`${INGESTION_URL}/sensors/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const body = (await res.json()) as { jobId: string };
      console.log(
        `${GREEN}[Mock] ✅ #${count.toString().padStart(4, '0')}${RESET} | ` +
        `${typeColor}${payload.sensorType.padEnd(20)}${RESET} | ` +
        `${YELLOW}${String(payload.value).padStart(6)} ${payload.unit}${RESET} | ` +
        `sensorId=${payload.sensorId.slice(-4)} | jobId=${body.jobId?.slice(-8) ?? 'n/a'}`,
      );
    } else {
      const err = await res.text();
      console.error(`${RED}[Mock] ❌ #${count} HTTP ${res.status}: ${err}${RESET}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${RED}[Mock] ❌ #${count} Fetch error: ${message}${RESET}`);
    console.error(`${YELLOW}[Mock] Is the ingestion service running? (npm run dev:ingestion)${RESET}`);
  }
}, INTERVAL_MS);

process.on('SIGINT', () => {
  clearInterval(interval);
  console.log(`\n${CYAN}[Mock] Stopped after ${count} events sent.${RESET}`);
  process.exit(0);
});
