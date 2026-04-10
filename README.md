# CIVIC-SYNC

> **Distributed crisis and natural disaster monitoring system**

Sistema distribuído para monitorar crises e desastres naturais em tempo real. Recebe dados de sensores IoT (nível de rio, umidade do solo, deslocamento de encosta, temperatura de floresta) e os replica para múltiplos operadores via fila BullMQ/Redis e persistência PostgreSQL.

## Architecture

```
┌─────────────────┐      POST /sensors/event      ┌──────────────────────┐
│  Sensor IoT /   │ ────────────────────────────► │  Ingestion Service   │
│  Mock Script    │                               │  Fastify 5 + Zod     │
└─────────────────┘                               └──────────┬───────────┘
                                                             │ Queue.add()
                                                    ┌────────▼────────┐
                                                    │  Redis / BullMQ │
                                                    │  sensor-events  │
                                                    └────────┬────────┘
                                                             │ Worker.process()
                                                   ┌─────────▼──────────┐
                                                   │ Persistence Service │
                                                   │  BullMQ Worker +   │
                                                   │  Prisma ORM        │
                                                   └─────────┬──────────┘
                                                             │ prisma.create()
                                                    ┌────────▼───────────┐
                                                    │  PostgreSQL 15     │
                                                    │  sensor_events     │
                                                    └────────────────────┘
```

## Project Structure

```
civic-sync/
├── docker-compose.yml
├── .env.example
├── package.json               # npm workspaces root
├── tsconfig.base.json         # shared TS config (strict mode)
├── shared/
│   └── types/                 # @civic-sync/types — Zod schemas + SensorEvent
├── services/
│   ├── ingestion/             # @civic-sync/ingestion — Fastify REST API
│   └── persistence/           # @civic-sync/persistence — BullMQ Worker + Prisma
└── scripts/
    └── mock-sensor.ts         # IoT simulation
```

## Quick Start

### 1. Prerequisites

- Node.js ≥ 18
- Docker + Docker Compose

### 2. Clone and configure environment

```bash
cp .env.example .env
```

### 3. Start infrastructure (PostgreSQL + Redis)

```bash
docker-compose up -d
```

Wait for services to be healthy:
```bash
docker-compose ps
```

### 4. Install dependencies

```bash
npm install
```

### 5. Run Prisma migration

```bash
npm run db:migrate
# or from the persistence service:
cd services/persistence && npx prisma migrate dev --name init
```

### 6. Start both services

```bash
# In terminal 1 — starts ingestion (port 3001) + persistence worker
npm run dev

# OR start individually:
npm run dev:ingestion    # Terminal 1
npm run dev:persistence  # Terminal 2
```

### 7. Run the mock sensor

```bash
# In a new terminal:
npm run mock
# or:
npx tsx scripts/mock-sensor.ts
```

You'll see colorized output with one event per second:
```
[Mock] ✅ #0001 | river_level          |   7.43 m  | sensorId=0001 | jobId=1a2b3c4d
[Mock] ✅ #0002 | forest_temperature   |  42.18 °C | sensorId=0005 | jobId=2b3c4d5e
```

## Verifying data in PostgreSQL

```bash
# Connect to PostgreSQL
docker exec -it civic_sync_postgres psql -U civicsync -d civicsync

# Count persisted events
SELECT count(*) FROM sensor_events;

# View the last 5 events
SELECT id, sensor_id, sensor_type, value, unit, timestamp
FROM sensor_events
ORDER BY created_at DESC
LIMIT 5;

# Inspect the raw JSON payload
SELECT raw_payload FROM sensor_events LIMIT 1;
```

## API Reference

### `POST /sensors/event`

Ingests a sensor reading.

**Request body:**
```json
{
  "sensorId": "a1b2c3d4-0001-4000-8000-000000000001",
  "sensorType": "river_level",
  "value": 7.43,
  "unit": "m",
  "timestamp": "2025-04-10T18:00:00.000Z",
  "location": {
    "lat": -22.505,
    "lng": -43.178
  }
}
```

**Sensor types:** `river_level` | `soil_moisture` | `slope_displacement` | `forest_temperature`

**Response `202 Accepted`:**
```json
{
  "status": "accepted",
  "jobId": "a1b2c3d4-0001-4000-8000-000000000001-2025-04-10T18:00:00.000Z"
}
```

### `GET /health`

Returns service status.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://civicsync:civicsync@localhost:5432/civicsync` | PostgreSQL connection string |
| `REDIS_HOST` | `localhost` | Redis hostname |
| `REDIS_PORT` | `6379` | Redis port |
| `PORT` | `3001` | Ingestion service HTTP port |
| `NODE_ENV` | — | Set to `production` to reduce Prisma logging |

## Tech Stack

| Layer | Technology |
|---|---|
| API | Fastify 5 + fastify-type-provider-zod |
| Validation | Zod 3 |
| Queue | BullMQ 5 + ioredis |
| ORM | Prisma 6 |
| Database | PostgreSQL 15 |
| Cache/Queue | Redis 7 |
| Language | TypeScript 5 (strict mode) |
| Runner | tsx (dev) |
