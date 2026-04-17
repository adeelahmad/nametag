'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import type { ShareLinkView } from './types';

interface Props {
  conversationId: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function ShareDialog({ conversationId, isOpen, onClose }: Props) {
  const [links, setLinks] = useState<ShareLinkView[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [lastToken, setLastToken] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/assistant/conversations/${conversationId}/share`,
        { cache: 'no-store' },
      );
      if (res.ok) {
        const data = (await res.json()) as { links: ShareLinkView[] };
        setLinks(data.links);
      }
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    if (isOpen) {
      setLastToken(null);
      load();
    }
  }, [isOpen, load]);

  const mint = async () => {
    setCreating(true);
    try {
      const res = await fetch(
        `/api/assistant/conversations/${conversationId}/share`,
        { method: 'POST' },
      );
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { token: string; link: ShareLinkView };
      setLastToken(data.token);
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (linkId: string) => {
    if (!confirm('Revoke this share link?')) return;
    const res = await fetch(
      `/api/assistant/conversations/${conversationId}/share/${linkId}`,
      { method: 'DELETE' },
    );
    if (res.ok) {
      await load();
    } else {
      toast.error('Failed to revoke');
    }
  };

  const shareUrl = (token: string) =>
    typeof window !== 'undefined'
      ? `${window.location.origin}/assistant/share/${token}`
      : `/assistant/share/${token}`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Share this conversation" size="md">
      <div className="space-y-4">
        <p className="text-sm text-muted">
          A share link lets anyone with the URL read a snapshot of this
          conversation. Tool calls and results are hidden in the public view.
        </p>

        {lastToken ? (
          <div className="rounded-md border border-primary/40 bg-primary/5 p-3 space-y-2">
            <div className="text-xs font-medium">Your new share link (shown once):</div>
            <div className="flex gap-2">
              <input
                readOnly
                value={shareUrl(lastToken)}
                className="flex-1 text-xs font-mono rounded border border-border bg-surface px-2 py-1.5"
                onFocus={(e) => e.target.select()}
              />
              <Button
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(shareUrl(lastToken)).then(
                    () => toast.success('Copied'),
                    () => toast.error('Copy failed'),
                  );
                }}
              >
                Copy
              </Button>
            </div>
          </div>
        ) : null}

        <div>
          <Button onClick={mint} disabled={creating}>
            {creating ? 'Creating…' : 'Create share link'}
          </Button>
        </div>

        <div>
          <div className="text-xs font-medium text-muted mb-2">Active links</div>
          {loading ? (
            <div className="text-xs text-muted">Loading…</div>
          ) : links.length === 0 ? (
            <div className="text-xs text-muted">No share links yet.</div>
          ) : (
            <ul className="space-y-2">
              {links.map((l) => (
                <li
                  key={l.id}
                  className="flex items-center justify-between gap-3 p-2 rounded border border-border bg-surface-elevated"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-mono truncate">{l.tokenPreview}…</div>
                    <div className="text-[10px] text-muted">
                      Created {new Date(l.createdAt).toLocaleDateString()} · {l.viewCount} views
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => revoke(l.id)}
                    className="text-xs text-red-500 hover:text-red-600"
                  >
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
