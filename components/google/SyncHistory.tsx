'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

type SyncLogEntry = {
  id: string;
  syncType: string;
  status: string;
  newEmails: number;
  matchedContacts: number;
  attachments: number;
  ocrProcessed: number;
  calendarEvents: number;
  errors: string[];
  duration: number | null;
  triggeredBy: string;
  createdAt: string;
};

function formatDuration(ms: number | null): string {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleString();
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'completed': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
    case 'completed_with_errors': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
    case 'failed': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    case 'started': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
    default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400';
  }
}

export default function SyncHistory() {
  const t = useTranslations('google');
  const [logs, setLogs] = useState<SyncLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/google/sync-logs?limit=20')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setLogs(data.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="border border-border rounded-lg p-4">
        <h3 className="text-lg font-semibold text-foreground mb-4">{t('syncHistory')}</h3>
        <p className="text-sm text-muted">{t('loading')}</p>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="border border-border rounded-lg p-4">
        <h3 className="text-lg font-semibold text-foreground mb-4">{t('syncHistory')}</h3>
        <p className="text-sm text-muted">{t('noSyncLogs')}</p>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg p-4">
      <h3 className="text-lg font-semibold text-foreground mb-4">{t('syncHistory')}</h3>

      <div className="space-y-2">
        {logs.map((log) => (
          <div
            key={log.id}
            className="bg-surface-elevated rounded-lg overflow-hidden"
          >
            <button
              onClick={() => setExpanded(expanded === log.id ? null : log.id)}
              className="w-full flex items-center justify-between p-3 text-left hover:bg-surface transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(log.status)}`}>
                  {log.status.replace(/_/g, ' ')}
                </span>
                <span className="text-xs text-muted uppercase">{log.syncType}</span>
                {log.triggeredBy === 'manual' && (
                  <span className="text-xs text-muted">(manual)</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted">{formatDuration(log.duration)}</span>
                <span className="text-xs text-muted">{formatTime(log.createdAt)}</span>
                <svg
                  className={`w-4 h-4 text-muted transition-transform ${expanded === log.id ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {expanded === log.id && (
              <div className="px-3 pb-3 border-t border-border pt-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {log.newEmails > 0 && (
                    <div>
                      <div className="text-xs text-muted">{t('syncDetailEmails')}</div>
                      <div className="text-sm font-medium text-foreground">{log.newEmails}</div>
                    </div>
                  )}
                  {log.matchedContacts > 0 && (
                    <div>
                      <div className="text-xs text-muted">{t('syncDetailMatched')}</div>
                      <div className="text-sm font-medium text-foreground">{log.matchedContacts}</div>
                    </div>
                  )}
                  {log.attachments > 0 && (
                    <div>
                      <div className="text-xs text-muted">{t('syncDetailAttachments')}</div>
                      <div className="text-sm font-medium text-foreground">{log.attachments}</div>
                    </div>
                  )}
                  {log.ocrProcessed > 0 && (
                    <div>
                      <div className="text-xs text-muted">{t('syncDetailOcr')}</div>
                      <div className="text-sm font-medium text-foreground">{log.ocrProcessed}</div>
                    </div>
                  )}
                  {log.calendarEvents > 0 && (
                    <div>
                      <div className="text-xs text-muted">{t('syncDetailCalendar')}</div>
                      <div className="text-sm font-medium text-foreground">{log.calendarEvents}</div>
                    </div>
                  )}
                </div>

                {log.errors.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">{t('syncDetailErrors')}</div>
                    <ul className="text-xs text-red-500 space-y-1">
                      {log.errors.map((err, i) => (
                        <li key={i} className="truncate">{err}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
