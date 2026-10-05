-- CreateEnum
CREATE TYPE "vehicle_service_status" AS ENUM ('UNKNOWN', 'OK', 'DUE_SOON', 'OVERDUE');

-- CreateEnum
CREATE TYPE "maintenance_type" AS ENUM ('OIL_CHANGE', 'TIRES', 'BRAKES', 'INSPECTION', 'REPAIR', 'OTHER');

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "next_service_due_on" DATE,
ADD COLUMN     "service_status" "vehicle_service_status" NOT NULL DEFAULT 'UNKNOWN';

-- CreateTable
CREATE TABLE "maintenance_records" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "type" "maintenance_type" NOT NULL,
    "description" TEXT,
    "vendor" TEXT,
    "performed_on" DATE NOT NULL,
    "odometer_km" INTEGER,
    "cost" DECIMAL(12,2) NOT NULL,
    "next_service_due_on" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "maintenance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fuel_logs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "fueled_on" DATE NOT NULL,
    "liters" DECIMAL(8,3) NOT NULL,
    "total_cost" DECIMAL(12,2) NOT NULL,
    "odometer_km" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "fuel_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "maintenance_records_organization_id_vehicle_id_performed_on_idx" ON "maintenance_records"("organization_id", "vehicle_id", "performed_on");

-- CreateIndex
CREATE INDEX "fuel_logs_organization_id_vehicle_id_fueled_on_idx" ON "fuel_logs"("organization_id", "vehicle_id", "fueled_on");

-- AddForeignKey
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_logs" ADD CONSTRAINT "fuel_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_logs" ADD CONSTRAINT "fuel_logs_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
