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

# Install ffmpeg (for audio conversion) and yt-dlp (standalone binary, no Python needed)
RUN apk add --no-cache ffmpeg curl python3 && \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
         -o /usr/local/bin/yt-dlp && \
    chmod +x /usr/local/bin/yt-dlp
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/views ./views
# Only copy runtime-required data files — not cedict.txt (9.4MB raw source),
# example-sentences.tsv (9.8MB, already in DB), hsk CSVs, or sample files.
RUN mkdir -p ./dist/data
COPY --from=builder /app/src/data/cedict.json ./dist/data/
COPY --from=builder /app/src/data/hsk-words.json ./dist/data/
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./
COPY --from=builder /app/package*.json ./
EXPOSE 3001
CMD ["node", "dist/bin/www.js"]
