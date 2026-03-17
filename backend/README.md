# Backend — Chinese Flashcards API

Express + TypeScript REST API deployed to Fly.io, backed by PostgreSQL on Neon via Prisma ORM.

## Tech Stack

- **Framework**: Express.js 4
- **Language**: TypeScript 5.7
- **ORM**: Prisma 7 (PostgreSQL on Neon)
- **Auth**: Patreon OAuth 2.0 + JWT (HttpOnly cookie refresh)
- **NLP**: nodejieba, CC-CEDICT (in-memory), HSK word lists
- **AI**: Claude 3.5 Haiku via OpenRouter (word enrichment)
- **TTS**: Azure Cognitive Services Neural TTS
- **STT**: Azure Cognitive Services Speech SDK
- **Subtitles**: OpenAI Whisper API + ffmpeg
- **Logging**: pino + pino-http (structured JSON)
- **Container**: Docker multi-stage build (`node:20-alpine` + ffmpeg)

## Database Models

| Model | Purpose |
|---|---|
| `User` | Auth, OAuth identity, per-user preferences |
| `Article` | User-submitted Chinese text + segmented words |
| `Word` | Vocabulary entries (simplified, pinyin, English, HSK level, source) |
| `Flashcard` | SM-2 state per user × word (ease factor, interval, repetitions, next review) |
| `ExampleSentence` | Curated sentence corpus (simplified, traditional, pinyin, English) |
| `AiUsageLog` | Token counts and estimated cost per AI enrichment call |
| `SubtitleJob` | Async Whisper transcription job state (status, progress %, SRT content) |
| `TTSCache` | SHA-256-keyed cache of Azure TTS audio + word timings |

## API Routes

### `/api/articles`
- `GET /` — list all articles with associated words
- `POST /` — segment text, look up words, start async AI enrichment; returns article immediately
- `GET /:id/status` — poll enrichment phase status

### `/api/srs`
- `GET /decks` — HSK 1–6 deck stats (total / studied / due)
- `GET /study/:level` — up to 20 due cards for a study session
- `GET /study/saved` — due cards from the personal Saved deck
- `POST /review` — submit SM-2 review result
- `GET /preview/:level` — browse all words in a deck
- `GET /preview/saved` — browse all saved words
- `POST /saved/custom` — create a custom card in the Saved deck
- `DELETE /saved/:wordId` — remove a word from Saved
- `DELETE /saved` — clear the entire Saved deck
- `PATCH /saved/:wordId/interval` — manually set review interval

### `/api/words`
- `GET /lookup?q=字` — CC-CEDICT → DB cache → AI lookup chain
- `GET /detail?q=字` — definition + related words + example sentences

### `/api/tts`
- `POST /` — synthesize speech with word-boundary timings (cached)
- `GET /cache/stats` — cache entry count and size
- `DELETE /cache/cleanup` — remove entries not used in 30+ days
- `GET /health` — Azure TTS service connectivity

### `/api/stt`
- `POST /file` — transcribe uploaded audio file (Azure Speech)
- `GET /test` — configuration info

### `/api/subtitles`
- `POST /upload` — receive audio/video file (up to 500 MB), create `SubtitleJob`, kick off background transcription; returns `{ jobId }`
- `GET /jobs/:id` — poll status, `progressPct`, and `srtContent` when done

### `/api/segmentation`
- `POST /analyze` — segment Chinese text (up to 10,000 characters)

### `/api/auth`
- `GET /patreon` — initiate Patreon OAuth
- `GET /patreon/callback` — exchange code for tokens, set cookie
- `GET /me` — current user info
- `POST /refresh` — issue new access token from refresh cookie
- `POST /logout` — clear refresh token cookie
- `PATCH /settings` — update user preferences

### `/api/flashcards`
- `POST /` — create flashcard
- `GET /` — list user's flashcards
- `DELETE /:wordId` — delete flashcard

