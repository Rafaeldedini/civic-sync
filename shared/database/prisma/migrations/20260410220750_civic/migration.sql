-- CreateTable
CREATE TABLE "sensor_events" (
    "id" UUID NOT NULL,
    "sensor_id" TEXT NOT NULL,
    "sensor_type" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "location_lat" DOUBLE PRECISION NOT NULL,
    "location_lng" DOUBLE PRECISION NOT NULL,
    "raw_payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sensor_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sensor_events_sensor_id_idx" ON "sensor_events"("sensor_id");

-- CreateIndex
CREATE INDEX "sensor_events_sensor_type_idx" ON "sensor_events"("sensor_type");

-- CreateIndex
CREATE INDEX "sensor_events_timestamp_idx" ON "sensor_events"("timestamp");
