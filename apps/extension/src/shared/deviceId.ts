const DEVICE_ID_STORAGE_KEY = 'x_comment_assistant_device_id';

export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing) return existing;
    const id = globalThis.crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
    return id;
  } catch {
    return globalThis.crypto.randomUUID();
  }
}
