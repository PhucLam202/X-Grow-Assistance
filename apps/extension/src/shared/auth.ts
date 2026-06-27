const AUTH_SESSION_STORAGE_KEY = "x_comment_assistant_auth_session_v1";

export type AuthUser = {
  userId: string;
  email?: string;
  phone?: string;
  name?: string;
};

export type AuthSession = {
  accessToken: string;
  user: AuthUser;
};

type ChromeStorageArea = {
  get(key: string, callback: (items: Record<string, unknown>) => void): void;
  set(items: Record<string, unknown>, callback?: () => void): void;
  remove(key: string, callback?: () => void): void;
};

function getChromeStorage(): ChromeStorageArea | undefined {
  const maybeChrome = (globalThis as { chrome?: { storage?: { local?: ChromeStorageArea } } }).chrome;
  return maybeChrome?.storage?.local;
}

function isAuthSession(value: unknown): value is AuthSession {
  return Boolean(
    value &&
      typeof value === "object" &&
      "accessToken" in value &&
      "user" in value,
  );
}

export async function getAuthSession(): Promise<AuthSession | null> {
  const storage = getChromeStorage();
  if (!storage) return null;

  return new Promise((resolve) => {
    storage.get(AUTH_SESSION_STORAGE_KEY, (items) => {
      const value = items[AUTH_SESSION_STORAGE_KEY];
      resolve(isAuthSession(value) ? value : null);
    });
  });
}

export async function setAuthSession(session: AuthSession): Promise<void> {
  const storage = getChromeStorage();
  if (!storage) return;

  await new Promise<void>((resolve) => {
    storage.set({ [AUTH_SESSION_STORAGE_KEY]: session }, resolve);
  });
}

export async function clearAuthSession(): Promise<void> {
  const storage = getChromeStorage();
  if (!storage) return;

  await new Promise<void>((resolve) => {
    storage.remove(AUTH_SESSION_STORAGE_KEY, resolve);
  });
}
