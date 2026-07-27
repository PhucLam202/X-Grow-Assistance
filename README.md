# X Comment Assistant

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](#)
[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs)](https://nestjs.com/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev/)
[![Chrome Extension](https://img.shields.io/badge/Chrome%20Extension-MV3-4285F4?logo=googlechrome)](https://developer.chrome.com/docs/extensions/)

**X Comment Assistant** — AI-powered comment suggestions for X/Twitter, inside a Chrome side panel. Detect a post, generate context-aware replies, copy the best one, paste manually. The extension never touches the X reply box.

---

## Features

| Feature | Description |
|---------|-------------|
| **Post Detection** | Auto-detect posts via click, scroll, or URL navigation on x.com |
| **AI Reply Generation** | Context-aware suggestions via OpenAI / DeepSeek / Gemini / Claude / OpenRouter |
| **Image Understanding** | Vision analysis for posts with screenshots, memes, or charts |
| **Niche Classification** | Auto-classifies 20+ niches (tech, anime, football, crypto, …) with safety policies per niche |
| **Opportunity Scoring** | Scores any post on 9 dimensions: freshness, engagement, reply surface, spam risk, … |
| **Feed Intelligence** | Scan visible feed, batch-score opportunities, pick the best post to engage |
| **Comment History** | Saved generations with copy tracking and performance feedback |
| **Authentication** | Secure email/password registration & login with persistent or browser-session temporary auth (Remember Login) |
| **Safe Copy Flow** | Copy-only, no auto-paste, no DOM injection, no auto-send |
| **i18n** | Vietnamese + English interface (defaults to English, fully customizable) |

---

## Architecture

```
┌──────────────────────────┐     ┌──────────────────────────────┐
│   Chrome Extension        │     │   NestJS API                 │
│                           │     │                              │
│  ┌─────────────────────┐  │     │  ┌────────────────────────┐  │
│  │ contentScript.ts    │──┼─────┼─►│ POST /api/v1/reply-packs│  │
│  │ (DOM detection)     │  │     │  │ POST /api/v1/analyze/   │  │
│  └──────────┬──────────┘  │     │  │ POST /api/v1/feed/      │  │
│             │             │     │  │ POST /api/v1/analytics/ │  │
│  ┌──────────▼──────────┐  │     │  └───────────┬────────────┘  │
│  │ sidepanel/App.tsx   │  │     │              │               │
│  │ (React UI)          │  │     │  ┌───────────▼────────────┐  │
│  └─────────────────────┘  │     │  │  AI Providers          │  │
│                           │     │  │  OpenAI / DeepSeek     │  │
│  ┌─────────────────────┐  │     │  │  Gemini / Claude       │  │
│  │ background.ts       │  │     │  │  OpenRouter            │  │
│  │ (service worker)    │  │     │  └────────────────────────┘  │
│  └─────────────────────┘  │     │                              │
└──────────────────────────┘     │  ┌────────────────────────┐  │
                                 │  │  MongoDB               │  │
                                 │  │  (analytics, history)   │  │
                                 │  └────────────────────────┘  │
                                 └──────────────────────────────┘
```

---

## Project Structure

```
x-comment-assistant/
├── apps/
│   ├── api/                    # NestJS 11 backend (194 source files)
│   │   ├── src/
│   │   │   ├── ai/             # Multi-provider AI (5 providers, vision, orchestration)
│   │   │   │   ├── providers/  # OpenAI, DeepSeek, Gemini, Claude, OpenRouter
│   │   │   │   ├── parsers/    # JSON repair, reply pack parsing
│   │   │   │   ├── prompt/     # System prompts for text + vision
│   │   │   │   └── orchestrator/
│   │   │   ├── modules/generations/  # Full reply-pack pipeline
│   │   │   │   ├── niche/           # 20 niche classifiers + policies + signals
│   │   │   │   ├── candidates/      # Candidate generation, strategy slots
│   │   │   │   ├── scoring/         # Empathy, diversity, rule scoring
│   │   │   │   ├── validation/      # Safety, factuality, duplicate detection
│   │   │   │   └── pipeline/        # Pipeline orchestrator
│   │   │   ├── comment-intelligence/  # AI harness + tool router
│   │   │   ├── analytics/           # Usage tracking, comment history
│   │   │   ├── feed-intelligence/   # Feed snapshot analysis
│   │   │   ├── opportunity/         # Post opportunity scoring engine
│   │   │   ├── vision/              # Image analysis
│   │   │   ├── auth/                # JWT auth
│   │   │   ├── common/              # Filters, interceptors, validation
│   │   │   └── infrastructure/      # Cache, DB
│   │   ├── test/
│   │   └── docs/ (removed — planning artifacts)
│   ├── extension/              # Chrome extension MV3 (21 source files)
│   │   ├── src/
│   │   │   ├── content/        # contentScript.ts + postExtractor.ts
│   │   │   ├── sidepanel/      # React UI (App.tsx, styles.css)
│   │   │   ├── shared/         # API client, types, settings, cache
│   │   │   └── i18n/           # Vietnamese + English
│   │   └── public/             # manifest.json
│   └── dashboard/              # React analytics dashboard (7 pages)
│       └── src/pages/          # Overview, Activity, History, Performance, …
├── packages/
│   └── opportunity-scoring/    # Shared scoring engine (API + extension)
└── pnpm-workspace.yaml
```

---

## Quick Start

### 1. Prerequisites

- Node.js 18+
- pnpm 9+
- MongoDB 7+ (for analytics) — *optional, only if you need comment history*
- Chrome / Edge / Brave (for extension)

### 2. Install

```bash
git clone <repo-url>
cd x-comment-assistant
pnpm install
```

### 3. Configure API

```bash
cp apps/api/.env.example apps/api/.env
```

Edit `apps/api/.env` and set at least one AI provider key:

```env
TEXT_AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-your-key-here

# Optional: for image analysis
VISION_AI_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-your-key-here
```

Also set JWT secret for auth:

```env
JWT_SECRET=a-long-random-string
```

### 4. Start Backend API

```bash
cd apps/api
pnpm run start:dev
# → http://127.0.0.1:3001/api/v1
# → Health check: curl http://127.0.0.1:3001/api/v1/health
```

> Keep the API running in a terminal tab. The extension needs it to generate replies.

### 5. Build Chrome Extension

Open a **new terminal tab** (keep API running), then:

```bash
# From project root
cd x-comment-assistant
pnpm build:extension
```

This creates the `apps/extension/dist` folder.

### 6. Load Extension into Chrome

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (toggle top-right)
3. Click **Load unpacked**
4. Select the folder: `x-comment-assistant/apps/extension/dist`
5. The extension icon should appear in the toolbar

> ☝️ Repeat steps 3-4 after every `pnpm build:extension` if you modify the code.
### 7. Use the Extension

1. Go to [x.com](https://x.com) and open any post
2. Click the extension icon in the toolbar → side panel opens
3. Access authentication:
   - Toggle between **Login** or **Create account** using the tabs or the quick text link under the form.
   - Enter your email and password (minimum 8 characters).
   - Use the **Remember login** checkbox: if checked, you will stay logged in permanently; if unchecked, closing the browser will automatically sign you out.
4. Once logged in, click **Detect current X post**
5. The post appears in the side panel with an opportunity score
6. Choose your niche, tone, length, etc. (you can change the interface and response language in the settings menu)
7. Click **Generate replies**
8. Wait ~10-20s for AI to finish
9. Copy a suggestion → manually paste it into the X reply box

### Run on the same machine

```
┌─ Terminal 1 ──┐    ┌─ Terminal 2 ──┐    ┌─ Chrome ────────────┐
│ pnpm start:dev │    │ pnpm build    │    │ chrome://extensions │
│ (API :3001)    │    │ (extension)   │    │ Load unpacked dist  │
└────────────────┘    └────────────────┘    └─────────────────────┘
```

---

## Configuration

Set in `apps/api/.env`:

| Variable | Default | Required |
|----------|---------|----------|
| `TEXT_AI_PROVIDER` | `deepseek` | Yes |
| `VISION_AI_PROVIDER` | `openrouter` | For image analysis |
| `DEEPSEEK_API_KEY` | — | If using DeepSeek |
| `OPENAI_API_KEY` | — | If using OpenAI |
| `GEMINI_API_KEY` | — | If using Gemini |
| `CLAUDE_API_KEY` | — | If using Claude |
| `OPENROUTER_API_KEY` | — | If using OpenRouter |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/x_comment_assistant` | For history |
| `JWT_SECRET` | — | For auth |

Supported AI providers: `openai` · `deepseek` · `gemini` · `claude` · `openrouter`

---

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev:api` | Start API in watch mode |
| `pnpm build:api` | Build API |
| `pnpm build:extension` | Build Chrome extension |
| `pnpm test:api` | Run API tests (46 spec files) |
| `pnpm typecheck` | TypeScript check all apps |

---

## Safety & Privacy

- **Copy only** — the extension never inserts text into X
- **No auto-paste, no auto-send**
- **High-risk suggestions** are non-copyable by default
- **No data collection** beyond what's needed for comment history
- **All AI calls** go through your own API keys

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | NestJS 11, TypeScript 5.7 |
| Database | MongoDB 7 (raw driver) |
| AI | OpenAI / DeepSeek / Gemini / Claude / OpenRouter |
| Extension | Chrome MV3, React 19, Vite 7 |
| Dashboard | React 19, Recharts 2 |
| i18n | i18next (Vietnamese + English) |
| Validation | class-validator + class-transformer |

---

## License

MIT
