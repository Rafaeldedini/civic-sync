import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.production
dotenv.config({ path: path.resolve(process.cwd(), '.env.production') });

async function testSupabase() {
  console.log('\n--- Testando Supabase (PostgreSQL) ---');
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('❌ DATABASE_URL não está definida no arquivo .env.production');
    return false;
  }
  
  console.log(`Conectando ao Supabase em: ${dbUrl.split('@')[1] || dbUrl}`);
  
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: dbUrl,
      },
    },
  });

  try {
    const start = Date.now();
    const sensorEventsCount = await prisma.sensorEvent.count();
    const alertAssessmentsCount = await prisma.alertAssessment.count();
    const duration = Date.now() - start;
    
    console.log(`✅ Supabase conectado com sucesso! (Tempo: ${duration}ms)`);
    console.log(`   - Total de eventos de sensores cadastrados: ${sensorEventsCount}`);
    console.log(`   - Total de avaliações de alertas: ${alertAssessmentsCount}`);
    return true;
  } catch (error) {
    console.error('❌ Falha ao conectar no Supabase:', error);
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

async function testUpstashRedis() {
  console.log('\n--- Testando Upstash Redis ---');
  const host = process.env.REDIS_HOST;
  const port = process.env.REDIS_PORT;
  const password = process.env.REDIS_PASSWORD;
  const tls = process.env.REDIS_TLS === 'true';

  if (!host || !port) {
    console.error('❌ REDIS_HOST ou REDIS_PORT não definidos no arquivo .env.production');
    return false;
  }

  console.log(`Conectando ao Redis em: ${host}:${port} (TLS: ${tls})`);

  const redis = new Redis({
    host,
    port: Number(port),
    password: password || undefined,
    tls: tls ? {} : undefined,
    maxRetriesPerRequest: 1,
    connectTimeout: 5000,
  });

  try {
    const start = Date.now();
    const pingResponse = await redis.ping();
    const duration = Date.now() - start;
    
    if (pingResponse === 'PONG') {
      console.log(`✅ Upstash Redis conectado com sucesso! (Tempo: ${duration}ms)`);
      // Teste rápido de escrita/leitura
      await redis.set('civic_sync_test_key', 'funcionando', 'EX', 10);
      const val = await redis.get('civic_sync_test_key');
      console.log(`   - Teste de Escrita/Leitura: ${val === 'funcionando' ? 'Sucesso ✅' : 'Falhou ❌'}`);
      return true;
    } else {
      console.error(`❌ Resposta inesperada do Redis Ping: ${pingResponse}`);
      return false;
    }
  } catch (error) {
    console.error('❌ Falha ao conectar no Upstash Redis:', error);
    return false;
  } finally {
    redis.disconnect();
  }
}

async function main() {
  console.log('=== INICIANDO TESTE DE CONEXÃO COM A NUVEM ===');
  const dbOk = await testSupabase();
  const redisOk = await testUpstashRedis();
  
  console.log('\n=============================================');
  if (dbOk && redisOk) {
    console.log('🎉 TUDO PRONTO! Conexões Supabase e Upstash funcionando perfeitamente.');
    console.log('Agora você está pronto para subir as aplicações para o Railway.');
  } else {
    console.log('⚠️ Algumas conexões falharam. Verifique os erros e as credenciais no .env.production.');
  }
  console.log('=============================================\n');
}

main();
