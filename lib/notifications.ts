/**
 * In-app notifications service.
 *
 * Centralises creation, retrieval, and state transitions for user-facing
 * notifications displayed in the notification center.
 */

import type { Prisma, Notification, NotificationType, NotificationSeverity } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('notifications');

export const MAX_NOTIFICATIONS_PER_USER = 500;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface CreateNotificationInput {
  userId: string;
  type?: NotificationType;
  severity?: NotificationSeverity;
  title: string;
  body?: string | null;
  link?: string | null;
  metadata?: Prisma.InputJsonValue | null;
}

export interface ListNotificationsOptions {
  unreadOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ListNotificationsResult {
  notifications: Notification[];
  totalCount: number;
  unreadCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Create an in-app notification for a user. Silently enforces a per-user cap
 * by pruning the oldest read notifications once the cap is exceeded.
 */
export async function createNotification(
  input: CreateNotificationInput
): Promise<Notification> {
  const notification = await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type ?? 'INFO',
      severity: input.severity ?? 'INFO',
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
      metadata: input.metadata ?? undefined,
    },
  });

  pruneIfNeeded(input.userId).catch((err: unknown) => {
    log.warn(
      { err: err instanceof Error ? err : new Error(String(err)), userId: input.userId },
      'Failed to prune notifications'
    );
  });

  return notification;
}

export async function createManyNotifications(
  inputs: CreateNotificationInput[]
): Promise<number> {
  if (inputs.length === 0) return 0;
  const result = await prisma.notification.createMany({
    data: inputs.map((input) => ({
      userId: input.userId,
      type: input.type ?? 'INFO',
      severity: input.severity ?? 'INFO',
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
      metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    })),
  });
  return result.count;
}

export async function listNotifications(
  userId: string,
  options: ListNotificationsOptions = {}
): Promise<ListNotificationsResult> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, options.pageSize ?? DEFAULT_PAGE_SIZE));
  const unreadOnly = options.unreadOnly ?? false;

  const where: Prisma.NotificationWhereInput = {
    userId,
    ...(unreadOnly ? { readAt: null } : {}),
  };

  const [notifications, totalCount, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);

  return {
    notifications,
    totalCount,
    unreadCount,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  };
}

export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: { userId, readAt: null },
  });
}

export async function markAsRead(
  userId: string,
  notificationId: string
): Promise<Notification | null> {
  const result = await prisma.notification.updateMany({
    where: { id: notificationId, userId, readAt: null },
    data: { readAt: new Date() },
  });
  if (result.count === 0) {
    return prisma.notification.findFirst({ where: { id: notificationId, userId } });
  }
  return prisma.notification.findUnique({ where: { id: notificationId } });
}

export async function markAllAsRead(userId: string): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return result.count;
}

export async function deleteNotification(
  userId: string,
  notificationId: string
): Promise<boolean> {
  const result = await prisma.notification.deleteMany({
    where: { id: notificationId, userId },
  });
  return result.count > 0;
}

export async function deleteAllRead(userId: string): Promise<number> {
  const result = await prisma.notification.deleteMany({
    where: { userId, readAt: { not: null } },
  });
  return result.count;
}

/**
 * Prune old read notifications if the user is over the per-user cap.
 * Keeps unread notifications untouched; trims oldest read ones first.
 */
async function pruneIfNeeded(userId: string): Promise<void> {
  const count = await prisma.notification.count({ where: { userId } });
  if (count <= MAX_NOTIFICATIONS_PER_USER) return;

  const excess = count - MAX_NOTIFICATIONS_PER_USER;
  const pruneTargets = await prisma.notification.findMany({
    where: { userId, readAt: { not: null } },
    orderBy: { createdAt: 'asc' },
    take: excess,
    select: { id: true },
  });

  if (pruneTargets.length === 0) return;

  await prisma.notification.deleteMany({
    where: { id: { in: pruneTargets.map((n) => n.id) } },
  });
}
