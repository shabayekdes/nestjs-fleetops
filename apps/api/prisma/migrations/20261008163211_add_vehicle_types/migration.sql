-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "vehicle_type_id" UUID;

-- CreateTable
CREATE TABLE "vehicle_types" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicle_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_types_name_key" ON "vehicle_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_types_slug_key" ON "vehicle_types"("slug");

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_vehicle_type_id_fkey" FOREIGN KEY ("vehicle_type_id") REFERENCES "vehicle_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
