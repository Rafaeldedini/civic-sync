# CIVIC-SYNC

> Alunos: Rafael Dedini, Nicolas Venciguerra, Caua Ferraz, Diogo Carvalho e Fabiano Junior

> **Sistema distribuído de monitoramento de crises e desastres naturais**

Sistema distribuído para monitorar crises e desastres naturais em tempo real. Recebe dados de sensores IoT (nível de rio, umidade do solo, deslocamento de encosta, temperatura de floresta), os replica para múltiplos serviços via fila BullMQ/Redis, persiste os dados brutos com Prisma/PostgreSQL e classifica cada leitura por severidade de risco usando um modelo de score baseado em regras.

## Arquitetura

```
┌─────────────────┐    POST /sensors/event    ┌──────────────────────┐
│  Sensor IoT /   │ ────────────────────────► │  Ingestion Service   │
│  Mock Script    │                           │  Fastify 5 + Zod     │
└─────────────────┘                           └──────────┬───────────┘
                                                         │ publishSensorEvent()
                                                         │ (publica em 2 filas)
                                          ┌──────────────┴──────────────┐
                                          ▼                             ▼
                                 ┌────────────────┐       ┌────────────────────┐
                                 │  sensor-events │       │ sensor-processing  │
                                 │  (BullMQ/Redis)│       │  (BullMQ/Redis)    │
                                 └───────┬────────┘       └────────┬───────────┘
                                         │ Worker.process()         │ Worker.process()
                                ┌────────▼────────┐      ┌─────────▼──────────┐
                                │   Persistence   │      │    Processing      │
                                │    Service      │      │     Service        │
                                │  BullMQ Worker  │      │  Score Engine +   │
                                │  + Prisma ORM   │      │  Alert Rules       │
                                └────────┬────────┘      └─────────┬──────────┘
                                         │                          │
                                  prisma.create()            prisma.create()
                                         │                          │
                                ┌────────▼──────────────────────────▼───┐
                                │            PostgreSQL 15              │
                                │  sensor_events    (dados brutos)      │
                                │  alert_assessments (scores + alertas) │
                                │  alert_rules       (regras config.)   │
                                └────────────────────┬──────────────────┘
                                                     │
                                          ┌──────────▼──────────┐
                                          │  GET /alerts        │
                                          │  GET /alerts/stats  │
                                          │  GET /alerts/:id    │
                                          └─────────────────────┘
```

## Estrutura do Projeto

```
civic-sync/
├── docker-compose.yml
├── .env.example
├── package.json               # Raiz do projeto (npm workspaces)
├── tsconfig.base.json         # Configuração compartilhada do TS (strict mode)
├── shared/
│   ├── types/                 # @civic-sync/types — Schemas Zod + SensorEvent + AlertAssessment
│   └── database/              # @civic-sync/database — Prisma schema centralizado + client
├── services/
│   ├── ingestion/             # @civic-sync/ingestion — Fastify REST API + rotas de alertas
│   ├── persistence/           # @civic-sync/persistence — BullMQ Worker (raw storage)
│   └── processing/            # @civic-sync/processing — BullMQ Worker (score + alertas)
└── scripts/
    └── mock-sensor.ts         # Simulação de sensores IoT (modo normal e modo crise)
```

## Guia Rápido de Execução

### 1. Pré-requisitos

- Node.js ≥ 18
- Docker + Docker Compose

### 2. Configurar Variáveis de Ambiente

Crie o arquivo `.env` a partir do exemplo:
```bash
cp .env.example .env
```

### 3. Iniciar Infraestrutura (PostgreSQL + Redis)

```bash
docker-compose up -d
```

Aguarde os serviços estarem saudáveis:
```bash
docker-compose ps
```

### 4. Instalar Dependências

No diretório raiz:
```bash
npm install
```

### 5. Rodar Migrações do Banco de Dados

```bash
npm run db:migrate
```

### 6. Iniciar os Serviços (Ingestão, Persistência e Processamento)

```bash
# Inicia os 3 serviços simultaneamente
npm run dev
```

### 7. Rodar o Simulador de Sensores

**Modo normal** — 1 evento/segundo com valores realistas:
```bash
npm run mock
```

**Modo crise** — valores extremos para demonstrar alertas críticos:
```bash
npm run mock:crisis
```

Saída esperada (modo crise):
```
[Mock] 🛰️  CIVIC-SYNC Mock Sensor Started
[Mock] Modo: ⚠️  CRISE
[Mock] 🚨 CRISIS MODE ATIVO — gerando valores extremos para demonstrar alertas críticos!

[Mock] ✅ #0001 | nivel_rio             |  13.42 m  | sensorId=0001 | jobId=1a2b3c4d
[Processing] 🔴 CRÍTICO  | score= 89/100 | Nível do rio em 13.42m — CRÍTICO: enchente iminente, evacuação necessária!
```

## Modelo de Score e Limiares

Cada leitura recebe um **score de 0–100** e uma classificação de **severidade**:

### `nivel_rio` (metros)

