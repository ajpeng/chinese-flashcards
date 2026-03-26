# MandarinKit

A full-featured Mandarin learning platform with spaced repetition flashcards, interactive article reading, AI-powered vocabulary lookup, text-to-speech narration, speech practice, and subtitle generation.

**Live:** https://ajpeng.github.io/chinese-flashcards

---

## Features

### 📖 Interactive Article Reader
- Chinese text segmented into clickable words using **nodejieba** (Jieba NLP)
- Click any word to open a definition drawer with pinyin, HSK level, and English meaning
- Pinyin displayed inline above characters as ruby annotations
- Simplified ↔ Traditional script toggle per user preference
- **Azure Cognitive Services TTS** narration with word-level highlight timing — each word lights up as it is spoken
- Double-click any word to start narration from that position
- Save words to your personal flashcard deck directly from the reader

### ✍️ Article Creation with AI Enrichment
- Paste any Chinese text to create a new article
- Two-phase pipeline: fast dictionary segmentation (sync) + background AI enrichment (async)
- **Phase 1** — nodejieba segmentation → CC-CEDICT lookup → HSK level assignment
- **Phase 2** — words missing definitions are sent to **Claude 3.5 Haiku via OpenRouter** for enrichment; progress can be polled
- Set the HSK difficulty level for a new article manually
- AI usage is logged (tokens in/out, estimated USD cost) per article

### 🗂️ Spaced Repetition Flashcards (SM-2)
- HSK 1–6 decks and a personal "Saved" deck for words collected from articles
- Implements the **SM-2 algorithm**: ease factor, interval, repetition count, next-review date
- Deck dashboard with total / studied / due-today counts
- Study session: flip a card, rate difficulty (Again / Hard / Good / Easy)
- Keyboard shortcuts: any key to reveal; ← Hard, → Easy
- Preview mode to browse all words in a deck without studying
- Manual interval override for saved words
- Custom card creation for the Saved deck

### 🔤 Word Detail
- Per-word page with stroke order animation via **HanziWriter**
- Pinyin pronunciation, English definition, HSK level
- Related words sharing the same characters
- Example sentences (simplified, traditional, pinyin, English) from a curated corpus

### 🔊 Text-to-Speech (TTS)
- Azure Neural TTS with word-boundary events mapped to character offsets
- Synthesized audio cached by SHA-256 hash of `text + voice + rate` to avoid repeat API calls
- Configurable speech rate and voice per user
- Cache stats and cleanup endpoints

### 🎙️ Speech Practice
- Record yourself reading a passage
- **Browser STT** (Web Speech API) and **server-side STT** (Azure Speech SDK) options
- Audio file upload for offline recordings (WAV, MP3, M4A, FLAC, MP4)
- Character-level diff using **Wagner-Fischer LCS** highlights correct / wrong / missing / extra characters
- Accuracy score per session

### 💬 Subtitle Generator
- Upload an audio or video file (up to **500 MB**) and receive an `.srt` subtitle file
- Powered by **OpenAI Whisper** (`whisper-1`) via the Transcriptions API
- Supports Chinese Simplified, Chinese Traditional, English, Japanese, Korean
- Files are converted to 64 kbps MP3 and split into ≤23 MB chunks (Whisper API limit) automatically — no manual prep needed
- Async job system: upload returns a `jobId` immediately; the frontend polls for progress
- Progress bar with ETA shown during processing
- Job history persisted in `localStorage`; jobs survive page navigation and refreshes
- SRT timestamps are correctly offset when multiple chunks are joined
- Stale in-progress jobs are automatically marked failed on server restart

### 🔐 Authentication & Settings
- **Patreon OAuth 2.0** login — progress and settings synced per account
- JWT access tokens with secure `HttpOnly` cookie-based refresh tokens
- Per-user preferences: pinyin style (marks/numbers), font size, speech rate, TTS voice, script variant (simplified/traditional)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend  (React 19 + TypeScript, deployed to GitHub Pages)    │
│                                                                 │
│  Articles   Flashcards   SpeechPractice   Subtitles   Settings  │
│       └──────────┴─────────────┴──────────────┴────────┘        │
│                             │ HTTPS                             │
└─────────────────────────────┼───────────────────────────────────┘
                              │
