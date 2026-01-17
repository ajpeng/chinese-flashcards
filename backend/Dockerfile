# builder: install dev deps, build, generate prisma client, prune dev deps
FROM node:20-alpine AS builder
WORKDIR /app

# Install build dependencies for native modules (nodejieba)
RUN apk add --no-cache python3 make g++

# Copy package files first (for caching), then copy Prisma schema so postinstall can find it
COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

# install dev + prod deps (postinstall will run prisma generate and find the schema)
RUN npm ci

# now copy the rest of the source and build
COPY . .
RUN npm run build

# IMPORTANT: Regenerate Prisma client after build to ensure it matches the schema
RUN npx prisma generate

# runner
FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/views ./views
COPY --from=builder /app/src/data ./dist/data
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./
COPY --from=builder /app/rds-ca-bundle.pem ./
EXPOSE 3001
CMD ["node", "dist/bin/www.js"]
