-- CreateTable
CREATE TABLE "board_events" (
    "seq" BIGSERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "clientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "board_events_pkey" PRIMARY KEY ("seq")
);

-- CreateIndex
CREATE INDEX "board_events_createdAt_idx" ON "board_events"("createdAt");