┌─────────────────────────────┼───────────────────────────────────┐
│  Backend  (Express + TypeScript, deployed to Fly.io)            │
│                                                                 │
│  /api/articles   → nodejieba + CC-CEDICT + AI enrichment        │
│  /api/srs        → SM-2 spaced repetition engine                │
│  /api/words      → dictionary + AI on-demand lookup             │
│  /api/tts        → Azure Neural TTS with caching                │
│  /api/stt        → Azure Speech-to-Text                         │
│  /api/subtitles  → OpenAI Whisper async transcription           │
│  /api/auth       → Patreon OAuth + JWT                          │
│                                                                 │
│  PostgreSQL (Neon) via Prisma ORM                               │
└─────────────────────────────────────────────────────────────────┘
```

### NLP Pipeline (Article Creation)

1. Text segmented with `nodejieba.cut()`
2. Each segment looked up in **CC-CEDICT** (120k-entry Chinese–English dictionary, loaded in-memory)
3. Cross-referenced against **HSK word lists** (levels 1–6) for difficulty assignment
4. Matched words stored in PostgreSQL linked to the article
5. Words missing definitions queued for async AI enrichment via **Claude 3.5 Haiku**

### Spaced Repetition (SM-2)

- New cards start with `interval=1 day`, `easeFactor=2.5`, `repetitions=0`
- **Easy (5)** → `interval × easeFactor`, ease factor increases slightly
- **Good (4)** → `interval × easeFactor`
- **Hard (2)** → `interval × 1.2`, ease factor decreases
- **Again (0)** → `interval` resets to 1, ease factor decreases
- Minimum ease factor capped at 1.3

### Subtitle Pipeline

1. Multer receives the upload (up to 500 MB)
2. ffmpeg converts to 64 kbps mono MP3; ffprobe measures total duration
3. If the file exceeds 23 MB, ffmpeg segments it into time-based chunks
4. Each chunk is sent to `whisper-1` with `response_format: srt`
5. Chunk SRT blocks are timestamp-shifted and renumbered before joining
6. Final SRT stored in PostgreSQL; frontend downloads it on completion

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite + SWC |
| Backend | Node.js 20, Express, TypeScript |
| Database | PostgreSQL (Neon) via Prisma ORM 7 |
| NLP | nodejieba, CC-CEDICT, HSK word lists |
| AI | Claude 3.5 Haiku (OpenRouter) — word enrichment |
| TTS | Azure Cognitive Services Neural TTS |
| STT | Azure Cognitive Services Speech SDK |
| Subtitles | OpenAI Whisper API + ffmpeg |
| Auth | Patreon OAuth 2.0, JWT + HttpOnly cookies |
| Infra | Fly.io (backend), GitHub Pages (frontend), GitHub Actions CI/CD |

---

## Local Development

### Prerequisites

- Node.js 20+
- PostgreSQL 14+ (or a Neon connection string)
- Azure Cognitive Services key (TTS/STT)
- OpenAI API key (subtitle generation)
- OpenRouter API key (AI word enrichment)
- Patreon OAuth app credentials

### Backend

```bash
cd backend
npm install
cp .env.example .env   # fill in values below
npx prisma migrate dev
npm run dev            # http://localhost:3001
```

**Backend `.env`**

```bash
DATABASE_URL="postgresql://..."
JWT_SECRET="..."
PATREON_CLIENT_ID="..."
PATREON_CLIENT_SECRET="..."
PATREON_REDIRECT_URI="http://localhost:3001/api/auth/patreon/callback"
FRONTEND_URL="http://localhost:5173"
AZURE_SPEECH_KEY="..."
AZURE_SPEECH_REGION="eastus"
OPENAI_API_KEY="sk-..."
OPENROUTER_API_KEY="..."
ENABLE_AI_LOOKUP=true
NODE_ENV=development
PORT=3001
```

### Frontend

```bash
cd frontend
npm install
# create frontend/.env:
# VITE_API_URL=http://localhost:3001
npm run dev            # http://localhost:5173
```

---

## API Reference

### Articles
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/articles` | List all articles with segmented words |
| `POST` | `/api/articles` | Submit text for segmentation + AI enrichment |
| `GET` | `/api/articles/:id/status` | Poll enrichment job status |

### Spaced Repetition
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/srs/decks` | Deck stats for HSK 1–6 |
| `GET` | `/api/srs/study/:level` | Fetch up to 20 due cards |
| `POST` | `/api/srs/review` | Submit review result (SM-2 update) |
| `GET` | `/api/srs/preview/:level` | Browse all words in a deck |
| `GET` | `/api/srs/saved` | Saved deck stats |
| `GET` | `/api/srs/study/saved` | Fetch due cards from saved deck |
| `POST` | `/api/srs/saved/custom` | Create a custom card |
| `DELETE` | `/api/srs/saved/:wordId` | Remove a word from saved deck |

### Words
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/words/lookup?q=字` | On-demand dictionary + AI lookup |
| `GET` | `/api/words/detail?q=字` | Rich detail: definition, related words, examples |

### TTS / STT
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/tts` | Synthesize speech with word-level timings |
| `POST` | `/api/stt/file` | Transcribe uploaded audio file |

### Subtitles
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/subtitles/upload` | Upload audio/video → returns `jobId` |
| `GET` | `/api/subtitles/jobs/:id` | Poll job status, progress %, and SRT content |

### Auth
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/auth/patreon` | Initiate Patreon OAuth flow |
| `GET` | `/api/auth/patreon/callback` | OAuth callback |
| `GET` | `/api/auth/me` | Current user info |
| `POST` | `/api/auth/refresh` | Refresh access token |
| `POST` | `/api/auth/logout` | Clear refresh token cookie |
| `PATCH` | `/api/auth/settings` | Update user preferences |

### Misc
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/api/segmentation/analyze` | Segment Chinese text (up to 10,000 chars) |