### `/health`
- `GET /` — `{ status, timestamp, uptime, env }`

## Environment Variables

```bash
# Database
DATABASE_URL="postgresql://..."

# Auth
JWT_SECRET="..."
PATREON_CLIENT_ID="..."
PATREON_CLIENT_SECRET="..."
PATREON_REDIRECT_URI="https://api.ajpeng.ca/api/auth/patreon/callback"
FRONTEND_URL="https://ajpeng.github.io"

# Azure (TTS + STT)
AZURE_SPEECH_KEY="..."
AZURE_SPEECH_REGION="eastus"

# OpenAI (subtitle generation via Whisper)
OPENAI_API_KEY="sk-..."

# OpenRouter (AI word enrichment via Claude)
OPENROUTER_API_KEY="..."
ENABLE_AI_LOOKUP=true
MAX_LOOKUPS_PER_ARTICLE=50

# Server
NODE_ENV=production
PORT=3001
```

## Local Development

```bash
npm install
cp .env.example .env   # fill in values above
npx prisma migrate dev # create/apply migrations
npm run dev            # http://localhost:3001  (ts-node-dev hot reload)
```

## Production Build

```bash
npm run build          # prisma generate + tsc
npm run prod           # node dist/bin/www.js
```

## Docker

The multi-stage Dockerfile:
1. **builder** (`node:20-alpine`) — installs deps, generates Prisma client, compiles TypeScript
2. **runner** (`node:20-alpine`) — installs `ffmpeg` + `python3`, copies compiled output

```bash
docker build -t chinese-flashcards-backend .
docker run -p 3001:3001 --env-file .env chinese-flashcards-backend
```

## Deployment (Fly.io)

Migrations run automatically on deploy via the release command in `fly.toml`:

```toml
[deploy]
  release_command = "node_modules/.bin/prisma migrate deploy"
```

Set secrets with:

```bash
fly secrets set OPENAI_API_KEY=sk-...
fly secrets set AZURE_SPEECH_KEY=...
# etc.
```

## Prisma Commands

```bash
npm run prisma:dev        # create + apply migration in dev
npm run prisma:migrate    # apply existing migrations (production)
npm run prisma:generate   # regenerate Prisma client
npm run prisma:push       # push schema without a migration file
npm run prisma:seed       # seed initial data
```

## Project Structure

```
backend/
├── src/
│   ├── app.ts                  # Express app, middleware, route mounts, startup hooks
│   ├── bin/www.ts              # HTTP server entry point
│   ├── db.ts                   # pg Pool for raw queries
│   ├── routes/
│   │   ├── articles.ts         # Article CRUD + 2-phase NLP pipeline
│   │   ├── auth.ts             # Patreon OAuth + JWT
│   │   ├── flashcards.ts       # Flashcard CRUD
│   │   ├── health.ts           # Health check
│   │   ├── segmentation.ts     # Text segmentation endpoint
│   │   ├── srs.ts              # SM-2 study/review/preview/saved
│   │   ├── stt.ts              # Azure Speech-to-Text
│   │   ├── subtitles.ts        # Whisper subtitle generation (async jobs)
│   │   ├── tts.ts              # Azure Neural TTS with caching
│   │   └── words.ts            # Dictionary + AI word lookup
│   ├── services/
│   │   ├── dictionary.service.ts   # CC-CEDICT loader + lookup
│   │   └── segmentation.service.ts # nodejieba wrapper
│   ├── middleware/
│   │   ├── auth.ts             # JWT verification middleware
│   │   └── rateLimit.ts        # express-rate-limit config
│   ├── utils/
│   │   └── logger.ts           # pino logger instance
│   ├── data/
│   │   ├── cedict.json         # Pre-parsed CC-CEDICT (loaded in-memory)
│   │   └── hsk-words.json      # HSK 1–6 word lists
│   └── prisma/
│       └── client.ts           # Prisma client singleton
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── Dockerfile
└── fly.toml
```
