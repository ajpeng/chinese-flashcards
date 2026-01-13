# Frontend - Chinese Flashcards

React-based web interface for browsing HSK-graded Chinese articles and managing flashcard collections.

## Tech Stack

- **Framework**: React 19.2
- **Language**: TypeScript 5.9
- **Build Tool**: Vite 7.2
- **Compiler**: SWC for fast refresh
- **Linting**: ESLint with TypeScript support
- **Styling**: CSS with theme support (light/dark/system)

## Features

- Browse HSK-graded Chinese reading articles
- View individual words with hover definitions
- Add/remove words to personal flashcard collection
- Theme switcher (light/dark/system)
- Health monitoring page for backend API status
- Responsive navigation interface

## Prerequisites

- Node.js 18+ and npm
- Backend API server running (default: `http://localhost:3000`)

## Installation

```bash
cd frontend
npm install
```

## Development

Start the development server with hot module replacement:

```bash
npm run dev
```

The application will be available at `http://localhost:5173`

## Building for Production

```bash
npm run build
```

Compiles TypeScript and builds optimized production assets to `dist/`.

### Preview Production Build

```bash
npm run preview
```

## Project Structure

```
frontend/
├── src/
│   ├── App.tsx             # Main application component
│   ├── App.css             # Application styles
│   ├── main.tsx            # Entry point
│   ├── theme.ts            # Theme management hook
│   ├── pages/              # Page components
│   │   ├── Articles.tsx    # HSK articles browser
│   │   └── Health.tsx      # API health monitoring
│   └── assets/             # Static assets (logos, images)
├── public/                 # Public static files
├── index.html              # HTML template
├── vite.config.ts          # Vite configuration
├── tsconfig.json           # TypeScript configuration
└── eslint.config.js        # ESLint configuration
```

## Pages

### Home
- Demo counter and navigation
- Theme switcher
- Links to other pages

### Articles
- Displays all HSK articles from the backend API
- Shows article title, HSK level, and content
- Lists associated vocabulary words with translations
- Flashcard add/remove functionality (mock implementation)

### Health
- Backend API connectivity check
- Displays server status, uptime, and environment

## Theme Support

The application includes a theme system supporting:
- Light mode
- Dark mode
- System preference (follows OS settings)

Theme preference is persisted to localStorage and automatically applied on page load.

## API Integration

The frontend expects the backend API at `http://localhost:3000` by default. Update API calls in the components to point to your production backend URL.

### API Endpoints Used
- `GET /health` - Health check
- `GET /api/articles` - Fetch articles with words
- `POST /api/users/mock/flashcards` - Add word to flashcards
- `DELETE /api/users/mock/flashcards` - Remove word from flashcards

## Code Quality

### Linting

```bash
npm run lint
```

Runs ESLint with TypeScript support, React Hooks rules, and React Refresh plugin.

### Type Checking

TypeScript is configured with strict mode enabled for better type safety.

## Notes

- Uses SWC for fast refresh (not Babel)
- React Compiler is not compatible with SWC (as of Jan 2026)
- Flashcard functionality uses mock API endpoints (no persistence yet)
- CORS must be enabled on the backend for local development
