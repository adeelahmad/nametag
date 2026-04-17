'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

interface NotificationItem {
  id: string;
  type: string;
  severity: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

interface NotificationsResponse {
  notifications: NotificationItem[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
  unreadCount: number;
}

const POLL_INTERVAL_MS = 60_000;

function formatRelative(iso: string, locale: string): string {
  try {
    const now = Date.now();
    const then = new Date(iso).getTime();
    const diffSec = Math.round((then - now) / 1000);
    const absSec = Math.abs(diffSec);

    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    if (absSec < 60) return rtf.format(diffSec, 'second');
    if (absSec < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
    if (absSec < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
    if (absSec < 2592000) return rtf.format(Math.round(diffSec / 86400), 'day');
    if (absSec < 31536000) return rtf.format(Math.round(diffSec / 2592000), 'month');
    return rtf.format(Math.round(diffSec / 31536000), 'year');
  } catch {
    return new Date(iso).toLocaleString();
  }
}

function severityClasses(severity: NotificationItem['severity']): string {
  switch (severity) {
    case 'SUCCESS':
      return 'bg-green-500';
    case 'WARNING':
      return 'bg-yellow-500';
    case 'ERROR':
      return 'bg-red-500';
    default:
      return 'bg-primary';
  }
}

export default function NotificationBell({ locale = 'en' }: { locale?: string }) {
  const t = useTranslations('nav.notifications');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/unread-count');
      if (!res.ok) return;
      const data: { count: number } = await res.json();
      setUnreadCount(data.count);
    } catch {
      // Ignore transient errors; next poll will retry.
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/notifications?pageSize=20');
      if (!res.ok) return;
      const data: NotificationsResponse = await res.json();
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      fetchNotifications();
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, fetchNotifications]);

  const markRead = async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
    try {
      await fetch(`/api/notifications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ read: true }),
      });
    } catch {
      fetchNotifications();
    }
  };

  const dismiss = async (id: string) => {
    const wasUnread = notifications.find((n) => n.id === id)?.readAt == null;
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    if (wasUnread) {
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
    try {
      await fetch(`/api/notifications/${id}`, { method: 'DELETE' });
    } catch {
      fetchNotifications();
    }
  };

  const markAllRead = async () => {
    if (unreadCount === 0) return;
    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: now })));
    setUnreadCount(0);
    try {
      await fetch('/api/notifications/mark-all-read', { method: 'POST' });
    } catch {
      fetchNotifications();
    }
  };

  const badgeLabel = unreadCount > 99 ? '99+' : String(unreadCount);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={t('ariaLabel', { count: unreadCount })}
        aria-haspopup="true"
        aria-expanded={open}
        className="relative p-2 rounded-md text-foreground hover:bg-surface-elevated transition-colors"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[1.125rem] h-[1.125rem] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center"
            aria-hidden="true"
          >
            {badgeLabel}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t('title')}
          className="absolute right-0 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] bg-surface rounded-lg shadow-lg border border-border z-50"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">{t('title')}</h3>
            <button
              type="button"
              onClick={markAllRead}
              disabled={unreadCount === 0}
              className="text-xs text-primary hover:underline disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline"
            >
              {t('markAllRead')}
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="px-4 py-6 text-sm text-muted text-center">{t('loading')}</div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-6 text-sm text-muted text-center">{t('empty')}</div>
            ) : (
              <ul className="divide-y divide-border">
                {notifications.map((n) => {
                  const unread = n.readAt == null;
                  const Row = (
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-1.5 inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                          unread ? severityClasses(n.severity) : 'bg-transparent'
                        }`}
                        aria-hidden="true"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className={`text-sm ${
                              unread ? 'font-semibold text-foreground' : 'text-secondary'
                            } break-words`}
                          >
                            {n.title}
                          </p>
                          <span className="text-xs text-muted flex-shrink-0 whitespace-nowrap">
                            {formatRelative(n.createdAt, locale)}
                          </span>
                        </div>
                        {n.body && (
                          <p className="mt-1 text-xs text-muted break-words">{n.body}</p>
                        )}
                      </div>
                    </div>
                  );

                  return (
                    <li key={n.id} className="group relative">
                      <div className="flex items-start px-4 py-3 hover:bg-surface-elevated transition-colors">
                        <div className="flex-1 min-w-0">
                          {n.link ? (
                            <Link
                              href={n.link}
                              onClick={() => {
                                markRead(n.id);
                                setOpen(false);
                              }}
                              className="block"
                            >
                              {Row}
                            </Link>
                          ) : (
                            <button
                              type="button"
                              onClick={() => markRead(n.id)}
                              className="w-full text-left"
                            >
                              {Row}
                            </button>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => dismiss(n.id)}
                          aria-label={t('dismiss')}
                          className="ml-2 p-1 text-muted hover:text-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
