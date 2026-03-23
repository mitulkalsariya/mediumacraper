# Link Scrapper

Automated Medium article scraper that extracts content via Freedium, converts to clean Markdown (optimized for LLM training), and uploads to AWS S3. Uses SQLite (via Prisma) for tracking progress.

## Architecture

```
+------------------+        +---------------------+        +------------------+
|  SQLite DB       |        |   Link Scrapper     |        |    AWS S3        |
|  (links.db)      |        |                     |        |                  |
|                  |  query |  1. Read pending    | upload |  articles/       |
|  url             +------->+  2. Launch Chromium  +------->+  {slug}.md       |
|  md_status       |<------+  3. Scrape via       |        +------------------+
|  upload_status   | update |     Freedium         |
|  error           |        |  4. HTML -> Markdown |        +------------------+
+------------------+        |  5. Write .md local  +------->+  data/output/    |
                            |  6. Upload to S3     |  write |  {slug}.md       |
       +--------+           |  7. Update DB        |        +------------------+
       |  CSV   | import    +---------------------+
       |  file  +------->          |
       +--------+         +--------+--------+
                          |                 |
                  +-------v------+  +-------v--------+
                  |  Playwright  |  |  Freedium      |
                  |  (Chromium)  |  |  Mirror        |
                  +--------------+  +----------------+
```

### Component Diagram

```
src/
 |
 +-- index.ts                    Entry point & orchestrator
 +-- import.ts                   CSV import CLI
 +-- config.ts                   Env vars + constants
 |
 +-- models/
 |    +-- types.ts               InputLink, ScrapedArticle
 |
 +-- io/
 |    +-- db.ts                  Prisma/SQLite queries
 |    +-- s3.ts                  AWS S3 upload
 |    +-- writer.ts              Local .md file output
 |    +-- reader.ts              Input orchestration
 |
 +-- scraper/
 |    +-- browser.ts             Playwright Chromium lifecycle
 |    +-- scraper.ts             Batch scraping with retry + rate limit
 |    +-- extractor.ts           DOM extraction (title, author, tags, content)
 |
 +-- utils/
      +-- html-to-markdown.ts    HTML -> clean Markdown (runs in browser)
      +-- retry.ts               Exponential backoff
      +-- logger.ts              Timestamped logging

prisma/
 +-- schema.prisma               Database schema (Link model)
 +-- migrations/                 Auto-generated migrations

data/
 +-- links.db                    SQLite database
 +-- output/                     Generated .md files
```

### Data Flow

```
CSV file (bulk import)
        |
        v
  SQLite DB (pending URLs)
        |
        v
  Freedium Mirror URL
        |
        v
  Playwright (headless Chromium)
        |
        v
  Extract metadata + HTML
        |
        v
  Convert HTML -> Markdown (in-browser)
        |
        +---> Write data/output/{slug}.md
        +---> Upload to S3: articles/{slug}.md
        +---> Update DB: md_status = "done", upload_status = "done"
```

---

## Prerequisites

- **Node.js** >= 18
- **Docker** (for production)
- **AWS** account with S3 access (optional)

---

## Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd link-scrapper
npm install
npx playwright install chromium
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```
# Database
DATABASE_URL=file:./data/links.db

# Batch size (articles per run)
BATCH_SIZE=3

# AWS S3 (optional — skip if not uploading)
AWS_S3_BUCKET=your-bucket
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
S3_PREFIX=articles/
```

### 3. Initialize database

```bash
npx prisma migrate dev --name init
```

### 4. Import links

Export your Google Sheet as CSV (File -> Download -> CSV), then:

```bash
npm run import -- links.csv
```

The CSV just needs URLs — one per line or in any column. The importer auto-detects URLs:

```csv
url
https://medium.com/@author/article-1
https://medium.com/@author/article-2
```

### 5. AWS Setup (optional)

Only needed if uploading to S3:

1. IAM -> Create User (`link-scrapper`) -> Attach `AmazonS3FullAccess`
2. Security credentials -> Create access key -> save Key ID + Secret
3. Create an S3 bucket (or use existing)
4. Add credentials to `.env`

---

## Running

### Local development

```bash
# Scrape one batch
npm start

# Run again to process next batch
npm start
```

### View database (GUI)

```bash
npm run db:studio
```

Opens Prisma Studio in browser — view/edit all links and their status.

### Local production (compiled)

```bash
npm run build
npm run start:prod
```

---

## Production Deployment

### Option A: Docker (single container, recommended)

```bash
# Build
docker build -t link-scrapper .

# Import links (one-time)
docker run --rm \
  -v ./data:/app/data \
  -v ./links.csv:/app/links.csv \
  link-scrapper node dist/import.js links.csv

# Run scraper
docker run --rm \
  --env-file .env \
  -v ./data:/app/data \
  link-scrapper
```

