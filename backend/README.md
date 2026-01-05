# Backend health endpoint

This backend exposes a simple health endpoint at:

- GET /health — returns JSON with status, timestamp, uptime, and env

Example response:

```
{
  "status": "ok",
  "timestamp": "2026-01-02T00:00:00.000Z",
  "uptime": 123.45,
  "env": "development"
}
```

How to run locally:

1. From the repository root, start the backend server (ensure dependencies are installed):

```bash
cd backend
npm install
PORT=3000 npm start
```

2. Test the health endpoint:

```bash
curl -i http://localhost:3000/health
```

Or run the quick one-off check from the repo root (starts app on an ephemeral port, queries /health, prints result):

```bash
node -e "const app=require('./backend/app'); const s=app.listen(0,()=>{ const port=s.address().port; const http=require('http'); http.get('http://127.0.0.1:'+port+'/health',res=>{let b=''; res.on('data',c=>b+=c); res.on('end',()=>{console.log('STATUS:'+res.statusCode); console.log('BODY:'+b); s.close();})}).on('error',e=>{console.error('ERR',e); s.close()}); })"
```

Notes:
- This is a simple readiness endpoint and does not perform deep dependency checks (database, caches). If you need liveness/readiness probes for Kubernetes, consider adding checks for dependent services.
- The `/test-db` endpoint uses the shared Postgres pool from `db.js`, which expects these environment variables:
  - `DB_USER` — database user (matches `POSTGRES_USER` in `docker-compose.yml` if you use the provided Postgres container).
  - `DB_PASSWORD` — database password (matches `POSTGRES_PASSWORD`).
  - `DB_NAME` — database name (matches `POSTGRES_DB`).
  For example, when using the default `docker-compose.yml` values:
  ```bash
  export DB_USER=myuser
  export DB_PASSWORD=mypassword
  export DB_NAME=mydatabase
  ```
