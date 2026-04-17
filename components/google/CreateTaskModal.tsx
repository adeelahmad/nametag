'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import PillSelector from '@/components/PillSelector';
import { formatFullName } from '@/lib/nameUtils';

interface PersonOption {
  id: string;
  name: string;
  surname?: string | null;
  nickname?: string | null;
}

interface PillPerson {
  id: string;
  label: string;
}

interface TaskList {
  id: string;
  title: string;
}

export interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** People pre-selected when the modal opens (e.g. from a profile page). */
  initialPeople?: PersonOption[];
  /** All people available for picking. If undefined, people can't be added
   *  beyond the initial selection (useful on profile pages). */
  availablePeople?: PersonOption[];
  /** Associates the new task with a journal entry. */
  journalEntryId?: string;
  /** Prefill title (e.g. "Follow up: <journal title>"). */
  defaultTitle?: string;
  nameOrder?: 'WESTERN' | 'EASTERN';
  onCreated?: () => void;
}

export default function CreateTaskModal({
  isOpen,
  onClose,
  initialPeople = [],
  availablePeople,
  journalEntryId,
  defaultTitle = '',
  nameOrder,
  onCreated,
}: CreateTaskModalProps) {
  const t = useTranslations('googleTasks');

  const pillFromPerson = (p: PersonOption): PillPerson => ({
    id: p.id,
    label: formatFullName(p, nameOrder),
  });

  const [title, setTitle] = useState(defaultTitle);
  const [notes, setNotes] = useState('');
  const [due, setDue] = useState('');
  const [selected, setSelected] = useState<PillPerson[]>(initialPeople.map(pillFromPerson));
  const [taskLists, setTaskLists] = useState<TaskList[]>([]);
  const [taskListId, setTaskListId] = useState<string>('');
  const [loadingLists, setLoadingLists] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state each time the modal opens so stale values don't leak across
  // invocations from different profiles.
  useEffect(() => {
    if (!isOpen) return;
    setTitle(defaultTitle);
    setNotes('');
    setDue('');
    setSelected(initialPeople.map(pillFromPerson));
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, defaultTitle]);

  // Lazy-load the user's task lists the first time the modal is opened.
  useEffect(() => {
    if (!isOpen || taskLists.length > 0) return;
    let cancelled = false;
    (async () => {
      setLoadingLists(true);
      try {
        const res = await fetch('/api/google/tasks/lists');
        const data = await res.json();
        if (!cancelled && data.success) {
          setTaskLists(data.data);
          if (data.data.length > 0 && !taskListId) {
            setTaskListId(data.data[0].id);
          }
        }
      } catch {
        // Silent — the user can still submit without picking a list.
      } finally {
        if (!cancelled) setLoadingLists(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const pickablePeople: PillPerson[] = (availablePeople ?? []).map(pillFromPerson);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/google/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          notes: notes || undefined,
          due: due || null,
          taskListId: taskListId || null,
          personIds: selected.map((p) => p.id),
          journalEntryId: journalEntryId || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || t('createError'));
      }

      toast.success(t('createSuccess'));
      onCreated?.();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('createError');
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('modalTitle')} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div
            className="bg-warning/10 border border-warning/30 text-warning px-4 py-2 rounded text-sm"
            role="alert"
          >
            {error}
          </div>
        )}

        <div>
          <label htmlFor="task-title" className="block text-sm font-medium text-muted mb-1">
            {t('titleLabel')} <span className="text-destructive" aria-hidden="true">*</span>
          </label>
          <input
            id="task-title"
            type="text"
            required
            maxLength={1024}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('titlePlaceholder')}
            className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div>
          <label htmlFor="task-due" className="block text-sm font-medium text-muted mb-1">
            {t('dueLabel')}
          </label>
          <input
            id="task-due"
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div>
          <label htmlFor="task-notes" className="block text-sm font-medium text-muted mb-1">
            {t('notesLabel')}
          </label>
          <textarea
            id="task-notes"
            rows={3}
            maxLength={8192}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('notesPlaceholder')}
            className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          />
        </div>

        <div>
          <PillSelector<PillPerson>
            label={t('peopleLabel')}
            selectedItems={selected}
            availableItems={pickablePeople}
            onAdd={(item) => setSelected((prev) => [...prev, item])}
            onRemove={(id) => setSelected((prev) => prev.filter((p) => p.id !== id))}
            placeholder={t('peoplePlaceholder')}
            showAllOnFocus
            isLoading={submitting}
          />
        </div>

        <div>
          <label htmlFor="task-list" className="block text-sm font-medium text-muted mb-1">
            {t('listLabel')}
          </label>
          <select
            id="task-list"
            value={taskListId}
            onChange={(e) => setTaskListId(e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {loadingLists && <option value="">{t('loadingLists')}</option>}
            {!loadingLists && taskLists.length === 0 && (
              <option value="">{t('defaultList')}</option>
            )}
            {taskLists.map((list) => (
              <option key={list.id} value={list.id}>
                {list.title}
              </option>
            ))}
          </select>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" type="button" onClick={onClose} disabled={submitting}>
            {t('cancel')}
          </Button>
          <Button type="submit" disabled={submitting} aria-busy={submitting}>
            {submitting ? t('creating') : t('create')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
