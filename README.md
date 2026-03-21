# Link Scrapper

Automated Medium article scraper that extracts content via Freedium, converts to clean Markdown (optimized for LLM training), uploads to AWS S3, and tracks progress in Google Sheets.

## Architecture

```
+------------------+        +---------------------+        +------------------+
|  Google Sheet    |        |   Link Scrapper     |        |    AWS S3        |
|                  |  read  |                     | upload |                  |
|  z href 2 (URL) +------->+  1. Read pending    +------->+  articles/       |
|  md status       |<------+  2. Launch Chromium  |        |  {slug}.md       |
|  upload status   | update |  3. Scrape via      |        +------------------+
|  error massage   |        |     Freedium        |
+------------------+        |  4. HTML -> Markdown |        +------------------+
                            |  5. Write .md local  +------->+  data/output/    |
                            |  6. Upload to S3     |  write |  {slug}.md       |
                            |  7. Update sheet     |        +------------------+
                            +---------------------+
                                     |
                            +--------+--------+
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
 |
 +-- config.ts                   Env vars + constants
 |
 +-- models/
 |    +-- types.ts               InputLink, ScrapedArticle
 |
 +-- io/
 |    +-- sheets.ts              Google Sheets read/write
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
```

### Data Flow

```
Google Sheet (pending URLs)
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
        +---> Update Sheet: md status = "done", upload status = "done"
```

---

## Prerequisites

- **Node.js** >= 18
- **Docker** (for production)
- **Google Cloud** service account with Sheets API
- **AWS** account with S3 access

---

## Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd link-scrapper
npm install
npx playwright install chromium
```

### 2. Google Cloud Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project (e.g., `link-scrapper`)
3. Enable **Google Sheets API**: APIs & Services -> Library -> search "Google Sheets API" -> Enable
4. Create **Service Account**: APIs & Services -> Credentials -> Create Credentials -> Service Account
   - Name: `link-scrapper`, click Done
5. Download key: click service account -> Keys -> Add Key -> JSON -> Download
6. Save as `credentials.json` in the project root
7. **Share your Google Sheet** with the service account email (from `client_email` in the JSON) as **Editor**

### 3. AWS Setup

1. IAM -> Create User (`link-scrapper`) -> Attach `AmazonS3FullAccess`
2. Security credentials -> Create access key -> save Key ID + Secret
3. Create an S3 bucket (or use existing)

### 4. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```
# Google Sheets
GOOGLE_SHEET_ID=<sheet-id-from-url>
GOOGLE_CREDENTIALS_PATH=./credentials.json
BATCH_SIZE=3

# AWS S3
AWS_S3_BUCKET=your-bucket
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
S3_PREFIX=articles/
```

The Sheet ID is from the URL: `https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit`

### 5. Google Sheet format

The sheet must have these columns (in order):

| Col | Header | Purpose |
|-----|--------|---------|
| A | ba href | - |
| B | e src | - |
| C | z href | - |
| D | bb | - |
| **E** | **z href 2** | **Article URL to scrape** |
| F | bb 2 | - |
| G | bb 3 | - |
| H | e | - |
| I | bs src | - |
| J | bs src 2 | - |
| K | v | - |
| L | v 2 | - |
| **M** | **md status** | **Updated to "done" or "error"** |
| **N** | **upload status** | **Updated to "done" or "error"** |
| **O** | **error massage** | **Error details if failed** |

---

## Running

### Local development

```bash
npm start
```

### Local production (compiled)

```bash
npm run build
npm run start:prod
```

---

## Production Deployment

### Option A: Docker Compose (recommended for single server)

```bash
# Build the image
docker compose build

# Run once (scrapes one batch, exits)
docker compose run --rm scraper

# Check output
ls data/output/
```

**Schedule with cron** (e.g., every 30 minutes):

```bash
crontab -e
```

Add:

```
*/30 * * * * cd /path/to/link-scrapper && docker compose run --rm scraper >> /var/log/scraper.log 2>&1
```

### Option B: AWS ECS / Fargate (serverless scheduled task)

1. **Push image to ECR:**

```bash
# Authenticate
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

# Create repository (one-time)
aws ecr create-repository --repository-name link-scrapper

# Build, tag, push
docker build -t link-scrapper .
docker tag link-scrapper:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/link-scrapper:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/link-scrapper:latest
```

2. **Create ECS Task Definition:**
   - Launch type: Fargate
   - Image: `<account-id>.dkr.ecr.us-east-1.amazonaws.com/link-scrapper:latest`
   - CPU: 1 vCPU, Memory: 2 GB (Chromium needs this)
   - Environment variables: add all from `.env`
   - For `GOOGLE_CREDENTIALS_PATH`: store credentials JSON in AWS Secrets Manager and mount as a file

3. **Schedule with EventBridge:**
   - Create rule: Schedule -> Rate(30 minutes) or Cron
   - Target: ECS task (the task definition above)
   - This runs the scraper automatically on schedule

### Option C: AWS Lambda (not recommended)

Lambda has a 15-min timeout and limited tmp storage. Chromium in Lambda requires special layers. Use ECS/Fargate instead.

---

## Configuration Reference

| Env Variable | Default | Description |
|---|---|---|
| `GOOGLE_SHEET_ID` | (required) | Google Sheet ID |
| `GOOGLE_CREDENTIALS_PATH` | `./credentials.json` | Path to service account JSON |
| `BATCH_SIZE` | `3` | Articles to process per run |
| `AWS_S3_BUCKET` | (optional) | S3 bucket name. If empty, S3 upload is skipped |
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

Text with [links](url), `inline code`, and:

- bullet
- lists

Code blocks with language detection:

```javascript
const x = 1;
```​
```

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Scrape fails | Retries 3x with exponential backoff (1s, 2s, 4s) |
| Article extraction partial | Continues if title or content extracted |
| Title + content both missing | Marked as error |
| S3 upload fails | md status = "done", upload status = "error", error logged |
| Sheet update fails | Logged, continues to next article |
| All retries exhausted | Article marked as error in sheet with message |

---

## License

ISC
