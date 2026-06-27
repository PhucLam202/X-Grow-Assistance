/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_DEFAULT_MAX_SUGGESTIONS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
