# Chinese Flashcards

HSK-graded Chinese reading application for language immersion. A full-stack web application featuring instant word segmentation, hover-lookup definitions, and flashcard management for HSK-level articles.

## Features

- Browse HSK-graded Chinese articles (HSK 1-3)
- Instant word definitions on hover
- Add/remove words to personal flashcard collection
- Responsive web interface built with React
- RESTful API backend with PostgreSQL database

## Tech Stack

### Frontend
- React 19 with TypeScript
- Vite build tooling
- SWC for fast compilation
- ESLint for code quality

### Backend
- Express.js with TypeScript
- PostgreSQL database with Prisma ORM
- SSL/TLS encrypted database connections
- Raw SQL seeding for initial data
- Health check and monitoring endpoints

### Infrastructure
- Nginx reverse proxy with automatic SSL (Certbot)
- Docker and Docker Compose for containerization
- GitHub Actions CI/CD pipeline
- AWS RDS for production database

## Project Structure

```
.
├── frontend/          # React frontend application
├── backend/           # Express API server
├── nginx/             # Nginx configuration files
└── .github/           # CI/CD workflows
```

## Getting Started

### Prerequisites
- Node.js 18+ and npm
- PostgreSQL 14+
- Docker and Docker Compose (optional)

### Backend Setup

```bash
cd backend
npm install
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

The backend will be available at `http://localhost:3000`

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend will be available at `http://localhost:5173`

## API Endpoints

- `GET /health` - Health check endpoint
- `GET /test-db` - Database connectivity test
- `GET /api/articles` - Fetch all articles with words
- `POST /api/users/mock/flashcards` - Add word to flashcards
- `DELETE /api/users/mock/flashcards` - Remove word from flashcards
- `GET /api/users/mock/flashcards` - List all flashcards

## Deployment

The application is deployed with:
- Automated SSL certificate provisioning via Certbot
- Database migrations run automatically via GitHub Actions
- Containerized backend deployment
- Static frontend hosting

See individual README files in `/frontend` and `/backend` for detailed setup and deployment instructions.
