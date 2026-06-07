import Fastify, { type FastifyInstance } from 'fastify';
import { createLogger } from '@civic-sync/logger';

const log = createLogger('gateway');

interface ServerConfig {
  url: string;
  healthy: boolean;
  instanceId: string;
  lastCheck: string | null;
  error: string | null;
}

export async function buildGateway(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    },
  });

  // Enable CORS manually to avoid conflicts with wildcard route proxying
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    reply.header('Access-Control-Allow-Headers', '*');
    
    if (request.method === 'OPTIONS') {
      return reply.status(204).send();
    }
  });

  // Remove default parsers to allow wildcard buffer parser to handle everything (including application/json)
  app.removeAllContentTypeParsers();

  // Fallback body parser to read raw request body as Buffer and proxy it as-is
  app.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, done) => {
    done(null, body);
  });

  const servers: ServerConfig[] = [
    {
      url: process.env.INGESTION_A_URL ?? 'http://127.0.0.1:3001',
      healthy: false,
      instanceId: 'A',
      lastCheck: null,
      error: null,
    },
    {
      url: process.env.INGESTION_B_URL ?? 'http://127.0.0.1:3002',
      healthy: false,
      instanceId: 'B',
      lastCheck: null,
      error: null,
    },
  ];

  let nextServerIdx = 0;

  // Health check worker
  async function checkHealth() {
    for (const server of servers) {
      try {
        const res = await fetch(`${server.url}/health`, { signal: AbortSignal.timeout(2000) });
        server.lastCheck = new Date().toISOString();
        if (res.ok) {
          const body = await res.json() as any;
          server.healthy = true;
          server.instanceId = body.instanceId ?? server.instanceId;
          server.error = null;
        } else {
          server.healthy = false;
          server.error = `HTTP ${res.status}`;
        }
      } catch (err) {
        server.healthy = false;
        server.lastCheck = new Date().toISOString();
        server.error = (err as Error).message;
      }
    }
  }

  // Run initial check and set up periodic heartbeat
  await checkHealth();
  const intervalTime = Number(process.env.HEARTBEAT_INTERVAL ?? 3000);
  const timer = setInterval(checkHealth, intervalTime);

  // Clear interval on server close
  app.addHook('onClose', async () => {
    clearInterval(timer);
  });

  // Gateway status endpoint for the dashboard
  app.get('/gateway/status', async (_request, reply) => {
    const healthyServers = servers.filter(s => s.healthy);
    let activeInstance = 'none';
    if (healthyServers.length > 0) {
      const selected = healthyServers[nextServerIdx % healthyServers.length];
      activeInstance = selected.instanceId;
    }

    return reply.send({
      servers,
      activeInstance,
    });
  });

  // Catch-all route to proxy to healthy Ingestion servers
  app.all('*', async (request, reply) => {
    const method = request.method;
    const urlPath = request.url;

    let healthyServers = servers.filter(s => s.healthy);
    if (healthyServers.length === 0) {
      // Quick fallback check if all were marked down
      await checkHealth();
      healthyServers = servers.filter(s => s.healthy);
      if (healthyServers.length === 0) {
        return reply.status(503).send({
          error: 'Service Unavailable',
          message: 'No healthy ingestion servers available.',
        });
      }
    }

    // Select ingestion server using round-robin
    const selectedServer = healthyServers[nextServerIdx % healthyServers.length];
    nextServerIdx = (nextServerIdx + 1) % healthyServers.length;

    const targetUrl = `${selectedServer.url}${urlPath}`;
    log.info(`Proxying ${method} ${urlPath} -> ${targetUrl} (Instance ${selectedServer.instanceId})`);

    // Prepare proxy headers
    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      if (key.toLowerCase() !== 'host') {
        if (typeof value === 'string') {
          headers.append(key, value);
        } else if (Array.isArray(value)) {
          for (const v of value) {
            headers.append(key, v);
          }
        }
      }
    }

    const rawBody = request.body;
    let bodyToSend: any = undefined;
    if (rawBody !== undefined && rawBody !== null) {
      if (Buffer.isBuffer(rawBody)) {
        bodyToSend = rawBody.length > 0 ? rawBody : undefined;
      } else if (typeof rawBody === 'object') {
        bodyToSend = JSON.stringify(rawBody);
      } else if (typeof rawBody === 'string') {
        bodyToSend = rawBody.length > 0 ? rawBody : undefined;
      }
    }

    try {
      const res = await fetch(targetUrl, {
        method,
        headers,
        body: bodyToSend,
        signal: AbortSignal.timeout(5000),
      });

      // Forward response headers (excluding transfer-encoding)
      res.headers.forEach((value, key) => {
        if (key.toLowerCase() !== 'transfer-encoding') {
          reply.header(key, value);
        }
      });

      // Add custom header to show which instance responded
      reply.header('X-Ingestion-Instance', selectedServer.instanceId);

      const resBody = await res.arrayBuffer();
      return reply.status(res.status).send(Buffer.from(resBody));

    } catch (err) {
      log.error(err, `Failed to proxy to ${targetUrl}`);
      // Temporarily mark server as unhealthy and try failover immediately
      selectedServer.healthy = false;
      selectedServer.error = (err as Error).message;

      const otherHealthyServers = servers.filter(s => s.healthy);
      if (otherHealthyServers.length > 0) {
        const failoverServer = otherHealthyServers[0];
        const failoverUrl = `${failoverServer.url}${urlPath}`;
        log.info(`Failover: Retrying proxy to ${failoverUrl} (Instance ${failoverServer.instanceId})`);
        try {
          const res = await fetch(failoverUrl, {
            method,
            headers,
            body: bodyToSend,
            signal: AbortSignal.timeout(5000),
          });

          res.headers.forEach((value, key) => {
            if (key.toLowerCase() !== 'transfer-encoding') {
              reply.header(key, value);
            }
          });
          reply.header('X-Ingestion-Instance', failoverServer.instanceId);

          const resBody = await res.arrayBuffer();
          return reply.status(res.status).send(Buffer.from(resBody));
        } catch (failoverErr) {
          log.error(failoverErr, `Failover failed for ${failoverUrl}`);
          failoverServer.healthy = false;
          failoverServer.error = (failoverErr as Error).message;
        }
      }

      return reply.status(503).send({
        error: 'Service Unavailable',
        message: 'Failed to proxy request. Ingestion service did not respond.',
      });
    }
  });

  return app;
}
