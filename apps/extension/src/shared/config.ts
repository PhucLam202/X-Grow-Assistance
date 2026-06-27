export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:3001/api/v1";

const parsedMaxSuggestions = Number(
  import.meta.env.VITE_DEFAULT_MAX_SUGGESTIONS ?? 3,
);

export const DEFAULT_MAX_SUGGESTIONS = Number.isFinite(parsedMaxSuggestions)
  ? parsedMaxSuggestions
  : 3;

export const X_OAUTH_AUTHORIZE_URL =
  import.meta.env.VITE_X_OAUTH_AUTHORIZE_URL ?? "";
