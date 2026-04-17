// File attachments for assistant messages.
//
// Storage: /app/data/assistant/<userId>/<sha256>.<ext>
// Allowed MIME: image/{png,jpeg,webp,gif}, application/pdf, text/{plain,markdown,csv}.
// Text and PDF inputs get plain-text extracted once on upload; images are
// kept as files and only inlined for vision-capable providers at send time.

import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import type { AssistantAttachmentKind } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { extractPdfText } from './pdf';

export const STORAGE_ROOT = process.env.ASSISTANT_ATTACHMENTS_DIR
  ?? '/app/data/assistant';

const ALLOWED = new Map<string, { kind: AssistantAttachmentKind; ext: string }>([
  ['image/png', { kind: 'IMAGE', ext: 'png' }],
  ['image/jpeg', { kind: 'IMAGE', ext: 'jpg' }],
  ['image/webp', { kind: 'IMAGE', ext: 'webp' }],
  ['image/gif', { kind: 'IMAGE', ext: 'gif' }],
  ['application/pdf', { kind: 'PDF', ext: 'pdf' }],
  ['text/plain', { kind: 'TEXT', ext: 'txt' }],
  ['text/markdown', { kind: 'TEXT', ext: 'md' }],
  ['text/csv', { kind: 'TEXT', ext: 'csv' }],
]);

export class AttachmentError extends Error {}

export interface SaveAttachmentInput {
  userId: string;
  conversationId?: string;
  filename: string;
  mimeType: string;
  bytes: Buffer;
  maxBytes: number;
}

export async function saveAttachment(input: SaveAttachmentInput) {
  const meta = ALLOWED.get(normalizeMime(input.mimeType));
  if (!meta) {
    throw new AttachmentError(`Unsupported attachment type: ${input.mimeType}`);
  }
  if (input.bytes.byteLength > input.maxBytes) {
    throw new AttachmentError(`File exceeds ${input.maxBytes} bytes`);
  }
  if (!sniffMatches(input.bytes, meta.kind)) {
    throw new AttachmentError('File contents do not match declared type');
  }

  const sha = createHash('sha256').update(input.bytes).digest('hex');

  const existing = await prisma.assistantAttachment.findUnique({
    where: { userId_sha256: { userId: input.userId, sha256: sha } },
  });
  if (existing && !existing.deletedAt) return existing;

  const dir = path.join(STORAGE_ROOT, input.userId);
  await fs.mkdir(dir, { recursive: true });
  const storagePath = path.join(dir, `${sha}.${meta.ext}`);
  await fs.writeFile(storagePath, input.bytes);

  let extractedText: string | null = null;
  if (meta.kind === 'PDF') {
    extractedText = (await extractPdfText(input.bytes).catch(() => '')) || null;
  } else if (meta.kind === 'TEXT') {
    extractedText = input.bytes.toString('utf8').slice(0, 2_000_000);
  }

  return prisma.assistantAttachment.create({
    data: {
      userId: input.userId,
      conversationId: input.conversationId ?? null,
      kind: meta.kind,
      mimeType: normalizeMime(input.mimeType),
      filename: input.filename.slice(0, 240),
      byteSize: input.bytes.byteLength,
      storagePath,
      extractedText,
      sha256: sha,
    },
  });
}

export async function softDeleteAttachment(userId: string, id: string) {
  const att = await prisma.assistantAttachment.findFirst({
    where: { id, userId },
  });
  if (!att) return null;
  await prisma.assistantAttachment.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  fs.unlink(att.storagePath).catch(() => {});
  return att;
}

// Magic-byte sniff — just enough to reject mislabelled uploads.
function sniffMatches(bytes: Buffer, kind: AssistantAttachmentKind): boolean {
  if (bytes.byteLength < 4) return false;
  if (kind === 'PDF') return bytes.slice(0, 4).toString() === '%PDF';
  if (kind === 'IMAGE') {
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return true; // jpeg
    if (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    )
      return true; // png
    if (bytes.slice(0, 4).toString() === 'GIF8') return true;
    if (
      bytes.slice(0, 4).toString() === 'RIFF' &&
      bytes.slice(8, 12).toString() === 'WEBP'
    )
      return true;
    return false;
  }
  // TEXT — accept anything that's mostly printable.
  const sample = bytes.slice(0, 512).toString('utf8');
  const printable = sample.replace(/[^\x09\x0a\x0d\x20-\x7e]/g, '').length;
  return printable / Math.max(sample.length, 1) > 0.85;
}

function normalizeMime(mime: string): string {
  return mime.split(';')[0].trim().toLowerCase();
}
