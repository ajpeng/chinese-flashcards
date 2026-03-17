# Frontend — Chinese Flashcards

React 19 web interface for the Chinese Flashcards learning platform, deployed to GitHub Pages.

## Tech Stack

- **Framework**: React 19
- **Language**: TypeScript 5
- **Build Tool**: Vite + SWC (fast refresh)
- **Routing**: React Router v7
- **Styling**: CSS variables with light/dark/system theme support
- **Linting**: ESLint with TypeScript + React Hooks rules

## Pages

| Route | Component | Description |
|---|---|---|
| `/articles` | `Articles.tsx` | Browse and read Chinese articles with clickable word definitions and TTS narration |
| `/articles/new` | `SegmentArticle.tsx` | Paste Chinese text to create a new article with AI word enrichment |
| `/flashcards` | `Flashcards.tsx` | SM-2 spaced repetition study sessions (HSK 1–6 + Saved deck) |
| `/words/:word` | `WordDetail.tsx` | Stroke order, pinyin, definition, related words, example sentences |
| `/speech` | `SpeechPractice.tsx` | Record pronunciation and get character-level diff feedback |
| `/subtitles` | `Subtitles.tsx` | Upload audio/video to generate an `.srt` subtitle file via OpenAI Whisper |
| `/settings` | `Settings.tsx` | User preferences: pinyin style, font size, speech rate, TTS voice, script variant |
| `/health` | `Health.tsx` | Backend API connectivity status |

## Key Components

- **`NavBar.tsx`** — responsive navigation with links to all sections
- **`ProtectedRoute.tsx`** — redirects unauthenticated users to login
- **`AudioUpload.tsx`** — drag-and-drop audio file picker with MIME validation
- **`SpeechToText.tsx`** — server-side STT client (Azure Speech)
- **`BrowserSTT.tsx`** — Web Speech API wrapper for in-browser STT

## Environment Variables

Create `frontend/.env`:

```bash
VITE_API_URL=http://localhost:3001   # backend base URL
```

## Development

```bash
npm install
npm run dev        # http://localhost:5173
```

## Production Build

```bash
npm run build      # outputs to dist/
npm run preview    # preview the production build locally
```

The app is deployed to GitHub Pages via GitHub Actions on every push to `main`.

## Project Structure

```
frontend/
├── src/
│   ├── App.tsx               # Router and top-level layout
│   ├── main.tsx              # Entry point
│   ├── theme.ts              # Theme (light/dark/system) hook
│   ├── pages/
│   │   ├── Articles.tsx      # Article reader with TTS + word lookup
│   │   ├── Flashcards.tsx    # SM-2 study sessions
│   │   ├── SegmentArticle.tsx# Article creation + AI enrichment polling
│   │   ├── WordDetail.tsx    # HanziWriter stroke order + examples
│   │   ├── SpeechPractice.tsx# Pronunciation practice with LCS diff
│   │   ├── Subtitles.tsx     # Whisper subtitle generation + job polling
│   │   ├── Settings.tsx      # User preferences
│   │   └── Health.tsx        # Backend health monitor
│   └── components/
│       ├── NavBar.tsx
│       ├── ProtectedRoute.tsx
│       ├── AudioUpload.tsx
│       ├── SpeechToText.tsx
│       └── BrowserSTT.tsx
├── public/
├── index.html
├── vite.config.ts
└── tsconfig.json
```

## Theme Support

Three modes — Light, Dark, System — toggled from the nav bar. Preference is stored in `localStorage` and applied on load via a CSS variable swap.
