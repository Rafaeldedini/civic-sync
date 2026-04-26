import { type AlertAssessment, type AlertSeverity } from '@civic-sync/types';
import { prisma } from '@civic-sync/database';

// ─── Save ─────────────────────────────────────────────────────────────────────

/**
 * Persists an AlertAssessment to the database.
 * Returns the created record's id.
 */
export async function saveAlertAssessment(
  assessment: AlertAssessment,
): Promise<string> {
  const record = await prisma.alertAssessment.create({
    data: {
      sensorEventId: assessment.sensorEventId ?? null,
      sensorId: assessment.sensorId,
      sensorType: assessment.sensorType,
      value: assessment.value,
      unit: assessment.unit,
      severity: assessment.severity,
      score: assessment.score,
      message: assessment.message,
      thresholds: assessment.thresholds as object,
      location: assessment.location as object,
      timestamp: new Date(assessment.timestamp),
    },
  });

  return record.id;
}

// ─── Query helpers ────────────────────────────────────────────────────────────

export async function getRecentAlerts(limit = 50) {
  return prisma.alertAssessment.findMany({
    orderBy: { processedAt: 'desc' },
    take: limit,
  });
}

export async function getAlertsBySeverity(severity: AlertSeverity, limit = 50) {
  return prisma.alertAssessment.findMany({
    where: { severity },
    orderBy: { processedAt: 'desc' },
    take: limit,
  });
}

export async function getAlertsBySensor(sensorId: string, limit = 50) {
  return prisma.alertAssessment.findMany({
    where: { sensorId },
    orderBy: { processedAt: 'desc' },
    take: limit,
  });
}

export async function getAlertById(id: string) {
  return prisma.alertAssessment.findUnique({ where: { id } });
}

export async function getAlertStats() {
  const [total, bySeverity, topSensors] = await Promise.all([
    prisma.alertAssessment.count(),

    prisma.alertAssessment.groupBy({
      by: ['severity'],
      _count: { severity: true },
    }),

    prisma.alertAssessment.groupBy({
      by: ['sensorId', 'sensorType'],
      _count: { sensorId: true },
      _avg: { score: true },
      orderBy: { _avg: { score: 'desc' } },
      take: 5,
    }),
  ]);

  const severityCounts = Object.fromEntries(
    bySeverity.map((row) => [row.severity, row._count.severity]),
  ) as Record<string, number>;

  return {
    total,
    bySeverity: {
      normal:  severityCounts['normal']  ?? 0,
      atencao: severityCounts['atencao'] ?? 0,
      alerta:  severityCounts['alerta']  ?? 0,
      critico: severityCounts['critico'] ?? 0,
    },
    topSensors: topSensors.map((s) => ({
      sensorId: s.sensorId,
      sensorType: s.sensorType,
      count: s._count.sensorId,
      avgScore: Math.round(s._avg.score ?? 0),
    })),
  };
}
