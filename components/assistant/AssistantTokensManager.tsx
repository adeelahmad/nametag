'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';

interface TokenRow {
  id: string;
  name: string;
  scope: string;
  tokenPreview: string;
  defaultConversationId: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export default function AssistantTokensManager() {
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<'*' | 'mcp' | 'chat'>('*');
  const [loading, setLoading] = useState(false);
  const [issued, setIssued] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/assistant/tokens', { cache: 'no-store' });
    if (!res.ok) return;
    const data = (await res.json()) as { tokens: TokenRow[] };
    setTokens(data.tokens);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    if (!name.trim()) {
      toast.error('Enter a name for the token');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/assistant/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), scope }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { plaintext: string };
      setIssued(data.plaintext);
      setName('');
      load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const revoke = async (id: string) => {
    if (!confirm('Revoke this token?')) return;
    const res = await fetch(`/api/assistant/tokens/${id}`, { method: 'DELETE' });
    if (res.ok) load();
    else toast.error('Failed to revoke');
  };

  const copyIssued = () => {
    if (!issued) return;
    navigator.clipboard.writeText(issued).then(
      () => toast.success('Copied to clipboard'),
      () => toast.error('Copy failed'),
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium mb-1">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Matterbridge / Slack"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Scope</label>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as typeof scope)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          >
            <option value="*">All</option>
            <option value="chat">Chat / Bridge</option>
            <option value="mcp">MCP only</option>
          </select>
        </div>
        <Button onClick={create} disabled={loading}>
          Create token
        </Button>
      </div>

      {issued ? (
        <div className="rounded-lg border border-amber-400/50 bg-amber-500/10 p-3 text-sm space-y-2">
          <div className="font-medium">Copy your token — it won&apos;t be shown again.</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all bg-surface-elevated px-2 py-1 rounded">
              {issued}
            </code>
            <Button variant="secondary" size="sm" onClick={copyIssued}>
              Copy
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setIssued(null)}>
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}

      <div>
        {tokens.length === 0 ? (
          <div className="text-xs text-muted">No tokens yet.</div>
        ) : (
          <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
            {tokens.map((t) => (
              <li key={t.id} className="px-3 py-2 flex items-center gap-3 text-sm">
                <div className="flex-1">
                  <div className="font-medium">{t.name}</div>
                  <div className="text-xs text-muted font-mono">
                    {t.tokenPreview} · scope: {t.scope} · created {new Date(t.createdAt).toLocaleDateString()}
                    {t.lastUsedAt ? ` · last used ${new Date(t.lastUsedAt).toLocaleDateString()}` : ' · never used'}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => revoke(t.id)}>
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
