// Per-user assistant settings: load, auto-create defaults, and surface a
// decrypted, UI-safe view (without the raw API key). A single `getSettings`
// entry point is used by every API route and server action so policy stays
// consistent.

import { prisma } from '@/lib/prisma';
import type { AssistantSettings as DbSettings } from '@prisma/client';
import { decryptApiKey } from './secrets';

export const DEFAULT_SYSTEM_PROMPT = `You are Nametag Assistant, embedded in a personal relationship manager app. \
Help the user query, update, and organize their contacts, groups, journal entries, \
emails, and upcoming events. Prefer calling available tools over asking for \
information you can look up yourself. When updating data, summarize what you did. \
Dates are in ISO-8601 unless the user specifies otherwise. Never fabricate IDs.`;

export interface AssistantSettingsView {
  provider: DbSettings['provider'];
  baseUrl: string;
  model: string;
  summaryModel: string | null;
  hasApiKey: boolean;
  maxTokens: number;
  temperature: number;
  contextWindow: number;
  compactAtRatio: number;
  systemPrompt: string | null;
  toolsEnabled: boolean;
  mcpEnabled: boolean;
  disabledTools: string[];
  searchProvider: DbSettings['searchProvider'];
  hasSearchApiKey: boolean;
  maxResearchSteps: number;
  attachmentsMaxBytes: number;
}

export function toView(s: DbSettings): AssistantSettingsView {
  return {
    provider: s.provider,
    baseUrl: s.baseUrl,
    model: s.model,
    summaryModel: s.summaryModel,
    hasApiKey: !!s.apiKeyEncrypted,
    maxTokens: s.maxTokens,
    temperature: s.temperature,
    contextWindow: s.contextWindow,
    compactAtRatio: s.compactAtRatio,
    systemPrompt: s.systemPrompt,
    toolsEnabled: s.toolsEnabled,
    mcpEnabled: s.mcpEnabled,
    disabledTools: s.disabledTools,
    searchProvider: s.searchProvider,
    hasSearchApiKey: !!s.searchApiKeyEncrypted,
    maxResearchSteps: s.maxResearchSteps,
    attachmentsMaxBytes: s.attachmentsMaxBytes,
  };
}

export async function getOrCreateSettings(userId: string): Promise<DbSettings> {
  const existing = await prisma.assistantSettings.findUnique({ where: { userId } });
  if (existing) return existing;
  return prisma.assistantSettings.create({ data: { userId } });
}

export async function getDecryptedApiKey(userId: string): Promise<string | undefined> {
  const s = await prisma.assistantSettings.findUnique({
    where: { userId },
    select: { apiKeyEncrypted: true },
  });
  if (!s?.apiKeyEncrypted) return undefined;
  try {
    return decryptApiKey(s.apiKeyEncrypted);
  } catch {
    return undefined;
  }
}

export async function getDecryptedSearchKey(userId: string): Promise<string | undefined> {
  const s = await prisma.assistantSettings.findUnique({
    where: { userId },
    select: { searchApiKeyEncrypted: true },
  });
  if (!s?.searchApiKeyEncrypted) return undefined;
  try {
    return decryptApiKey(s.searchApiKeyEncrypted);
  } catch {
    return undefined;
  }
}

export function resolveSystemPrompt(s: DbSettings): string {
  const custom = s.systemPrompt?.trim();
  if (custom) return `${DEFAULT_SYSTEM_PROMPT}\n\n${custom}`;
  return DEFAULT_SYSTEM_PROMPT;
}
