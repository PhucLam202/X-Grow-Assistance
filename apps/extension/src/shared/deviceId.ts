const DEVICE_ID_STORAGE_KEY = 'x_comment_assistant_device_id';

function createDeviceId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `device_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function getDeviceId(): string {
  try {
    const existingDeviceId = localStorage.getItem(DEVICE_ID_STORAGE_KEY);

    if (existingDeviceId) {
      return existingDeviceId;
    }

    const deviceId = createDeviceId();
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
    return deviceId;
  } catch {
    return createDeviceId();
  }
}
