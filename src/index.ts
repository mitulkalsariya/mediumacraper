import { CONFIG } from "./config";
import { readInputLinks } from "./io/reader";
import { writeArticlesAsMarkdown, slugFromUrl, articleToMarkdownFile } from "./io/writer";
import { updateMdStatus, updateUploadStatus, updateErrorMessage } from "./io/sheets";
import { uploadMarkdownToS3 } from "./io/s3";
import { launchBrowser, closeBrowser } from "./scraper/browser";
import { scrapeAll } from "./scraper/scraper";
import { logger } from "./utils/logger";

async function main(): Promise<void> {
  const outputDir = process.argv[2] || CONFIG.OUTPUT_DIR;

  logger.info("Link Scrapper — starting");
  logger.info(`Output: ${outputDir}`);
  logger.info(`Batch size: ${CONFIG.BATCH_SIZE}`);

  const links = await readInputLinks();

  if (links.length === 0) {
    logger.warn("No pending links to scrape. Exiting.");
    return;
  }

  const context = await launchBrowser();

  try {
    const articles = await scrapeAll(links, context);
    writeArticlesAsMarkdown(outputDir, articles);

    // Update Google Sheet + upload to S3 for each article
    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];
      const rowNumber = links[i].rowNumber;
      if (!rowNumber) continue;

      try {
        if (article.status === "success") {
          // Update md status
          await updateMdStatus(rowNumber, "done");
          logger.info(`Sheet updated: row ${rowNumber} → md status: done`);

          // Upload to S3
          if (CONFIG.AWS_S3_BUCKET) {
            try {
              const slug = slugFromUrl(article.sourceUrl);
              const mdContent = articleToMarkdownFile(article);
              await uploadMarkdownToS3(slug, mdContent);
              await updateUploadStatus(rowNumber, "done");
              logger.info(`Sheet updated: row ${rowNumber} → upload status: done`);
            } catch (s3Err) {
              const s3Msg = s3Err instanceof Error ? s3Err.message : String(s3Err);
              logger.error(`S3 upload failed for row ${rowNumber}: ${s3Msg}`);
              await updateUploadStatus(rowNumber, "error");
              await updateErrorMessage(rowNumber, `S3 upload failed: ${s3Msg}`);
            }
          }
        } else {
          await updateMdStatus(rowNumber, "error");
          await updateErrorMessage(rowNumber, article.error || "Unknown error");
          logger.info(`Sheet updated: row ${rowNumber} → error`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`Failed to update sheet row ${rowNumber}: ${msg}`);
      }
    }

    const successful = articles.filter((a) => a.status === "success").length;
    const failed = articles.length - successful;
    logger.info(
      `Done — ${successful} succeeded, ${failed} failed out of ${articles.length} total`
    );
  } finally {
    await closeBrowser();
  }
}

main().catch((err) => {
  logger.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
