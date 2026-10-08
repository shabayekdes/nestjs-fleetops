-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "make_id" UUID,
ADD COLUMN     "model_id" UUID;

-- CreateTable
CREATE TABLE "vehicle_makes" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicle_makes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_models" (
    "id" UUID NOT NULL,
    "make_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicle_models_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_makes_name_key" ON "vehicle_makes"("name");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_makes_slug_key" ON "vehicle_makes"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_models_make_id_name_key" ON "vehicle_models"("make_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_models_make_id_slug_key" ON "vehicle_models"("make_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_models_make_id_id_key" ON "vehicle_models"("make_id", "id");

-- CreateIndex
CREATE INDEX "vehicles_organization_id_make_id_model_id_idx" ON "vehicles"("organization_id", "make_id", "model_id");

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_make_id_fkey" FOREIGN KEY ("make_id") REFERENCES "vehicle_makes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_make_id_model_id_fkey" FOREIGN KEY ("make_id", "model_id") REFERENCES "vehicle_models"("make_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_models" ADD CONSTRAINT "vehicle_models_make_id_fkey" FOREIGN KEY ("make_id") REFERENCES "vehicle_makes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddCheckConstraint (hand-written: Prisma cannot express CHECK constraints)
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_model_requires_make"
  CHECK ("model_id" IS NULL OR "make_id" IS NOT NULL);
