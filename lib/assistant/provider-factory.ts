// Build an LlmProvider from a user's stored settings. Kept separate so tests
// and background workers can inject a mock provider easily.

import type { AssistantSettings } from '@prisma/client';
import type { LlmProvider } from './types';
import { createOpenAiCompatibleProvider } from './providers/openai';
import { createAnthropicProvider } from './providers/anthropic';

export function buildProvider(
  settings: AssistantSettings,
  apiKey?: string,
): LlmProvider {
  if (settings.provider === 'ANTHROPIC') {
    return createAnthropicProvider({
      baseUrl: settings.baseUrl || 'https://api.anthropic.com',
      apiKey,
    });
  }
  return createOpenAiCompatibleProvider({
    baseUrl: settings.baseUrl || 'https://api.openai.com/v1',
    apiKey,
  });
}
