'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { getDaysInMonth, clampDay } from '@/lib/date-utils';

interface DatePickerProps {
  value: string; // ISO "YYYY-MM-DD" or ""
  onChange: (value: string) => void;
  dateFormat: 'MDY' | 'DMY' | 'YMD';
  showTodayButton?: boolean;
  showYearToggle?: boolean;
  yearUnknown?: boolean; // controlled state for checkbox
  onYearUnknownChange?: (value: boolean) => void;
  maxDate?: string; // ISO string
  disabled?: boolean;
  id?: string;
}

function parseISO(value: string): {
  month: number | null;
  day: number | null;
  year: number | null;
} {
  if (!value) return { month: null, day: null, year: null };
  const parts = value.split('-');
  if (parts.length !== 3) return { month: null, day: null, year: null };
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return { month: null, day: null, year: null };
  return { year: y, month: m, day: d };
}

function toISO(year: number, month: number, day: number): string {
  const yStr = String(year).padStart(4, '0');
  const mStr = String(month).padStart(2, '0');
  const dStr = String(day).padStart(2, '0');
  return `${yStr}-${mStr}-${dStr}`;
}

function getMonthNames(locale: string): string[] {
  const names: string[] = [];
  for (let i = 0; i < 12; i++) {
    const date = new Date(2000, i, 1);
    names.push(
      date.toLocaleDateString(locale, { month: 'long' })
    );
  }
  return names;
}

const fieldStyle =
  'px-3 py-2 border border-border rounded-lg bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm';

export default function DatePicker({
  value,
  onChange,
  dateFormat,
  showTodayButton = false,
  showYearToggle = false,
  yearUnknown = false,
  onYearUnknownChange,
  maxDate,
  disabled = false,
  id,
}: DatePickerProps) {
  const t = useTranslations('datePicker');

  const parsed = useMemo(() => parseISO(value), [value]);

  const [month, setMonth] = useState<number | null>(parsed.month);
  const [day, setDay] = useState<number | null>(parsed.day);
  const [year, setYear] = useState<number | null>(parsed.year);

  // Sync internal state when value prop changes
  useEffect(() => {
    const p = parseISO(value);
    setMonth(p.month);
    setDay(p.day);
    setYear(p.year);
  }, [value]);

  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const maxYear = maxDate ? parseISO(maxDate).year ?? currentYear : currentYear;

  const locale = useLocale();
  const monthNames = useMemo(() => getMonthNames(locale), [locale]);

  const daysInMonth = useMemo(() => {
    if (month === null) return 31;
    const effectiveYear = yearUnknown ? undefined : (year ?? undefined);
    return getDaysInMonth(month, effectiveYear);
  }, [month, year, yearUnknown]);

  const emitChange = useCallback(
    (m: number | null, d: number | null, y: number | null) => {
      if (yearUnknown) {
        if (m !== null && d !== null) {
          onChange(toISO(currentYear, m, d));
        } else {
          onChange('');
        }
      } else {
        if (m !== null && d !== null && y !== null) {
          onChange(toISO(y, m, d));
        } else {
          onChange('');
        }
      }
    },
    [yearUnknown, currentYear, onChange]
  );

  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === '') {
      setMonth(null);
      emitChange(null, day, year);
      return;
    }
    const newMonth = parseInt(val, 10);
    setMonth(newMonth);

    let newDay = day;
    if (day !== null) {
      const effectiveYear = yearUnknown ? undefined : (year ?? undefined);
      newDay = clampDay(day, newMonth, effectiveYear);
      if (newDay !== day) {
        setDay(newDay);
      }
    }
    emitChange(newMonth, newDay, year);
  };

  const handleDayChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === '') {
      setDay(null);
      emitChange(month, null, year);
      return;
    }
    const newDay = parseInt(val, 10);
    setDay(newDay);
    emitChange(month, newDay, year);
  };

  const handleYearChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === '') {
      setYear(null);
      emitChange(month, day, null);
      return;
    }
    const newYear = parseInt(val, 10);
    if (isNaN(newYear)) return;
    setYear(newYear);

    // Re-clamp day for new year (leap year changes)
    let newDay = day;
    if (day !== null && month !== null) {
      const clamped = clampDay(day, month, newYear);
      if (clamped !== day) {
        newDay = clamped;
        setDay(newDay);
      }
    }

    emitChange(month, newDay, newYear);
  };

  const handleTodayClick = () => {
    const today = new Date();
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth() + 1;
    const todayDay = today.getDate();
    setMonth(todayMonth);
    setDay(todayDay);
    setYear(todayYear);
    onChange(toISO(todayYear, todayMonth, todayDay));
  };

  const handleYearUnknownChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    onYearUnknownChange?.(checked);
  };

  const monthField = (
    <div data-datepicker-field="month" key="month">
      <select
        aria-label={t('month')}
        value={month ?? ''}
        onChange={handleMonthChange}
        disabled={disabled}
        className={fieldStyle}
      >
        <option value="">{t('month')}</option>
        {monthNames.map((name, i) => (
          <option key={i + 1} value={i + 1}>
            {name}
          </option>
        ))}
      </select>
    </div>
  );

  const dayField = (
    <div data-datepicker-field="day" key="day">
      <select
        aria-label={t('day')}
        value={day ?? ''}
        onChange={handleDayChange}
        disabled={disabled}
        className={fieldStyle}
      >
        <option value="">{t('day')}</option>
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
    </div>
  );

  const yearField = !yearUnknown ? (
    <div data-datepicker-field="year" key="year">
      <input
        type="number"
        aria-label={t('year')}
        value={year ?? ''}
        onChange={handleYearChange}
        min={1900}
        max={maxYear}
        placeholder={t('year')}
        disabled={disabled}
        className={`${fieldStyle} w-24`}
      />
    </div>
  ) : null;

  const fieldMap: Record<string, React.ReactNode> = {
    M: monthField,
    D: dayField,
    Y: yearField,
  };

  const orderedFields = dateFormat.split('').map((char) => fieldMap[char]).filter(Boolean);

  return (
    <div id={id} className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {orderedFields}
        {showTodayButton && (
          <button
            type="button"
            onClick={handleTodayClick}
            disabled={disabled}
            className="px-3 py-2 text-sm text-primary hover:text-primary-dark font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('today')}
          </button>
        )}
      </div>
      {showYearToggle && (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id={id ? `${id}-year-unknown` : 'year-unknown'}
            checked={yearUnknown}
            onChange={handleYearUnknownChange}
            disabled={disabled}
            className="rounded border-border text-primary focus:ring-primary"
            aria-label={t('yearUnknown')}
          />
          <label
            htmlFor={id ? `${id}-year-unknown` : 'year-unknown'}
            className="text-sm text-muted"
          >
            {t('yearUnknown')}
          </label>
          <span
            title={t('yearUnknownTooltip')}
            className="text-muted cursor-help"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-4 h-4"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM8.94 6.94a.75.75 0 11-1.061-1.061 3 3 0 112.871 5.026v.345a.75.75 0 01-1.5 0v-.5c0-.72.57-1.172 1.081-1.287A1.5 1.5 0 108.94 6.94zM10 15a1 1 0 100-2 1 1 0 000 2z"
                clipRule="evenodd"
              />
            </svg>
          </span>
        </div>
      )}
    </div>
  );
}
