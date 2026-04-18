-- Add Google Contacts (People API) sync fields to GoogleIntegration.
ALTER TABLE "google_integrations"
  ADD COLUMN "contactsSyncEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "lastContactsSyncAt" TIMESTAMP(3),
  ADD COLUMN "contactsSyncToken" TEXT;
