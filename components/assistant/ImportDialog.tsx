'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onImported: (conversationId: string) => void;
}

type Format = 'markdown' | 'json';

export default function ImportDialog({ isOpen, onClose, onImported }: Props) {
  const [format, setFormat] = useState<Format>('markdown');
  const [text, setText] = useState('');
  const [working, setWorking] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFormat('markdown');
    setText('');
  };

  const submit = async () => {
    if (!text.trim()) {
      toast.error('Paste transcript text or upload a file');
      return;
    }
    setWorking(true);
    try {
      const res = await fetch('/api/assistant/conversations/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format, text }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { conversation: { id: string } };
      toast.success('Transcript imported');
      onImported(data.conversation.id);
      reset();
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const onFile = async (file: File) => {
    const buf = await file.text();
    if (buf.length > 1_000_000) {
      toast.error('File too large (1 MB max)');
      return;
    }
    setText(buf);
    if (file.name.endsWith('.json')) setFormat('json');
    else setFormat('markdown');
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Import transcript" size="lg">
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="radio"
              checked={format === 'markdown'}
              onChange={() => setFormat('markdown')}
            />
            Markdown
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="radio"
              checked={format === 'json'}
              onChange={() => setFormat('json')}
            />
            JSON
          </label>
          <div className="flex-1" />
          <input
            ref={fileRef}
            type="file"
            accept=".md,.markdown,.json,.txt,text/markdown,application/json,text/plain"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = '';
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            type="button"
            onClick={() => fileRef.current?.click()}
          >
            Upload file
          </Button>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={14}
          placeholder={
            format === 'markdown'
              ? '## USER\n…\n\n## ASSISTANT\n…'
              : '{"schema":"nametag.assistant.transcript/v1", …}'
          }
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-mono"
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={working}>
            {working ? 'Importing…' : 'Import'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
