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

vi.mock('../../lib/auth', () => ({
  auth: vi.fn(() =>
    Promise.resolve({
      user: { id: 'user-123', email: 'test@example.com', name: 'Test' },
    })
  ),
}));

import { GET } from '../../app/api/notifications/route';
import { PATCH, DELETE } from '../../app/api/notifications/[id]/route';
import { GET as GET_UNREAD_COUNT } from '../../app/api/notifications/unread-count/route';
import { POST as POST_MARK_ALL } from '../../app/api/notifications/mark-all-read/route';

describe('Notifications API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/notifications', () => {
    it('returns paginated notifications for the current user', async () => {
      const mockNotifications = [
        {
          id: 'n-1',
          userId: 'user-123',
          type: 'INFO',
          severity: 'INFO',
          title: 'Hello',
          body: 'world',
          readAt: null,
          createdAt: new Date('2026-04-17T10:00:00Z'),
        },
      ];
      mocks.findMany.mockResolvedValue(mockNotifications);
      mocks.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);

      const request = new Request('http://localhost/api/notifications');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.notifications).toHaveLength(1);
      expect(data.notifications[0].id).toBe('n-1');
      expect(data.unreadCount).toBe(1);
      expect(data.pagination).toMatchObject({ page: 1, pageSize: 20 });
      expect(mocks.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'user-123' }),
          orderBy: { createdAt: 'desc' },
        })
      );
    });

    it('filters to unread when unreadOnly=true', async () => {
      mocks.findMany.mockResolvedValue([]);
      mocks.count.mockResolvedValue(0);

      const request = new Request('http://localhost/api/notifications?unreadOnly=true');
      await GET(request);

      expect(mocks.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'user-123', readAt: null }),
        })
      );
    });
  });

  describe('GET /api/notifications/unread-count', () => {
    it('returns the unread count for the current user', async () => {
      mocks.count.mockResolvedValue(3);

      const request = new Request('http://localhost/api/notifications/unread-count');
      const response = await GET_UNREAD_COUNT(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.count).toBe(3);
      expect(mocks.count).toHaveBeenCalledWith({
        where: { userId: 'user-123', readAt: null },
      });
    });
  });

  describe('PATCH /api/notifications/[id]', () => {
    const context = { params: Promise.resolve({ id: 'n-1' }) };

    it('marks a notification as read', async () => {
      mocks.updateMany.mockResolvedValue({ count: 1 });
      mocks.findUnique.mockResolvedValue({
        id: 'n-1',
        userId: 'user-123',
        readAt: new Date(),
        title: 'Hello',
      });

      const request = new Request('http://localhost/api/notifications/n-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ read: true }),
      });
      const response = await PATCH(request, context);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.notification.id).toBe('n-1');
      expect(mocks.updateMany).toHaveBeenCalledWith({
        where: { id: 'n-1', userId: 'user-123', readAt: null },
        data: { readAt: expect.any(Date) },
      });
    });

    it('returns 404 if the notification does not exist', async () => {
      mocks.updateMany.mockResolvedValue({ count: 0 });
      mocks.findFirst.mockResolvedValue(null);

      const request = new Request('http://localhost/api/notifications/missing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ read: true }),
      });
      const response = await PATCH(request, { params: Promise.resolve({ id: 'missing' }) });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/notifications/[id]', () => {
    it('deletes a notification', async () => {
      mocks.deleteMany.mockResolvedValue({ count: 1 });

      const request = new Request('http://localhost/api/notifications/n-1', {
        method: 'DELETE',
        headers: {},
      });
      const response = await DELETE(request, { params: Promise.resolve({ id: 'n-1' }) });

      expect(response.status).toBe(200);
      expect(mocks.deleteMany).toHaveBeenCalledWith({
        where: { id: 'n-1', userId: 'user-123' },
      });
    });

    it('returns 404 when nothing was deleted', async () => {
      mocks.deleteMany.mockResolvedValue({ count: 0 });

      const request = new Request('http://localhost/api/notifications/missing', {
        method: 'DELETE',
        headers: {},
      });
      const response = await DELETE(request, { params: Promise.resolve({ id: 'missing' }) });

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/notifications/mark-all-read', () => {
    it('marks all notifications as read', async () => {
      mocks.updateMany.mockResolvedValue({ count: 5 });

      const request = new Request('http://localhost/api/notifications/mark-all-read', {
        method: 'POST',
        headers: {},
      });
      const response = await POST_MARK_ALL(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.count).toBe(5);
      expect(mocks.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-123', readAt: null },
        data: { readAt: expect.any(Date) },
      });
    });
  });
});