| Severidade | Faixa |
|---|---|
| 🟢 Normal  | 0 – 3 m |
| 🟡 Atenção | 3 – 6 m |
| 🟠 Alerta  | 6 – 10 m |
| 🔴 Crítico | > 10 m |

### `umidade_solo` (%)

| Severidade | Faixa |
|---|---|
| 🟢 Normal  | 40% – 80% |
| 🟡 Atenção | 25–40% ou 80–90% |
| 🟠 Alerta  | 10–25% ou 90–95% |
| 🔴 Crítico | < 10% ou > 95% |

### `deslocamento_encosta` (mm)

| Severidade | Faixa |
|---|---|
| 🟢 Normal  | 0 – 5 mm |
| 🟡 Atenção | 5 – 15 mm |
| 🟠 Alerta  | 15 – 30 mm |
| 🔴 Crítico | > 30 mm |

### `temperatura_floresta` (°C)

| Severidade | Faixa |
|---|---|
| 🟢 Normal  | 15 – 30 °C |
| 🟡 Atenção | 30 – 40 °C |
| 🟠 Alerta  | 40 – 50 °C |
| 🔴 Crítico | > 50 °C |

## Visualização dos Dados

### 1. Via Navegador (Prisma Studio) — Recomendado
```bash
npm run db:studio
```
Abra [http://localhost:5555](http://localhost:5555) no navegador. Explore as tabelas:
- `sensor_events` — dados brutos
- `alert_assessments` — alertas avaliados com score e severidade
- `alert_rules` — regras configuráveis

### 2. Via Terminal (psql)
```bash
docker exec -it civic_sync_postgres psql -U civicsync -d civicsync

-- Distribuição de alertas por severidade
SELECT severity, count(*) FROM alert_assessments GROUP BY severity ORDER BY count DESC;

-- Últimos 5 alertas críticos
SELECT sensor_type, value, unit, score, message
FROM alert_assessments
WHERE severity = 'critico'
ORDER BY processed_at DESC
LIMIT 5;

-- Sensor com maior score médio
SELECT sensor_id, sensor_type, round(avg(score)) as avg_score, count(*)
FROM alert_assessments
GROUP BY sensor_id, sensor_type
ORDER BY avg_score DESC
LIMIT 5;
```

## Referência da API

### `GET /health`

Retorna o status do serviço de ingestão.

```bash
curl http://localhost:3001/health
```

### `GET /sensors/types`

Retorna a lista de tipos de sensores suportados.

```bash
curl http://localhost:3001/sensors/types
```

### `POST /sensors/event`

Ingere uma leitura de sensor e enfileira para persistência e processamento.

```bash
curl -X POST http://localhost:3001/sensors/event \
  -H "Content-Type: application/json" \
  -d '{
    "sensorId": "a1b2c3d4-0001-4000-8000-000000000001",
    "sensorType": "nivel_rio",
    "value": 11.5,
    "unit": "m",
    "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'",
    "location": { "lat": -22.505, "lng": -43.178 }
  }'
```

**Resposta `202 Accepted`:**
```json
{ "status": "accepted", "jobId": "a1b2c3d4-0001-..." }
```

**Tipos de sensores:** `nivel_rio` | `umidade_solo` | `deslocamento_encosta` | `temperatura_floresta`

---

### `GET /alerts`

Lista alertas processados com filtros opcionais.

**Query params:** `severity`, `sensorType`, `limit` (default 50), `offset` (default 0)

```bash
# Todos os alertas recentes
curl http://localhost:3001/alerts

# Apenas alertas críticos
curl "http://localhost:3001/alerts?severity=critico"

# Alertas de nível de rio
curl "http://localhost:3001/alerts?sensorType=nivel_rio&limit=10"
```

**Resposta:**
```json
{
  "data": [...],
  "total": 142,
  "limit": 50,
  "offset": 0
}
```

---

### `GET /alerts/stats`

Retorna estatísticas agregadas dos alertas processados.

```bash
curl http://localhost:3001/alerts/stats
```

**Resposta:**
```json
{
  "total": 1024,
  "bySeverity": {
    "normal": 612,
    "atencao": 287,
    "alerta": 98,
    "critico": 27
  },
  "topSensors": [
    { "sensorId": "a1b2c3d4-...", "sensorType": "nivel_rio", "count": 87, "avgScore": 74 }
  ]
}
```

---

### `GET /alerts/:id`

Retorna um alerta específico por UUID.

```bash
curl http://localhost:3001/alerts/550e8400-e29b-41d4-a716-446655440000
```

---

### `GET /alerts/sensors/:sensorId`

Retorna alertas de um sensor específico.

```bash
curl "http://localhost:3001/alerts/sensors/a1b2c3d4-0001-4000-8000-000000000001?limit=20"
```

## Stack Tecnológica

- **API**: Fastify 5 + Zod
- **Fila**: BullMQ 5 + ioredis
- **ORM**: Prisma 6
- **Banco de Dados**: PostgreSQL 15 + Redis 7
- **Linguagem**: TypeScript 5 (Strict Mode)
- **Workspaces**: npm workspaces (monorepo)
