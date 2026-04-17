'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import CreateTaskModal from './CreateTaskModal';

interface PersonOption {
  id: string;
  name: string;
  surname?: string | null;
  nickname?: string | null;
}

interface StoredTask {
  id: string;
  googleTaskId: string;
  googleListId: string;
  title: string;
  notes: string | null;
  due: string | null;
  status: string;
  taskWebUrl: string | null;
  createdAt: string;
  people: Array<{ id: string; name: string; surname: string | null }>;
}

interface JournalTasksSectionProps {
  journalEntryId: string;
  journalTitle: string;
  /** People already tagged on the journal entry — pre-selected on the task. */
  taggedPeople: PersonOption[];
  /** All the user's people (for the picker). */
  availablePeople: PersonOption[];
  nameOrder?: 'WESTERN' | 'EASTERN';
  locale: string;
}

/**
 * Inline Tasks card on the journal entry detail page. Creates tasks tagged
 * with the same people as the journal entry and linked back to the entry.
 */
export default function JournalTasksSection({
  journalEntryId,
  journalTitle,
  taggedPeople,
  availablePeople,
  nameOrder,
  locale,
}: JournalTasksSectionProps) {
  const t = useTranslations('googleTasks');
  const [isOpen, setIsOpen] = useState(false);
  const [tasks, setTasks] = useState<StoredTask[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/google/tasks?journalEntry=${encodeURIComponent(journalEntryId)}`,
      );
      const data = await res.json();
      if (data.success) {
        setTasks(data.data);
      }
    } finally {
      setLoading(false);
    }
  }, [journalEntryId]);

  useEffect(() => {
    load();
  }, [load]);

  function formatDue(due: string | null): string | null {
    if (!due) return null;
    return new Date(due).toLocaleDateString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  return (
    <div className="mt-6 border-t border-border pt-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-foreground">{t('sectionTitle')}</h2>
        <Button size="sm" onClick={() => setIsOpen(true)}>
          {t('addTask')}
        </Button>
      </div>

      {loading && <p className="text-sm text-muted">{t('loading')}</p>}

      {!loading && tasks.length === 0 && (
        <p className="text-sm text-muted">{t('emptyJournal')}</p>
      )}

      {!loading && tasks.length > 0 && (
        <ul className="space-y-2">
          {tasks.map((task) => {
            const dueLabel = formatDue(task.due);
            const isCompleted = task.status === 'completed';
            return (
              <li
                key={task.id}
                className="flex items-start gap-3 p-3 bg-surface-elevated rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium ${isCompleted ? 'line-through text-muted' : 'text-foreground'}`}>
                    {task.title}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-muted">
                    {dueLabel && <span>{t('due')}: {dueLabel}</span>}
                    {task.people.map((p) => (
                      <Link
                        key={p.id}
                        href={`/people/${p.id}`}
                        className="text-primary hover:underline"
                      >
                        {p.name}{p.surname ? ` ${p.surname}` : ''}
                      </Link>
                    ))}
                  </div>
                  {task.notes && (
                    <p className="text-xs text-muted mt-1 line-clamp-2 whitespace-pre-wrap">
                      {task.notes}
                    </p>
                  )}
                </div>
                {task.taskWebUrl && (
                  <a
                    href={task.taskWebUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex-shrink-0"
                  >
                    {t('openInGoogle')}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <CreateTaskModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        initialPeople={taggedPeople}
        availablePeople={availablePeople}
        journalEntryId={journalEntryId}
        defaultTitle={journalTitle ? t('defaultTitlePrefix', { title: journalTitle }) : ''}
        nameOrder={nameOrder}
        onCreated={load}
      />
    </div>
  );
}
