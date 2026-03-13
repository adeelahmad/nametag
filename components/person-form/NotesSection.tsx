'use client';

import { useTranslations } from 'next-intl';
import MarkdownEditor from '../MarkdownEditor';
import type { FormData } from '../../hooks/usePersonForm';

interface NotesSectionProps {
  formData: FormData;
  onFormDataChange: (updates: Partial<FormData>) => void;
}

export default function NotesSection({
  formData,
  onFormDataChange,
}: NotesSectionProps) {
  const t = useTranslations('people.form');

  return (
    <div>
      <MarkdownEditor
        id="notes"
        value={formData.notes}
        onChange={(notes) => onFormDataChange({ notes })}
        placeholder={t('notesPlaceholder')}
        rows={4}
      />
      <p className="text-xs text-muted mt-1">{t('markdownSupport')}</p>
    </div>
  );
}
