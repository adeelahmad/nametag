'use client';

import ImportantDatesManager from '../ImportantDatesManager';
import type { ImportantDateItem } from '../../hooks/usePersonForm';

interface ReminderLimit {
  canCreate: boolean;
  current: number;
  limit: number;
  isUnlimited: boolean;
}

interface DatesSectionProps {
  personId?: string;
  mode: 'create' | 'edit';
  importantDates: ImportantDateItem[];
  onImportantDatesChange: (dates: ImportantDateItem[]) => void;
  dateFormat?: 'MDY' | 'DMY' | 'YMD';
  reminderLimit?: ReminderLimit;
}

export default function DatesSection({
  personId,
  mode,
  importantDates,
  onImportantDatesChange,
  dateFormat = 'MDY',
  reminderLimit,
}: DatesSectionProps) {
  return (
    <ImportantDatesManager
      personId={personId}
      initialDates={importantDates}
      onChange={onImportantDatesChange}
      mode={mode}
      dateFormat={dateFormat}
      reminderLimit={reminderLimit}
    />
  );
}
