import { CONFIG } from "./config";
import { readInputLinks } from "./io/reader";
import { writeArticleAsMarkdown, slugFromUrl, articleToMarkdownFile } from "./io/writer";
import { updateLinkStatus, disconnectDb } from "./io/db";
import { uploadMarkdownToS3 } from "./io/s3";
import { launchBrowser, closeBrowser } from "./scraper/browser";
import { extractArticle } from "./scraper/extractor";
import { retryAsync } from "./utils/retry";
import { logger } from "./utils/logger";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  const outputDir = process.argv[2] || CONFIG.OUTPUT_DIR;

  logger.info("Link Scrapper — starting");
  logger.info(`Output: ${outputDir}`);
  logger.info(`Batch size: ${CONFIG.BATCH_SIZE}`);

  const links = await readInputLinks();

  if (links.length === 0) {
    logger.warn("No pending links to scrape. Exiting.");
    await disconnectDb();
    return;
  }

  const context = await launchBrowser();
  let successful = 0;
  let failed = 0;

  try {
    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      const linkId = link.id;
      const label = link.label || link.url;

      logger.info(`[${i + 1}/${links.length}] Scraping: ${label}`);

      try {
        // 1. Scrape
        const page = await context.newPage();
        const article = await retryAsync(
          () => extractArticle(page, link.url),
          CONFIG.MAX_RETRIES,
          CONFIG.RETRY_BASE_DELAY,
          label
        );
        await page.close();

        logger.info(`[${i + 1}/${links.length}] Scraped: ${article.title || label}`);

        // 2. Write .md locally
        const mdPath = writeArticleAsMarkdown(outputDir, article);
        logger.info(`[${i + 1}/${links.length}] Written: ${mdPath}`);

        // 3. Update DB: md status done
        if (linkId) {
          await updateLinkStatus(linkId, { mdStatus: "done" });
          logger.info(`[${i + 1}/${links.length}] DB: mdStatus → done`);
        }

        // 4. Upload to S3
        if (CONFIG.AWS_S3_BUCKET && linkId) {
          try {
            const slug = slugFromUrl(article.sourceUrl);
            const mdContent = articleToMarkdownFile(article);
            await uploadMarkdownToS3(slug, mdContent);
            await updateLinkStatus(linkId, { uploadStatus: "done" });
            logger.info(`[${i + 1}/${links.length}] DB: uploadStatus → done`);
          } catch (s3Err) {
            const s3Msg = s3Err instanceof Error ? s3Err.message : String(s3Err);
            logger.error(`[${i + 1}/${links.length}] S3 failed: ${s3Msg}`);
            await updateLinkStatus(linkId, {
              uploadStatus: "error",
              error: `S3 upload failed: ${s3Msg}`,
            });
          }
        }

        successful++;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error(`[${i + 1}/${links.length}] Failed: ${label} — ${errorMsg}`);

        // Update DB immediately on scrape failure
        if (linkId) {
          try {
            await updateLinkStatus(linkId, {
              mdStatus: "error",
              error: errorMsg,
            });
            logger.info(`[${i + 1}/${links.length}] DB: mdStatus → error`);
          } catch (dbErr) {
            logger.error(`DB update failed for link ${linkId}`);
          }
        }

        failed++;
      }

      // Rate limit between articles
      if (i < links.length - 1) {
        await sleep(CONFIG.RATE_LIMIT_DELAY);
      }
    }

    logger.info(
      `Done — ${successful} succeeded, ${failed} failed out of ${links.length} total`
    );
  } finally {
    await closeBrowser();
    await disconnectDb();
  }
}

main().catch((err) => {
  logger.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
