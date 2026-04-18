import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { verifyShareToken } from '@/lib/assistant/share';
import MessageList from '@/components/assistant/MessageList';
import type { ChatMessage } from '@/components/assistant/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface Props {
  params: Promise<{ token: string }>;
}

export default async function SharePage({ params }: Props) {
  const { token } = await params;
  const link = await verifyShareToken(token);
  if (!link) notFound();

  const conv = await prisma.assistantConversation.findUnique({
    where: { id: link.conversationId },
    select: { id: true, title: true, createdAt: true, updatedAt: true },
  });
  if (!conv) notFound();

  const rawMessages = await prisma.assistantMessage.findMany({
    where: {
      conversationId: conv.id,
      role: { in: ['USER', 'ASSISTANT'] },
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      role: true,
      content: true,
      createdAt: true,
    },
  });

  const messages: ChatMessage[] = rawMessages.map((m) => ({
    id: m.id,
    role: m.role as ChatMessage['role'],
    content: m.content,
    createdAt: m.createdAt.toISOString(),
  }));

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border px-6 py-4 bg-surface">
        <div className="max-w-3xl mx-auto">
          <div className="text-xs uppercase tracking-wide text-muted">
            Shared conversation · read-only
          </div>
          <h1 className="text-lg font-semibold truncate">{conv.title}</h1>
          <div className="text-xs text-muted mt-1">
            Shared from Nametag · {new Date(conv.updatedAt).toLocaleString()}
          </div>
        </div>
      </header>
      <main className="flex-1 flex flex-col min-h-0">
        <MessageList messages={messages} readOnly />
      </main>
      <footer className="border-t border-border px-6 py-3 text-center text-[11px] text-muted">
        Generated with Nametag Assistant. Tool calls and sources are hidden from
        this public view.
      </footer>
    </div>
  );
}
