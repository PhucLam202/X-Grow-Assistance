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
| **Safe Copy Flow** | Copy-only, no auto-paste, no DOM injection, no auto-send |
| **i18n** | Vietnamese + English interface |

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
- MongoDB 7+ (for analytics)
- Chrome (for extension)

### 2. Install

```bash
git clone <repo>
cd x-comment-assistant
pnpm install
```

### 3. Configure

```bash
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env — add at least one AI provider key
```

### 4. Run API

```bash
pnpm dev:api
# → http://127.0.0.1:3001/api/v1
```

### 5. Build + Load Extension

```bash
pnpm build:extension
# → Load apps/extension/dist in chrome://extensions
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
