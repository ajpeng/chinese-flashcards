# Chinese Flashcards

An interactive Mandarin reading and vocabulary app with spaced repetition, text-to-speech, and speech recognition — built to help learners read real Chinese articles at their HSK level.

**Live demo:** https://ajpeng.github.io/chinese-flashcards

---

## Features

### 📖 Interactive Article Reader
- Chinese text segmented into clickable words using **nodejieba** (a Node.js binding for the Jieba NLP library)
- Click any word to open a definition drawer with pinyin, HSK level, and English meaning
- Pinyin displayed inline above characters (toggleable ruby annotation)
- Simplified ↔ Traditional script toggle
- TTS narration with **Azure Cognitive Services** — word-level timing highlights each word as it's spoken
- Double-click any word to start reading from that position

### 🗂️ Spaced Repetition Flashcards (SM-2)
- Save words from articles directly to your personal deck
- Implements the **SM-2 algorithm** for optimal review scheduling
- HSK 1–6 decks with per-deck stats (total, studied, due today)
- Keyboard shortcuts: any key to reveal, ← Hard / → Easy
- Preview mode to browse all words in a deck

### 🎙️ Speech Practice
- Record yourself reading a passage using the **Web Speech API**
- Character-level diff using **Wagner-Fischer LCS** algorithm highlights correct, wrong, and missed characters
- Accuracy score computed per session

### 🔐 Authentication
- Patreon OAuth login — word progress and settings are synced per user
- JWT access tokens with secure cookie-based refresh
- Per-user settings: font size, speech rate, TTS voice, pinyin style, script variant

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (React 19 + TypeScript, hosted on GitHub Pages)   │
│                                                             │
│  Articles.tsx   Flashcards.tsx   SpeechPractice.tsx         │
│       │               │                  │                  │
│       └───────────────┴──────────────────┘                  │
│                       │ HTTPS                               │
└───────────────────────┼─────────────────────────────────────┘
                        │
┌───────────────────────┼─────────────────────────────────────┐
│  Backend (Express + TypeScript, VPS behind Nginx + SSL)     │
│                                                             │
│  /api/articles    → nodejieba segmentation + CC-CEDICT      │
│  /api/srs         → SM-2 spaced repetition engine           │
│  /api/tts         → Azure Cognitive Services TTS            │
│  /api/stt         → Azure Speech-to-Text                    │
│  /api/words       → On-demand dictionary lookup             │
│  /api/auth        → Patreon OAuth + JWT                     │
│                                                             │
│  PostgreSQL (AWS RDS) via Prisma ORM                        │
└─────────────────────────────────────────────────────────────┘
```

### NLP Pipeline

When an article is submitted, the backend:
1. Segments the text with `nodejieba.cut()`
2. Looks up each segment in **CC-CEDICT** (a 120k-entry Chinese–English dictionary)
3. Cross-references against **HSK word lists** (levels 1–6) to assign difficulty
4. Stores matched words in PostgreSQL linked to the article
5. Unmatched characters are available for on-demand lookup via `/api/words/lookup`

### Spaced Repetition

Implements the [SM-2 algorithm](https://en.wikipedia.org/wiki/SuperMemo#SM-2_algorithm):
- New cards enter with `interval=1`, `easeFactor=2.5`, `repetitions=0`
- Quality score 5 (Easy) increases interval × easeFactor; quality 2 (Hard) resets interval
- Due date computed from last review + interval

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL (AWS RDS) via Prisma ORM |
| NLP | nodejieba, CC-CEDICT, HSK word lists |
| Speech | Azure Cognitive Services (TTS + STT) |
| Auth | Patreon OAuth 2.0, JWT |
| Infra | Nginx, GitHub Actions CI/CD |

---

## Local Development

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Azure Cognitive Services key (for TTS/STT)
- Patreon OAuth app credentials (for auth)

### Backend

```bash
cd backend
npm install
cp .env.example .env   # fill in DB_URL, AZURE_KEY, PATREON_CLIENT_*, JWT_SECRET
npx prisma migrate dev
npm run dev            # http://localhost:3000
```

### Frontend

```bash
cd frontend
npm install
# create frontend/.env with:
# VITE_API_URL=http://localhost:3000
npm run dev            # http://localhost:5173
```

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/articles` | List all articles with segmented words |
| `POST` | `/api/articles` | Submit article text for NLP processing |
| `GET` | `/api/srs/decks` | Get SRS deck stats per HSK level |
| `GET` | `/api/srs/study/:level` | Fetch due cards for a study session |
| `POST` | `/api/srs/review` | Submit review result (SM-2 update) |
| `GET` | `/api/srs/preview/:level` | Browse all words in a deck |
| `GET` | `/api/words/lookup?q=字` | On-demand dictionary lookup |
| `POST` | `/api/tts` | Synthesize speech with word timings |
| `POST` | `/api/stt` | Transcribe audio to text |
| `GET` | `/api/auth/patreon` | Initiate Patreon OAuth flow |
| `GET` | `/health` | Health check |
