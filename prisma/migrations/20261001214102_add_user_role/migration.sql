-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('ADMIN', 'MANAGER', 'DRIVER');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "role" "user_role" NOT NULL DEFAULT 'DRIVER';
