# CIVIC-SYNC

> Alunos: Rafael Dedini, Nicolas Venciguerra, Caua Ferraz, Diogo Carvalho e Fabiano Junior

> **Sistema distribuído de monitoramento de crises e desastres naturais**

Sistema distribuído para monitorar crises e desastres naturais em tempo real. Recebe dados de sensores IoT (nível de rio, umidade do solo, deslocamento de encosta, temperatura de floresta) e os replica para múltiplos operadores via fila BullMQ/Redis e persistência PostgreSQL.

## Arquitetura

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

## Estrutura do Projeto

```
civic-sync/
├── docker-compose.yml
├── .env.example
├── package.json               # Raiz do projeto (npm workspaces)
├── tsconfig.base.json         # Configuração compartilhada do TS (strict mode)
├── shared/
│   └── types/                 # @civic-sync/types — Schemas Zod + SensorEvent
├── services/
│   ├── ingestion/             # @civic-sync/ingestion — Fastify REST API
│   └── persistence/           # @civic-sync/persistence — BullMQ Worker + Prisma
└── scripts/
    └── mock-sensor.ts         # Simulação de sensores IoT
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

### 6. Iniciar os Serviços (Ingestão e Persistência)

```bash
# Inicia ambos os serviços simultaneamente
npm run dev
```

### 7. Rodar o Simulador de Sensores (Mock)

Em um novo terminal:
```bash
npm run mock
```

Você verá a saída colorida com um evento por segundo:
```
[Mock] ✅ #0001 | river_level          |   7.43 m  | sensorId=0001 | jobId=1a2b3c4d
[Mock] ✅ #0002 | forest_temperature   |  42.18 °C | sensorId=0005 | jobId=2b3c4d5e
```

## Visualização dos Dados

Existem duas formas de verificar os dados persistidos:

### 1. Via Navegador (Prisma Studio) — Recomendado
Uma interface visual para explorar as tabelas do banco de dados.
```bash
npm run db:studio
```
Em seguida, abra [http://localhost:5555](http://localhost:5555) no seu navegador.

### 2. Via Terminal (psql)
Conectando diretamente ao container do PostgreSQL:
```bash
# Conectar ao banco
docker exec -it civic_sync_postgres psql -U civicsync -d civicsync

# Contar eventos persistidos
SELECT count(*) FROM sensor_events;

# Ver os últimos 5 eventos
SELECT id, sensor_id, sensor_type, value, unit, timestamp
FROM sensor_events
ORDER BY created_at DESC
LIMIT 5;
```

## Referência da API

### `POST /sensors/event`

Ingere uma leitura de sensor.

**Corpo da requisição:**
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

**Tipos de sensores:** `river_level` | `soil_moisture` | `slope_displacement` | `forest_temperature`

**Resposta `202 Accepted`:**
```json
{
  "status": "accepted",
  "jobId": "a1b2c3d4-0001-4000-8000-000000000001-2025-04-10T18:00:00.000Z"
}
```

### `GET /health`

Retorna o status dos serviços.

## Stack Tecnológica

- **API**: Fastify 5 + Zod
- **Fila**: BullMQ 5 + ioredis
- **ORM**: Prisma 6
- **Banco de Dados**: PostgreSQL 15 + Redis 7
- **Linguagem**: TypeScript 5 (Strict Mode)
