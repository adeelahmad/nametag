-- Phase 2 additions for the Assistant module:
-- * web-search provider config on AssistantSettings
-- * per-conversation model override + fork lineage
-- * AssistantAttachment (images/PDFs/text)
-- * AssistantShareLink (public read-only links)

-- Enums
CREATE TYPE "AssistantSearchProvider" AS ENUM ('BRAVE', 'TAVILY', 'DUCKDUCKGO');
CREATE TYPE "AssistantAttachmentKind" AS ENUM ('IMAGE', 'PDF', 'TEXT');

-- AssistantSettings: new columns
ALTER TABLE "assistant_settings"
  ADD COLUMN "searchProvider" "AssistantSearchProvider" NOT NULL DEFAULT 'DUCKDUCKGO',
  ADD COLUMN "searchApiKeyEncrypted" TEXT,
  ADD COLUMN "maxResearchSteps" INTEGER NOT NULL DEFAULT 6,
  ADD COLUMN "attachmentsMaxBytes" INTEGER NOT NULL DEFAULT 10485760;

-- AssistantConversation: model override + fork lineage
ALTER TABLE "assistant_conversations"
  ADD COLUMN "model" TEXT,
  ADD COLUMN "forkedFromId" TEXT,
  ADD COLUMN "forkedFromMessageId" TEXT;

ALTER TABLE "assistant_conversations"
  ADD CONSTRAINT "assistant_conversations_forkedFromId_fkey"
  FOREIGN KEY ("forkedFromId") REFERENCES "assistant_conversations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "assistant_conversations_userId_pinned_idx"
  ON "assistant_conversations"("userId", "pinned");
CREATE INDEX "assistant_conversations_forkedFromId_idx"
  ON "assistant_conversations"("forkedFromId");

-- AssistantAttachment
CREATE TABLE "assistant_attachments" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "conversationId" TEXT,
  "messageId" TEXT,
  "kind" "AssistantAttachmentKind" NOT NULL,
  "mimeType" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "storagePath" TEXT NOT NULL,
  "extractedText" TEXT,
  "sha256" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "assistant_attachments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "assistant_attachments_userId_sha256_key"
  ON "assistant_attachments"("userId", "sha256");
CREATE INDEX "assistant_attachments_userId_createdAt_idx"
  ON "assistant_attachments"("userId", "createdAt");
CREATE INDEX "assistant_attachments_conversationId_idx"
  ON "assistant_attachments"("conversationId");

ALTER TABLE "assistant_attachments"
  ADD CONSTRAINT "assistant_attachments_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assistant_attachments"
  ADD CONSTRAINT "assistant_attachments_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "assistant_conversations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- AssistantShareLink
CREATE TABLE "assistant_share_links" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "tokenPreview" TEXT NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "viewCount" INTEGER NOT NULL DEFAULT 0,
  "lastViewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "assistant_share_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "assistant_share_links_tokenHash_key"
  ON "assistant_share_links"("tokenHash");
CREATE INDEX "assistant_share_links_conversationId_idx"
  ON "assistant_share_links"("conversationId");
CREATE INDEX "assistant_share_links_userId_idx"
  ON "assistant_share_links"("userId");

ALTER TABLE "assistant_share_links"
  ADD CONSTRAINT "assistant_share_links_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assistant_share_links"
  ADD CONSTRAINT "assistant_share_links_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "assistant_conversations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
