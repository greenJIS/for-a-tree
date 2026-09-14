/**
 * PIN gate for the secret debug menu. Hashes the PIN with a per-install
 * random salt before persisting -- this deters casual discovery via
 * localStorage in devtools, it is not a real access-control boundary (see
 * docs/superpowers/specs/2026-09-14-secret-debug-menu-design.md).
 */

const HASH_KEY = 'fat_debug_pin_hash';
const SALT_KEY = 'fat_debug_pin_salt';

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function randomSaltHex(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toHex(bytes.buffer);
}

async function hashPin(pin: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return toHex(digest);
}

export class PinAuth {
  readonly #storage: Storage | null;

  constructor(storage?: Storage) {
    if (storage) {
      this.#storage = storage;
    } else if (typeof window !== 'undefined' && window.localStorage) {
      this.#storage = window.localStorage;
    } else {
      this.#storage = null;
    }
  }

  hasPin(): boolean {
    return this.#storage?.getItem(HASH_KEY) != null;
  }

  async setPin(pin: string): Promise<void> {
    if (!this.#storage) return;
    const salt = randomSaltHex();
    const hash = await hashPin(pin, salt);
    this.#storage.setItem(SALT_KEY, salt);
    this.#storage.setItem(HASH_KEY, hash);
  }

  async verifyPin(pin: string): Promise<boolean> {
    if (!this.#storage) return false;
    const salt = this.#storage.getItem(SALT_KEY);
    const storedHash = this.#storage.getItem(HASH_KEY);
    if (!salt || !storedHash) return false;
    const hash = await hashPin(pin, salt);
    return hash === storedHash;
  }
}

export const pinAuth = new PinAuth();
