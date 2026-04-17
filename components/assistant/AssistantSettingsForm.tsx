'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import type { SettingsView } from './types';

interface AvailableTool {
  name: string;
  description: string;
}

interface Props {
  initial: SettingsView;
  availableTools: AvailableTool[];
}

const PROVIDER_PRESETS: Record<
  string,
  { label: string; baseUrl: string; model: string; provider: SettingsView['provider'] }
> = {
  openai: {
    label: 'OpenAI',
    provider: 'OPENAI_COMPATIBLE',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  },
  openrouter: {
    label: 'OpenRouter',
    provider: 'OPENAI_COMPATIBLE',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'anthropic/claude-3.5-sonnet',
  },
  groq: {
    label: 'Groq',
    provider: 'OPENAI_COMPATIBLE',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
  },
  ollama: {
    label: 'Ollama (local)',
    provider: 'OPENAI_COMPATIBLE',
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3.1',
  },
  anthropic: {
    label: 'Anthropic',
    provider: 'ANTHROPIC',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-5',
  },
};

export default function AssistantSettingsForm({ initial, availableTools }: Props) {
  const [form, setForm] = useState<SettingsView & { apiKey: string }>({
    ...initial,
    apiKey: '',
  });
  const [saving, setSaving] = useState(false);

  const applyPreset = (key: keyof typeof PROVIDER_PRESETS) => {
    const p = PROVIDER_PRESETS[key];
    setForm((f) => ({ ...f, provider: p.provider, baseUrl: p.baseUrl, model: p.model }));
  };

  const toggleTool = (name: string) => {
    setForm((f) => {
      const disabled = new Set(f.disabledTools);
      if (disabled.has(name)) disabled.delete(name);
      else disabled.add(name);
      return { ...f, disabledTools: Array.from(disabled) };
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        provider: form.provider,
        baseUrl: form.baseUrl,
        model: form.model,
        summaryModel: form.summaryModel,
        maxTokens: form.maxTokens,
        temperature: form.temperature,
        contextWindow: form.contextWindow,
        compactAtRatio: form.compactAtRatio,
        systemPrompt: form.systemPrompt,
        toolsEnabled: form.toolsEnabled,
        mcpEnabled: form.mcpEnabled,
        disabledTools: form.disabledTools,
      };
      if (form.apiKey) body.apiKey = form.apiKey;

      const res = await fetch('/api/assistant/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      toast.success('Settings saved');
      setForm((f) => ({ ...f, apiKey: '' }));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const clearApiKey = async () => {
    if (!confirm('Remove the saved API key?')) return;
    const res = await fetch('/api/assistant/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: '<CLEAR>' }),
    });
    if (res.ok) {
      toast.success('API key cleared');
      setForm((f) => ({ ...f, hasApiKey: false, apiKey: '' }));
    } else {
      toast.error('Failed to clear key');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium mb-2">Quick presets</label>
        <div className="flex flex-wrap gap-2">
          {Object.entries(PROVIDER_PRESETS).map(([key, preset]) => (
            <button
              key={key}
              type="button"
              onClick={() => applyPreset(key as keyof typeof PROVIDER_PRESETS)}
              className="px-3 py-1.5 text-xs rounded-md border border-border bg-surface-elevated hover:border-primary"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Provider</label>
          <select
            value={form.provider}
            onChange={(e) =>
              setForm({
                ...form,
                provider: e.target.value as SettingsView['provider'],
              })
            }
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          >
            <option value="OPENAI_COMPATIBLE">OpenAI-compatible</option>
            <option value="ANTHROPIC">Anthropic</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Model</label>
          <input
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            placeholder="gpt-4o-mini"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium mb-1">Base URL</label>
          <input
            value={form.baseUrl}
            onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-mono"
            placeholder="https://api.openai.com/v1"
          />
          <p className="text-xs text-muted mt-1">
            Any OpenAI chat-completions endpoint, or{' '}
            <code>https://api.anthropic.com</code> for Anthropic.
          </p>
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium mb-1">
            API key {form.hasApiKey ? <span className="text-xs text-muted">(saved)</span> : null}
          </label>
          <div className="flex gap-2">
            <input
              type="password"
              value={form.apiKey}
              onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
              placeholder={form.hasApiKey ? '•••••••• (leave blank to keep)' : 'sk-…'}
              className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-mono"
            />
            {form.hasApiKey && (
              <Button type="button" variant="secondary" size="sm" onClick={clearApiKey}>
                Clear
              </Button>
            )}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Max tokens / reply</label>
          <input
            type="number"
            min={64}
            max={200_000}
            value={form.maxTokens}
            onChange={(e) =>
              setForm({ ...form, maxTokens: Number(e.target.value) || 4096 })
            }
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Temperature</label>
          <input
            type="number"
            step="0.05"
            min={0}
            max={2}
            value={form.temperature}
            onChange={(e) =>
              setForm({ ...form, temperature: Number(e.target.value) })
            }
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Context window</label>
          <input
            type="number"
            min={1024}
            step={1024}
            value={form.contextWindow}
            onChange={(e) =>
              setForm({
                ...form,
                contextWindow: Number(e.target.value) || 128_000,
              })
            }
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          />
          <p className="text-xs text-muted mt-1">
            Used to decide when to auto-compact.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Auto-compact ratio</label>
          <input
            type="number"
            step="0.05"
            min={0.1}
            max={0.95}
            value={form.compactAtRatio}
            onChange={(e) =>
              setForm({ ...form, compactAtRatio: Number(e.target.value) })
            }
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium mb-1">Summary model (optional)</label>
          <input
            value={form.summaryModel ?? ''}
            onChange={(e) =>
              setForm({ ...form, summaryModel: e.target.value || null })
            }
            placeholder="Same as primary model"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium mb-1">Custom system prompt</label>
          <textarea
            rows={4}
            value={form.systemPrompt ?? ''}
            onChange={(e) =>
              setForm({ ...form, systemPrompt: e.target.value || null })
            }
            placeholder="Appended to the default persona."
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-mono"
          />
        </div>
      </div>

      <div className="flex items-center gap-6">
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.toolsEnabled}
            onChange={(e) => setForm({ ...form, toolsEnabled: e.target.checked })}
          />
          Enable tool use
        </label>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.mcpEnabled}
            onChange={(e) => setForm({ ...form, mcpEnabled: e.target.checked })}
          />
          Expose MCP endpoint
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Available tools</label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {availableTools.map((t) => {
            const disabled = form.disabledTools.includes(t.name);
            return (
              <label
                key={t.name}
                className={`flex items-start gap-2 p-2 rounded border cursor-pointer ${
                  disabled ? 'border-border opacity-60' : 'border-border bg-surface-elevated'
                }`}
              >
                <input
                  type="checkbox"
                  checked={!disabled}
                  onChange={() => toggleTool(t.name)}
                  className="mt-0.5"
                />
                <div>
                  <div className="text-sm font-mono">{t.name}</div>
                  <div className="text-xs text-muted">{t.description}</div>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
