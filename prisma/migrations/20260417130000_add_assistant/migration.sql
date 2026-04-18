-- Assistant module: chat-style AI interface with configurable LLM provider,
-- persistent history, auto-summarization, tool-use, and matter-bridge tokens.

-- Enums
CREATE TYPE "AssistantProvider" AS ENUM ('OPENAI_COMPATIBLE', 'ANTHROPIC');
CREATE TYPE "AssistantMessageRole" AS ENUM ('SYSTEM', 'USER', 'ASSISTANT', 'TOOL');

-- Per-user settings
CREATE TABLE "assistant_settings" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" "AssistantProvider" NOT NULL DEFAULT 'OPENAI_COMPATIBLE',
  "baseUrl" TEXT NOT NULL DEFAULT 'https://api.openai.com/v1',
  "model" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  "summaryModel" TEXT,
  "apiKeyEncrypted" TEXT,
  "maxTokens" INTEGER NOT NULL DEFAULT 4096,
  "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
  "contextWindow" INTEGER NOT NULL DEFAULT 128000,
  "compactAtRatio" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
  "systemPrompt" TEXT,
  "toolsEnabled" BOOLEAN NOT NULL DEFAULT true,
  "mcpEnabled" BOOLEAN NOT NULL DEFAULT true,
  "disabledTools" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "assistant_settings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "assistant_settings_userId_key" ON "assistant_settings"("userId");
ALTER TABLE "assistant_settings"
  ADD CONSTRAINT "assistant_settings_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Conversations
CREATE TABLE "assistant_conversations" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL DEFAULT 'New conversation',
  "preview" TEXT,
  "pinned" BOOLEAN NOT NULL DEFAULT false,
  "archivedAt" TIMESTAMP(3),
  "messageCount" INTEGER NOT NULL DEFAULT 0,
  "tokenCount" INTEGER NOT NULL DEFAULT 0,
  "summarizedUpToMessageId" TEXT,
  "origin" TEXT NOT NULL DEFAULT 'web',
  "bridgeKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "assistant_conversations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "assistant_conversations_userId_updatedAt_idx"
  ON "assistant_conversations"("userId", "updatedAt");
CREATE INDEX "assistant_conversations_userId_archivedAt_idx"
  ON "assistant_conversations"("userId", "archivedAt");
CREATE INDEX "assistant_conversations_bridgeKey_idx"
  ON "assistant_conversations"("bridgeKey");
ALTER TABLE "assistant_conversations"
  ADD CONSTRAINT "assistant_conversations_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Messages
CREATE TABLE "assistant_messages" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "role" "AssistantMessageRole" NOT NULL,
  "content" TEXT NOT NULL,
  "toolCalls" JSONB,
  "toolCallId" TEXT,
  "promptTokens" INTEGER,
  "completionTokens" INTEGER,
  "totalTokens" INTEGER,
  "model" TEXT,
  "compacted" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "assistant_messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "assistant_messages_conversationId_createdAt_idx"
  ON "assistant_messages"("conversationId", "createdAt");
ALTER TABLE "assistant_messages"
  ADD CONSTRAINT "assistant_messages_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "assistant_conversations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Conversation summaries (auto-compaction)
CREATE TABLE "assistant_conversation_summaries" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "coveredUntil" TIMESTAMP(3) NOT NULL,
  "messageCount" INTEGER NOT NULL,
  "headline" TEXT,
  "summary" TEXT NOT NULL,
  "tokenCount" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "assistant_conversation_summaries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "assistant_conversation_summaries_conversationId_createdAt_idx"
  ON "assistant_conversation_summaries"("conversationId", "createdAt");
ALTER TABLE "assistant_conversation_summaries"
  ADD CONSTRAINT "assistant_conversation_summaries_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "assistant_conversations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Bridge tokens (matter-bridge / MCP)
CREATE TABLE "assistant_bridge_tokens" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "tokenPreview" TEXT NOT NULL,
  "scope" TEXT NOT NULL DEFAULT '*',
  "defaultConversationId" TEXT,
  "lastUsedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "assistant_bridge_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "assistant_bridge_tokens_tokenHash_key"
  ON "assistant_bridge_tokens"("tokenHash");
CREATE INDEX "assistant_bridge_tokens_userId_idx"
  ON "assistant_bridge_tokens"("userId");
ALTER TABLE "assistant_bridge_tokens"
  ADD CONSTRAINT "assistant_bridge_tokens_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
