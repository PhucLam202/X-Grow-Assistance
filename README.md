# X Comment Assistant

V1.0 backend is implemented with NestJS. V1.2 Safe Copy Flow adds a Chrome extension side panel that generates reply suggestions and copies the selected suggestion to the clipboard. The extension never inserts text into X and never sends replies automatically.

## Backend

Location:

```txt
apps/api
```

Created with the official NestJS CLI:

```bash
npx @nestjs/cli new api --package-manager pnpm --skip-git
```

### Run Locally

```bash
pnpm --filter api start:dev
```

Default URL:

```txt
http://127.0.0.1:3001/api/v1
```

Env mặc định nằm ở `apps/api/.env.example`. Copy thành `apps/api/.env` nếu muốn đổi port/host.

Nếu `3001` bị trùng, đổi `PORT` sang `3002`, `4001`, `5001`,...

### Build

```bash
pnpm --filter api build
```

### Test

```bash
pnpm --filter api test -- --runInBand
pnpm --filter api lint
```

Health check local:

```bash
curl http://127.0.0.1:3001/api/v1/health
```

## Endpoints

### Health

```http
GET /api/v1/health
```

Response:

```json
{
  "status": "ok",
  "service": "x-comment-assistant-api"
}
```

### Generate Reply Pack

```http
POST /api/v1/generate-reply-pack
```

Request:

```json
{
  "platform": "x",
  "postText": "これはかなり面白いですね",
  "translationLanguage": "vi",
  "targetCommentLanguage": "same_as_original",
  "tone": "short_native",
  "niche": "auto",
  "maxSuggestions": 3
}
```

Response shape:

```json
{
  "detectedLanguage": "ja",
  "translationLanguage": "vi",
  "translation": "...",
  "summary": "...",
  "context": "...",
  "topic": "general",
  "sentiment": "neutral",
  "commentStrategy": "...",
  "suggestions": []
}
```

## Current Status

- NestJS backend scaffolded and running.
- `GET /api/v1/health` implemented.
- `POST /api/v1/generate-reply-pack` implemented with validation.
- Mock reply pack service implemented.
- Chrome extension side panel implemented in `apps/extension`.
- V1.2 Safe Copy Flow implemented: generate suggestions, copy selected suggestion, manual paste/review/send.
- API build and unit tests pass.
- Extension typecheck and build pass.

## Extension

Location:

```txt
apps/extension
```

Build:

```bash
pnpm build:extension
```

Load in Chrome:

```txt
chrome://extensions -> Developer mode -> Load unpacked -> apps/extension/dist
```

Use with local backend:

```bash
pnpm dev:api
```

The extension calls:

```txt
http://127.0.0.1:3001/api/v1/generate-reply-pack
```

To enable real replies, set in `apps/api/.env`:

```txt
TEXT_AI_PROVIDER=deepseek
VISION_AI_PROVIDER=openai
DEEPSEEK_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
DEEPSEEK_MODEL=deepseek-chat
OPENAI_VISION_MODEL=gpt-5-nano
```

Supported providers:

- `openai`
- `gemini`
- `claude`
- `deepseek`

If the provider or key is missing, the API returns an error.

Safety rules in V1.2:

- Copy only.
- No reply-box DOM manipulation.
- No auto-paste.
- No auto-send.
- High-risk suggestions are not copyable by default.

## Next Step

Implement the real AI provider service behind the same response contract and improve post extraction/injection around the side panel.
