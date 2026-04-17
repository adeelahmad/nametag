// Reuse the same AES-256-GCM primitive used for CardDAV passwords so the
// assistant module doesn't introduce a parallel key-management story.

import { encryptPassword, decryptPassword } from '@/lib/carddav/encryption';

export function encryptApiKey(plaintext: string): string {
  return encryptPassword(plaintext);
}

export function decryptApiKey(ciphertext: string): string {
  return decryptPassword(ciphertext);
}