The `data/` volume persists the SQLite database and output `.md` files between runs.

**Schedule with cron** (e.g., every 30 minutes):

```
*/30 * * * * docker run --rm --env-file /path/to/.env -v /path/to/data:/app/data link-scrapper >> /var/log/scraper.log 2>&1
```

### Option B: Docker Compose

```bash
# Build
docker compose build

# Run once
docker compose run --rm scraper

# Schedule with cron
*/30 * * * * cd /path/to/link-scrapper && docker compose run --rm scraper >> /var/log/scraper.log 2>&1
```

### Option C: AWS ECS / Fargate

1. **Push image to ECR:**

```bash
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

aws ecr create-repository --repository-name link-scrapper

docker build -t link-scrapper .
docker tag link-scrapper:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/link-scrapper:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/link-scrapper:latest
```

2. **Create ECS Task Definition:**
   - Launch type: Fargate
   - Image: `<account-id>.dkr.ecr.us-east-1.amazonaws.com/link-scrapper:latest`
   - CPU: 1 vCPU, Memory: 2 GB (Chromium needs this)
   - Environment variables: add all from `.env`
   - Mount EFS volume for `data/` to persist SQLite DB

3. **Schedule with EventBridge:**
   - Create rule: Rate(30 minutes) or Cron expression
   - Target: ECS task

---

## Managing Links

### Import from CSV

```bash
npm run import -- links.csv
```

Duplicates are automatically skipped (upsert on URL).

### View status

```bash
npm run db:studio
```

### Remove processed links

After scraping and uploading, you can delete completed entries:

```bash
npx prisma db execute --file - <<< "DELETE FROM Link WHERE mdStatus = 'done' AND uploadStatus = 'done';"
```

### Reset failed links for retry

```bash
npx prisma db execute --file - <<< "UPDATE Link SET mdStatus = 'pending', uploadStatus = 'pending', error = NULL WHERE mdStatus = 'error';"
```

---

## Configuration Reference

| Env Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `file:./data/links.db` | SQLite database path |
| `BATCH_SIZE` | `3` | Articles to process per run |
| `AWS_S3_BUCKET` | (optional) | S3 bucket. If empty, S3 upload is skipped |
| `AWS_REGION` | `us-east-1` | AWS region |
| `AWS_ACCESS_KEY_ID` | (required if S3) | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | (required if S3) | AWS secret key |
| `S3_PREFIX` | `articles/` | S3 key prefix |

### Hardcoded settings (in `src/config.ts`)

| Setting | Value | Description |
|---|---|---|
| `FREEDIUM_BASE_URL` | `https://freedium-mirror.cfd/` | Freedium mirror |
| `DEFAULT_TIMEOUT` | 30s | Page load timeout |
| `RATE_LIMIT_DELAY` | 2s | Delay between articles |
| `MAX_RETRIES` | 3 | Retry attempts per article |
| `RETRY_BASE_DELAY` | 1s | Initial retry delay (exponential) |

---

## Output Format

Each article is saved as a Markdown file with YAML frontmatter:

```markdown
---
title: "Article Title"
author: "Author Name"
published: "March 20, 2026"
source: https://medium.com/@author/article-slug
tags: ["tag1", "tag2"]
scraped: 2026-03-20T12:00:00.000Z
---

# Article Title

Clean article content in Markdown...

### Heading

Text with [links](url), `inline code`, and fenced code blocks with language detection.
```

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Scrape fails | Retries 3x with exponential backoff (1s, 2s, 4s) |
| Article extraction partial | Continues if title or content extracted |
| Title + content both missing | Marked as error in DB |
| S3 upload fails | md_status = "done", upload_status = "error", error logged |
| DB update fails | Logged, continues to next article |
| All retries exhausted | Link marked as error with message |

---

## License

ISC

# Sync existing S3 files with DB
docker run --rm --env-file .env -v ./data:/app/data mediumscraper node dist/sync.js

# Then run scraper
docker run --rm --env-file .env -v ./data:/app/data mediumscraper

To upload csv to server
scp -i medium-scrape.pem medium-link-data.csv ubuntu@13.201.187.27:/home/ubuntu/

Import runs on the host (not Docker), so with the .env fix it should work directly:

cd /home/ubuntu/mediumacraper
npx ts-node src/import.ts links.csv
or
cd /home/ubuntu/mediumacraper
npm run import -- links.csv

# 5. Check results
sqlite3 data/links.db "SELECT mdStatus, uploadStatus, COUNT(*) FROM Link GROUP BY mdStatus, uploadStatus;"