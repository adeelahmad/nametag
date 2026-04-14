'use client';

import { useTranslations } from 'next-intl';

type MatchMode = 'or' | 'and';

interface GraphFilterModePillProps {
  mode: MatchMode;
  label: string;
  title?: string;
  ariaLabel?: string;
  onClick?: () => void;
}

interface GraphFilterGroupPillProps {
  id: string;
  label: string;
  color: string | null;
  isNegative: boolean;
  title?: string;
  ariaLabel?: string;
  onToggle?: () => void;
  onRemove?: () => void;
  removeAriaLabel?: string;
}

export function GraphFilterModePill({
  mode,
  label,
  title,
  ariaLabel,
  onClick,
}: GraphFilterModePillProps) {
  return (
    <span
      className="inline-flex h-full items-stretch rounded-md border border-border bg-surface-elevated p-0.5 focus-within:border-secondary focus-within:ring-2 focus-within:ring-secondary/20"
      data-mode={mode}
    >
      <button
        type="button"
        onClick={onClick}
        className="inline-flex h-full px-3 items-center justify-center whitespace-nowrap text-base font-normal rounded border border-transparent text-foreground transition-all hover:bg-surface focus:outline-none"
        title={title}
        aria-label={ariaLabel}
      >
        {label}
      </button>
    </span>
  );
}

export function GraphFilterGroupPill({
  id,
  label,
  color,
  isNegative,
  title,
  ariaLabel,
  onToggle,
  onRemove,
  removeAriaLabel,
}: GraphFilterGroupPillProps) {
  const tCommon = useTranslations('common');
  const isInteractive = Boolean(onToggle);

  return (
    <div
      key={id}
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (!onToggle) {
          return;
        }

        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle();
        }
      }}
      title={title}
      aria-label={ariaLabel}
      className={`inline-flex h-8 items-center gap-1.5 px-3 border rounded-full text-sm font-medium shadow-sm select-none transition-colors ${
        isInteractive ? 'cursor-pointer' : ''
      } ${
        isNegative
          ? 'bg-red-100 border-red-300 hover:bg-red-200 dark:bg-red-900/30 dark:border-red-700/50 dark:hover:bg-red-900/45'
          : 'bg-green-100 border-green-300 hover:bg-green-200 dark:bg-green-900/30 dark:border-green-700/50 dark:hover:bg-green-900/45'
      }`}
    >
      <div
        className="w-3 h-3 rounded-full shrink-0 ring-1 ring-white/50"
        style={{ backgroundColor: color || '#7bf080' }}
      />
      <span className="text-foreground">{label}</span>

      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          onKeyDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className="hover:bg-foreground/10 rounded-full p-0.5 transition-colors"
          aria-label={removeAriaLabel || `${tCommon('remove')} ${label}`}
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
