import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  create: vi.fn(),
  createMany: vi.fn(),
  count: vi.fn(),
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock('../../lib/prisma', () => ({
  prisma: {
    notification: {
      findMany: mocks.findMany,
      create: mocks.create,
      createMany: mocks.createMany,
      count: mocks.count,
      findUnique: mocks.findUnique,
      findFirst: mocks.findFirst,
      updateMany: mocks.updateMany,
      deleteMany: mocks.deleteMany,
    },
  },
}));

import {
  createNotification,
  createManyNotifications,
  listNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllRead,
  MAX_NOTIFICATIONS_PER_USER,
} from '../../lib/notifications';

describe('notifications service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a notification with defaults and prunes when over the cap', async () => {
    mocks.create.mockResolvedValue({
      id: 'n-1',
      userId: 'user-1',
      type: 'INFO',
      severity: 'INFO',
      title: 'Hello',
    });
    // First count call is from pruneIfNeeded
    mocks.count.mockResolvedValue(MAX_NOTIFICATIONS_PER_USER + 2);
    mocks.findMany.mockResolvedValue([{ id: 'old-1' }, { id: 'old-2' }]);
    mocks.deleteMany.mockResolvedValue({ count: 2 });

    const result = await createNotification({
      userId: 'user-1',
      title: 'Hello',
    });

    expect(result.id).toBe('n-1');
    expect(mocks.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        type: 'INFO',
        severity: 'INFO',
        title: 'Hello',
      }),
    });

    // Allow the pruning promise to resolve
    await new Promise((resolve) => setImmediate(resolve));
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['old-1', 'old-2'] } },
    });
  });

  it('does not prune when under the cap', async () => {
    mocks.create.mockResolvedValue({ id: 'n-1' });
    mocks.count.mockResolvedValue(10);

    await createNotification({ userId: 'user-1', title: 'Hi' });
    await new Promise((resolve) => setImmediate(resolve));

    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });

  it('creates many notifications', async () => {
    mocks.createMany.mockResolvedValue({ count: 2 });
    const count = await createManyNotifications([
      { userId: 'u1', title: 'A' },
      { userId: 'u2', title: 'B', severity: 'WARNING' },
    ]);
    expect(count).toBe(2);
    expect(mocks.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ userId: 'u1', title: 'A', severity: 'INFO' }),
        expect.objectContaining({ userId: 'u2', title: 'B', severity: 'WARNING' }),
      ],
    });
  });

  it('returns 0 when createManyNotifications is called with empty array', async () => {
    const count = await createManyNotifications([]);
    expect(count).toBe(0);
    expect(mocks.createMany).not.toHaveBeenCalled();
  });

  it('lists notifications with pagination metadata', async () => {
    const items = [{ id: 'n-1' }, { id: 'n-2' }];
    mocks.findMany.mockResolvedValue(items);
    mocks.count.mockResolvedValueOnce(42).mockResolvedValueOnce(5);

    const result = await listNotifications('u1', { page: 2, pageSize: 10 });

    expect(result.notifications).toEqual(items);
    expect(result.totalCount).toBe(42);
    expect(result.unreadCount).toBe(5);
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(10);
    expect(result.totalPages).toBe(5);
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1' },
        skip: 10,
        take: 10,
      })
    );
  });

  it('supports unreadOnly filter', async () => {
    mocks.findMany.mockResolvedValue([]);
    mocks.count.mockResolvedValue(0);
    await listNotifications('u1', { unreadOnly: true });
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1', readAt: null },
      })
    );
  });

  it('clamps page size to the allowed range', async () => {
    mocks.findMany.mockResolvedValue([]);
    mocks.count.mockResolvedValue(0);
    const result = await listNotifications('u1', { pageSize: 9999 });
    expect(result.pageSize).toBe(100);
  });

  it('returns the unread count', async () => {
    mocks.count.mockResolvedValue(7);
    const n = await getUnreadCount('u1');
    expect(n).toBe(7);
    expect(mocks.count).toHaveBeenCalledWith({
      where: { userId: 'u1', readAt: null },
    });
  });

  it('marks a notification as read', async () => {
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.findUnique.mockResolvedValue({ id: 'n-1', readAt: new Date() });
    const result = await markAsRead('u1', 'n-1');
    expect(result?.id).toBe('n-1');
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: 'n-1', userId: 'u1', readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });

  it('returns existing notification when already read', async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    mocks.findFirst.mockResolvedValue({ id: 'n-1', readAt: new Date() });
    const result = await markAsRead('u1', 'n-1');
    expect(result?.id).toBe('n-1');
  });

  it('marks all as read', async () => {
    mocks.updateMany.mockResolvedValue({ count: 4 });
    const n = await markAllAsRead('u1');
    expect(n).toBe(4);
  });

  it('deletes a notification scoped to the user', async () => {
    mocks.deleteMany.mockResolvedValue({ count: 1 });
    const ok = await deleteNotification('u1', 'n-1');
    expect(ok).toBe(true);
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { id: 'n-1', userId: 'u1' },
    });
  });

  it('returns false when delete matches nothing', async () => {
    mocks.deleteMany.mockResolvedValue({ count: 0 });
    const ok = await deleteNotification('u1', 'missing');
    expect(ok).toBe(false);
  });

  it('deletes all read notifications', async () => {
    mocks.deleteMany.mockResolvedValue({ count: 3 });
    const n = await deleteAllRead('u1');
    expect(n).toBe(3);
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', readAt: { not: null } },
    });
  });
});
