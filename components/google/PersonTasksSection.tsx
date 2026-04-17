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

interface PersonTasksSectionProps {
  person: PersonOption;
  /** Other people the user can tag on a new task. */
  availablePeople: PersonOption[];
  nameOrder?: 'WESTERN' | 'EASTERN';
  locale: string;
}

/**
 * Inline "Tasks" card on a person profile page: shows open Google Tasks that
 * reference this person and lets the user create a new one pre-tagged to them.
 *
 * Rendered only when the Google integration is connected with tasksEnabled.
 */
export default function PersonTasksSection({
  person,
  availablePeople,
  nameOrder,
  locale,
}: PersonTasksSectionProps) {
  const t = useTranslations('googleTasks');
  const [isOpen, setIsOpen] = useState(false);
  const [tasks, setTasks] = useState<StoredTask[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/google/tasks?person=${encodeURIComponent(person.id)}`);
      const data = await res.json();
      if (data.success) {
        setTasks(data.data);
      }
    } finally {
      setLoading(false);
    }
  }, [person.id]);

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
    <div className="border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">{t('sectionTitle')}</h3>
        <Button size="sm" onClick={() => setIsOpen(true)}>
          {t('addTask')}
        </Button>
      </div>

      {loading && <p className="text-sm text-muted">{t('loading')}</p>}

      {!loading && tasks.length === 0 && (
        <p className="text-sm text-muted">{t('empty')}</p>
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
                    {task.people.filter((p) => p.id !== person.id).map((p) => (
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
        initialPeople={[person]}
        availablePeople={availablePeople}
        nameOrder={nameOrder}
        onCreated={load}
      />
    </div>
  );
}
