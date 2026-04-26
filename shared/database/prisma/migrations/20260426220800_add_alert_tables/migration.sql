-- CreateTable
CREATE TABLE "alert_assessments" (
    "id" UUID NOT NULL,
    "sensor_event_id" UUID,
    "sensor_id" TEXT NOT NULL,
    "sensor_type" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "thresholds" JSONB NOT NULL,
    "location" JSONB NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_rules" (
    "id" UUID NOT NULL,
    "sensor_type" TEXT NOT NULL,
    "thresholds" JSONB NOT NULL,
    "unit" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alert_assessments_severity_idx" ON "alert_assessments"("severity");

-- CreateIndex
CREATE INDEX "alert_assessments_sensor_type_idx" ON "alert_assessments"("sensor_type");

-- CreateIndex
CREATE INDEX "alert_assessments_sensor_id_idx" ON "alert_assessments"("sensor_id");

-- CreateIndex
CREATE INDEX "alert_assessments_timestamp_idx" ON "alert_assessments"("timestamp");

-- CreateIndex
CREATE INDEX "alert_assessments_score_idx" ON "alert_assessments"("score");

-- CreateIndex
CREATE UNIQUE INDEX "alert_rules_sensor_type_key" ON "alert_rules"("sensor_type");
