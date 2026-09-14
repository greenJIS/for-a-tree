import { beforeEach, describe, expect, it } from 'vitest';
import { PinAuth } from './pinAuth';

describe('PinAuth', () => {
  let store: Record<string, string>;
  let mockStorage: Storage;
  let auth: PinAuth;

  beforeEach(() => {
    store = {};
    mockStorage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
      clear: () => {
        store = {};
      },
      key: () => null,
      length: 0,
    } as Storage;
    auth = new PinAuth(mockStorage);
  });

  it('reports no PIN set initially', () => {
    expect(auth.hasPin()).toBe(false);
  });

  it('reports a PIN set after setPin resolves', async () => {
    await auth.setPin('1234');
    expect(auth.hasPin()).toBe(true);
  });

  it('verifies the correct PIN', async () => {
    await auth.setPin('4269');
    await expect(auth.verifyPin('4269')).resolves.toBe(true);
  });

  it('rejects an incorrect PIN', async () => {
    await auth.setPin('4269');
    await expect(auth.verifyPin('0000')).resolves.toBe(false);
  });

  it('rejects any PIN when none has been set', async () => {
    await expect(auth.verifyPin('1234')).resolves.toBe(false);
  });

  it('never stores the PIN in plaintext', async () => {
    await auth.setPin('1234');
    const serialized = JSON.stringify(store);
    expect(serialized).not.toContain('1234');
  });

  it('two PinAuth instances sharing storage agree on the same PIN', async () => {
    await auth.setPin('7777');
    const second = new PinAuth(mockStorage);
    expect(second.hasPin()).toBe(true);
    await expect(second.verifyPin('7777')).resolves.toBe(true);
  });

  it('handles thrown storage access errors gracefully', async () => {
    const originalWindow = (globalThis as unknown as { window?: unknown }).window;
    try {
      const mockWindow = {};
      Object.defineProperty(mockWindow, 'localStorage', {
        get: () => {
          throw new DOMException('Access denied', 'SecurityError');
        },
        configurable: true,
      });
      (globalThis as unknown as { window: unknown }).window = mockWindow;

      const restrictedAuth = new PinAuth();
      expect(restrictedAuth.hasPin()).toBe(false);
      await expect(restrictedAuth.verifyPin('1234')).resolves.toBe(false);
      await expect(restrictedAuth.setPin('1234')).resolves.toBeUndefined();
    } finally {
      if (originalWindow !== undefined) {
        (globalThis as unknown as { window: unknown }).window = originalWindow;
      } else {
        delete (globalThis as unknown as { window?: unknown }).window;
      }
    }
  });
});
