'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { GraphFilterGroupPill } from './GraphFilterPills';

export default function GraphFilterHelpModal() {
  const [isOpen, setIsOpen] = useState(false);
  const t = useTranslations('dashboard');
  const tCommon = useTranslations('common');
  const triggerButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const triggerButton = triggerButtonRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    // Collect tabbable elements so focus can be trapped inside the modal.
    const getFocusableElements = () => {
      const dialog = dialogRef.current;
      if (!dialog) {
        return [] as HTMLElement[];
      }

      return Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => {
        return (
          !element.hasAttribute('disabled') &&
          element.getAttribute('aria-hidden') !== 'true'
        );
      });
    };

    // Handle Escape-to-close and Tab focus looping for keyboard users.
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsOpen(false);
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const focusableElements = getFocusableElements();

      if (focusableElements.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement as HTMLElement | null;
      const isActiveInDialog = activeElement
        ? focusableElements.includes(activeElement)
        : false;

      if (!isActiveInDialog) {
        event.preventDefault();
        first.focus();
        return;
      }

      if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
        return;
      }

      if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      // Return focus to the element that opened the modal.
      triggerButton?.focus();
    };
  }, [isOpen]);

  return (
    <>
      <button
        ref={triggerButtonRef}
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex w-6 h-6 items-center justify-center rounded-full border border-border text-sm font-bold text-muted hover:text-foreground hover:bg-surface-elevated transition-colors shrink-0"
        aria-label={t('graph.filterHelp.ariaLabel')}
        title={t('graph.filterHelp.ariaLabel')}
      >
        ?
      </button>

      {isOpen && (
        // Backdrop click closes the modal.
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="filter-help-title"
          onClick={() => setIsOpen(false)}
        >
          <div
            ref={dialogRef}
            className="bg-surface rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 shadow-xl"
            // Prevent backdrop close when interacting inside the dialog.
            onClick={(e) => e.stopPropagation()}
            tabIndex={-1}
          >
            <div className="flex items-center justify-between mb-4">
              <h2
                id="filter-help-title"
                className="text-xl font-bold text-foreground"
              >
                {t('graph.filterHelp.title')}
              </h2>
              {/* Explicit close button */}
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-muted hover:text-foreground transition-colors p-1"
                aria-label={tCommon('close')}
              >
                <svg
                  className="w-5 h-5"
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
            </div>

            <div className="space-y-4 text-sm text-foreground">
              {/* Section 1: explains include/exclude filters. */}
              <section className="pt-4 border-t border-border">
                <h3 className="font-semibold text-base mb-2">
                  {t('graph.filterHelp.groupsSection')}
                </h3>
                <p className="text-muted-foreground">
                  {t('graph.filterHelp.groupsDescription')}
                </p>
                <div className="space-y-2 mt-2">
                  <div>
                    <span className="text-muted-foreground font-bold mr-2">
                      {t('graph.filterHelp.includingSection')}
                    </span>
                    <GraphFilterGroupPill
                      id="help-include-example"
                      label={t('graph.filterHelp.example')}
                      color="#3b82f6"
                      isNegative={false}
                      onRemove={() => undefined}
                    />
                    <p className="text-muted-foreground mt-2">
                      {t('graph.filterHelp.includingDescription')}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground font-bold mr-2">
                      {t('graph.filterHelp.excludingSection')}
                    </span>
                    <GraphFilterGroupPill
                      id="help-exclude-example"
                      label={t('graph.filterHelp.example')}
                      color="#3b82f6"
                      isNegative={true}
                      onRemove={() => undefined}
                    />
                    <p className="text-muted-foreground mt-2">
                      {t('graph.filterHelp.excludingDescription')}
                    </p>
                  </div>
                </div>
              </section>

              {/* Section 2: explains how Any/All matching changes include behavior. */}
              <section className="pt-4 border-t border-border">
                <h3 className="font-semibold text-base mb-2">
                  {t('graph.filterHelp.matchModeSection')}
                </h3>
                <div className="space-y-2">
                  <div>
                    <p className="text-muted-foreground font-bold mb-1">
                      {t('graph.filterHelp.anyMode')}
                    </p>
                    <p className="text-muted-foreground">
                      {t('graph.filterHelp.anyModeDescription')}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground font-bold mb-1">
                      {t('graph.filterHelp.allMode')}
                    </p>
                    <p className="text-muted-foreground">
                      {t('graph.filterHelp.allModeDescription')}
                    </p>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
