# Backend API Server

Express.js REST API server with TypeScript, Prisma ORM, and PostgreSQL database for the Chinese Flashcards application.

## Tech Stack

- **Framework**: Express.js 4.16
- **Language**: TypeScript 5.7
- **Database**: PostgreSQL with Prisma ORM 7.2
- **Authentication**: Cookie-based (basic setup)
- **View Engine**: Jade (for error pages)
- **Testing**: Jest with Supertest

## API Endpoints

### Core Endpoints
- `GET /` - Index page (Jade template)
- `GET /health` - Health check with system metrics
- `GET /test-db` - Database connectivity test

### Articles
- `GET /api/articles` - Fetch all articles with associated words (ordered by newest first)

### Mock Flashcards (Development)
- `POST /api/users/mock/flashcards` - Add word to flashcard collection
  - Body: `{ "wordId": number }`
- `DELETE /api/users/mock/flashcards` - Remove word from flashcard collection
  - Body: `{ "wordId": number }`
- `GET /api/users/mock/flashcards` - List all flashcards for debugging

### Legacy Routes
- `GET /users` - Sample users route (also available at `/api/users`)

## Prerequisites

- Node.js 18+ and npm
- PostgreSQL 14+
- Environment variables configured (see below)

## Environment Variables

Create a `.env` file in the backend directory:

```bash
# Database connection (required)
DATABASE_URL="postgresql://user:password@host:port/database?sslmode=require"

# Optional: Node environment
NODE_ENV=development

# Optional: Server port (defaults to 3000)
PORT=3000
```

## Installation

```bash
cd backend
npm install
```

This automatically runs `prisma generate` via the postinstall hook.

## Database Setup

### Apply Migrations

```bash
npm run prisma:migrate
```

### Seed Database

Seeds initial HSK articles and words using raw SQL:

```bash
npm run prisma:seed
```

The seed script checks for existing data to prevent duplicates.

### Other Prisma Commands

```bash
npm run prisma:dev        # Run migrations in dev mode (creates migration files)
npm run prisma:generate   # Regenerate Prisma client
npm run prisma:push       # Push schema changes without migrations
```

## Running the Server

### Development Mode

```bash
npm run dev
```

Uses `ts-node-dev` for hot-reloading on file changes. Server runs at `http://localhost:3000`.

### Production Mode

```bash
npm run build    # Generates Prisma client and compiles TypeScript
npm run prod     # Starts compiled server from dist/
```

## Project Structure

```
backend/
├── src/
│   ├── app.ts              # Express app configuration
│   ├── bin/www.ts          # Server entry point
│   ├── db.ts               # PostgreSQL pool connection
│   ├── routes/             # API route handlers
│   │   ├── index.ts        # Root route
│   │   ├── health.ts       # Health check endpoint
│   │   ├── articles.ts     # Articles API
│   │   └── users.ts        # Users and mock flashcards
│   ├── mock/               # Mock data stores (for development)
│   ├── prisma/
│   │   └── client.ts       # Prisma client with SSL config
│   └── generated/          # Generated Prisma client (gitignored)
├── prisma/
│   ├── schema.prisma       # Database schema
│   ├── migrations/         # Migration history
│   └── seed.js             # Database seed script (raw SQL)
├── views/                  # Jade templates
├── public/                 # Static assets
└── Dockerfile             # Container configuration

```

## SSL/TLS Database Connection

The Prisma client is configured with SSL support for secure connections to AWS RDS or other SSL-enabled PostgreSQL instances. The RDS CA bundle is included at `backend/rds-ca-bundle.pem`.

## Testing

```bash
npm test
```

Runs Jest test suite. Currently includes tests for:
- User routes and flashcard endpoints

## Health Check Response

```json
{
  "status": "ok",
  "timestamp": "2026-01-12T20:30:00.000Z",
  "uptime": 123.45,
  "env": "development"
}
```

## CORS Configuration

CORS is enabled for all origins in development. For production, restrict to specific origins in `src/app.ts`:

```typescript
app.use(cors({ origin: 'https://yourdomain.com' }));
```

## Notes

- Prisma client is generated to `src/generated/prisma` and automatically regenerated on install
- Database seeding uses raw SQL instead of Prisma ORM to avoid permission issues
- Mock flashcards use in-memory storage (no database persistence yet)
- Health endpoint provides basic readiness checks; extend for production use
