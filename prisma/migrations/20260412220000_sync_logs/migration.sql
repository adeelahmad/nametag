-- CreateTable
CREATE TABLE "sync_logs" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "syncType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "newEmails" INTEGER NOT NULL DEFAULT 0,
    "matchedContacts" INTEGER NOT NULL DEFAULT 0,
    "attachments" INTEGER NOT NULL DEFAULT 0,
    "ocrProcessed" INTEGER NOT NULL DEFAULT 0,
    "calendarEvents" INTEGER NOT NULL DEFAULT 0,
    "errors" TEXT[],
    "duration" INTEGER,
    "triggeredBy" TEXT NOT NULL DEFAULT 'cron',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sync_logs_integrationId_createdAt_idx" ON "sync_logs"("integrationId", "createdAt");

-- AddForeignKey
ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "google_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
