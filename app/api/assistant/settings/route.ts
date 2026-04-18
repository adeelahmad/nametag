// Get / update the user's Assistant settings. API keys are AES-GCM-encrypted
// using the same primitive as CardDAV credentials so we never store
// plaintext keys.

import { prisma } from '@/lib/prisma';
import {
  apiResponse,
  handleApiError,
  parseRequestBody,
  withAuth,
} from '@/lib/api-utils';
import { getOrCreateSettings, toView } from '@/lib/assistant/settings';
import { encryptApiKey } from '@/lib/assistant/secrets';
import { listTools } from '@/lib/assistant/tools';

export const GET = withAuth(async (_request, session) => {
  try {
    const settings = await getOrCreateSettings(session.user.id);
    const availableTools = listTools().map((t) => ({
      name: t.definition.name,
      description: t.definition.description,
    }));
    return apiResponse.ok({ settings: toView(settings), availableTools });
  } catch (error) {
    return handleApiError(error, 'GET /api/assistant/settings', {
      userId: session.user.id,
    });
  }
});

interface UpdateBody {
  provider?: 'OPENAI_COMPATIBLE' | 'ANTHROPIC';
  baseUrl?: string;
  model?: string;
  summaryModel?: string | null;
  apiKey?: string; // plaintext; empty string keeps, "<CLEAR>" removes
  maxTokens?: number;
  temperature?: number;
  contextWindow?: number;
  compactAtRatio?: number;
  systemPrompt?: string | null;
  toolsEnabled?: boolean;
  mcpEnabled?: boolean;
  disabledTools?: string[];
  searchProvider?: 'BRAVE' | 'TAVILY' | 'DUCKDUCKGO';
  searchApiKey?: string; // plaintext; empty keeps, "<CLEAR>" removes
  maxResearchSteps?: number;
  attachmentsMaxBytes?: number;
}

export const PATCH = withAuth(async (request, session) => {
  try {
    const body = await parseRequestBody<UpdateBody>(request);
    await getOrCreateSettings(session.user.id);

    const data: Record<string, unknown> = {};
    if (body.provider) data.provider = body.provider;
    if (typeof body.baseUrl === 'string') data.baseUrl = body.baseUrl.trim();
    if (typeof body.model === 'string') data.model = body.model.trim();
    if (body.summaryModel === null || typeof body.summaryModel === 'string')
      data.summaryModel = body.summaryModel ? body.summaryModel.trim() : null;
    if (typeof body.maxTokens === 'number')
      data.maxTokens = Math.min(200_000, Math.max(64, Math.floor(body.maxTokens)));
    if (typeof body.temperature === 'number')
      data.temperature = Math.min(2, Math.max(0, body.temperature));
    if (typeof body.contextWindow === 'number')
      data.contextWindow = Math.min(2_000_000, Math.max(1024, Math.floor(body.contextWindow)));
    if (typeof body.compactAtRatio === 'number')
      data.compactAtRatio = Math.min(0.95, Math.max(0.1, body.compactAtRatio));
    if (body.systemPrompt === null || typeof body.systemPrompt === 'string')
      data.systemPrompt = body.systemPrompt ? body.systemPrompt.slice(0, 10_000) : null;
    if (typeof body.toolsEnabled === 'boolean') data.toolsEnabled = body.toolsEnabled;
    if (typeof body.mcpEnabled === 'boolean') data.mcpEnabled = body.mcpEnabled;
    if (Array.isArray(body.disabledTools))
      data.disabledTools = body.disabledTools.filter((s) => typeof s === 'string').slice(0, 50);

    if (typeof body.apiKey === 'string') {
      if (body.apiKey === '<CLEAR>') {
        data.apiKeyEncrypted = null;
      } else if (body.apiKey.length > 0) {
        data.apiKeyEncrypted = encryptApiKey(body.apiKey);
      }
      // empty string -> leave as-is
    }

    if (body.searchProvider === 'BRAVE' || body.searchProvider === 'TAVILY' || body.searchProvider === 'DUCKDUCKGO') {
      data.searchProvider = body.searchProvider;
    }
    if (typeof body.searchApiKey === 'string') {
      if (body.searchApiKey === '<CLEAR>') {
        data.searchApiKeyEncrypted = null;
      } else if (body.searchApiKey.length > 0) {
        data.searchApiKeyEncrypted = encryptApiKey(body.searchApiKey);
      }
    }
    if (typeof body.maxResearchSteps === 'number') {
      data.maxResearchSteps = Math.min(12, Math.max(1, Math.floor(body.maxResearchSteps)));
    }
    if (typeof body.attachmentsMaxBytes === 'number') {
      data.attachmentsMaxBytes = Math.min(
        50 * 1024 * 1024,
        Math.max(1024, Math.floor(body.attachmentsMaxBytes)),
      );
    }

    const updated = await prisma.assistantSettings.update({
      where: { userId: session.user.id },
      data,
    });
    return apiResponse.ok({ settings: toView(updated) });
  } catch (error) {
    return handleApiError(error, 'PATCH /api/assistant/settings', {
      userId: session.user.id,
    });
  }
});
