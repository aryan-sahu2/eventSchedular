-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('SCHEDULED', 'SENT', 'FAILED', 'RETRIED', 'PROCESSING');

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "send_at" TIMESTAMP(3) NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'SCHEDULED',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);
