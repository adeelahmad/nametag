-- AlterTable: Add configurable Drive folder name and Calendar sync fields
ALTER TABLE "google_integrations" ADD COLUMN "driveFolderName" TEXT NOT NULL DEFAULT 'Nametag';
ALTER TABLE "google_integrations" ADD COLUMN "calendarSyncEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "google_integrations" ADD COLUMN "birthdayCalendarId" TEXT;
ALTER TABLE "google_integrations" ADD COLUMN "lastCalendarSyncAt" TIMESTAMP(3);
