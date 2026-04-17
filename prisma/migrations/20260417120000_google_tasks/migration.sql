-- Add Google Tasks config fields to google_integrations
ALTER TABLE "google_integrations"
  ADD COLUMN "tasksEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "defaultTaskListId" TEXT;

-- Create google_tasks table
CREATE TABLE "google_tasks" (
  "id" TEXT NOT NULL,
  "integrationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "journalEntryId" TEXT,
  "googleTaskId" TEXT NOT NULL,
  "googleListId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "notes" TEXT,
  "due" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'needsAction',
  "taskWebUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "google_tasks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "google_tasks_integrationId_googleTaskId_key"
  ON "google_tasks"("integrationId", "googleTaskId");
CREATE INDEX "google_tasks_userId_idx" ON "google_tasks"("userId");
CREATE INDEX "google_tasks_journalEntryId_idx" ON "google_tasks"("journalEntryId");

ALTER TABLE "google_tasks"
  ADD CONSTRAINT "google_tasks_integrationId_fkey"
  FOREIGN KEY ("integrationId") REFERENCES "google_integrations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "google_tasks"
  ADD CONSTRAINT "google_tasks_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "google_tasks"
  ADD CONSTRAINT "google_tasks_journalEntryId_fkey"
  FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Create google_task_people join table
CREATE TABLE "google_task_people" (
  "id" TEXT NOT NULL,
  "googleTaskId" TEXT NOT NULL,
  "personId" TEXT NOT NULL,

  CONSTRAINT "google_task_people_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "google_task_people_googleTaskId_personId_key"
  ON "google_task_people"("googleTaskId", "personId");
CREATE INDEX "google_task_people_personId_idx" ON "google_task_people"("personId");

ALTER TABLE "google_task_people"
  ADD CONSTRAINT "google_task_people_googleTaskId_fkey"
  FOREIGN KEY ("googleTaskId") REFERENCES "google_tasks"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "google_task_people"
  ADD CONSTRAINT "google_task_people_personId_fkey"
  FOREIGN KEY ("personId") REFERENCES "people"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
