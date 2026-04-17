import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import AssistantSettingsForm from '@/components/assistant/AssistantSettingsForm';
import AssistantTokensManager from '@/components/assistant/AssistantTokensManager';
import { getOrCreateSettings, toView } from '@/lib/assistant/settings';
import { listTools } from '@/lib/assistant/tools';
import { getAppUrl } from '@/lib/env';

export const dynamic = 'force-dynamic';

export default async function AssistantSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const settings = await getOrCreateSettings(session.user.id);
  const view = toView(settings);
  const availableTools = listTools().map((t) => ({
    name: t.definition.name,
    description: t.definition.description,
  }));

  const appUrl = getAppUrl();

  return (
    <div className="space-y-6">
      <div className="bg-surface shadow rounded-lg p-6">
        <h2 className="text-xl font-bold text-foreground mb-1">Assistant</h2>
        <p className="text-muted mb-6 text-sm">
          Configure the language model that powers your chat assistant. Any
          OpenAI-compatible endpoint works (OpenAI, OpenRouter, Groq, Azure,
          Ollama/LM Studio). You can also use the native Anthropic API.
        </p>
        <AssistantSettingsForm initial={view} availableTools={availableTools} />
      </div>

      <div className="bg-surface shadow rounded-lg p-6">
        <h3 className="text-lg font-semibold text-foreground mb-1">
          Bridge tokens
        </h3>
        <p className="text-muted mb-4 text-sm">
          Issue API tokens for matter-bridge, MCP clients, or scripts to chat
          as you. Tokens are shown once at creation and stored hashed.
        </p>
        <AssistantTokensManager />
        <div className="mt-6 text-xs text-muted space-y-1">
          <div>
            <strong>MCP endpoint:</strong>{' '}
            <code className="bg-surface-elevated px-1.5 py-0.5 rounded">
              {appUrl}/api/mcp
            </code>
          </div>
          <div>
            <strong>Matter-bridge webhook:</strong>{' '}
            <code className="bg-surface-elevated px-1.5 py-0.5 rounded">
              {appUrl}/api/assistant/bridge
            </code>
          </div>
          <div>
            Send <code>Authorization: Bearer &lt;token&gt;</code> with each
            request.
          </div>
        </div>
      </div>
    </div>
  );
}
