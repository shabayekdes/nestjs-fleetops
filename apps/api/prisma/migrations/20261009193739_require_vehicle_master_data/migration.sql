/*
  Warnings:

  - You are about to drop the column `make` on the `vehicles` table. All the data in the column will be lost.
  - You are about to drop the column `model` on the `vehicles` table. All the data in the column will be lost.
  - Made the column `make_id` on table `vehicles` required. This step will fail if there are existing NULL values in that column.
  - Made the column `model_id` on table `vehicles` required. This step will fail if there are existing NULL values in that column.
  - Made the column `vehicle_type_id` on table `vehicles` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "vehicles" DROP COLUMN "make",
DROP COLUMN "model",
ALTER COLUMN "make_id" SET NOT NULL,
ALTER COLUMN "model_id" SET NOT NULL,
ALTER COLUMN "vehicle_type_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "vehicles_organization_id_vehicle_type_id_idx" ON "vehicles"("organization_id", "vehicle_type_id");

-- hand-written: redundant once make_id and model_id are both NOT NULL
ALTER TABLE "vehicles" DROP CONSTRAINT "vehicles_model_requires_make";
