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

// ponytail: typed for MV3 Promise API; @types/chrome not installed in this package
type ChromeStorageLocal = {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
};

function getChromeStorage(): ChromeStorageLocal | undefined {
  return (globalThis as { chrome?: { storage?: { local?: ChromeStorageLocal } } }).chrome?.storage?.local;
}

function isAuthSession(value: unknown): value is AuthSession {
  return Boolean(value && typeof value === "object" && "accessToken" in value && "user" in value);
}

export async function getAuthSession(): Promise<AuthSession | null> {
  const storage = getChromeStorage();
  if (!storage) return null;
  const items = await storage.get(AUTH_SESSION_STORAGE_KEY);
  return isAuthSession(items[AUTH_SESSION_STORAGE_KEY]) ? items[AUTH_SESSION_STORAGE_KEY] : null;
}

export async function setAuthSession(session: AuthSession): Promise<void> {
  await getChromeStorage()?.set({ [AUTH_SESSION_STORAGE_KEY]: session });
}

export async function clearAuthSession(): Promise<void> {
  await getChromeStorage()?.remove(AUTH_SESSION_STORAGE_KEY);
}
