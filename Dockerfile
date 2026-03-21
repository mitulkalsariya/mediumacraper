# Stage 1: Build TypeScript
FROM node:20-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY prisma/ ./prisma/
RUN npx prisma generate

COPY src/ ./src/
RUN npx tsc

# Stage 2: Production
FROM node:20-slim

# Install Chromium dependencies required by Playwright
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libxshmfence1 \
    fonts-noto-color-emoji \
    fonts-liberation \
    openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=build /app/package.json /app/package-lock.json ./
RUN npm ci --omit=dev

# Generate Prisma client for production
COPY --from=build /app/prisma ./prisma
RUN npx prisma generate

# Install Playwright Chromium browser
RUN npx playwright install chromium

COPY --from=build /app/dist ./dist

RUN mkdir -p data/output

ENV NODE_ENV=production

# Run migrations then start scraper
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
