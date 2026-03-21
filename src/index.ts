import { CONFIG } from "./config";
import { readInputLinks } from "./io/reader";
import { writeArticlesAsMarkdown, slugFromUrl, articleToMarkdownFile } from "./io/writer";
import { updateLinkStatus, disconnectDb } from "./io/db";
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
    await disconnectDb();
    return;
  }

  const context = await launchBrowser();

  try {
    const articles = await scrapeAll(links, context);
    writeArticlesAsMarkdown(outputDir, articles);

    // Update database + upload to S3 for each article
    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];
      const linkId = links[i].id;
      if (!linkId) continue;

      try {
        if (article.status === "success") {
          await updateLinkStatus(linkId, { mdStatus: "done" });
          logger.info(`DB updated: link ${linkId} → md status: done`);

          // Upload to S3
          if (CONFIG.AWS_S3_BUCKET) {
            try {
              const slug = slugFromUrl(article.sourceUrl);
              const mdContent = articleToMarkdownFile(article);
              await uploadMarkdownToS3(slug, mdContent);
              await updateLinkStatus(linkId, { uploadStatus: "done" });
              logger.info(`DB updated: link ${linkId} → upload status: done`);
            } catch (s3Err) {
              const s3Msg = s3Err instanceof Error ? s3Err.message : String(s3Err);
              logger.error(`S3 upload failed for link ${linkId}: ${s3Msg}`);
              await updateLinkStatus(linkId, {
                uploadStatus: "error",
                error: `S3 upload failed: ${s3Msg}`,
              });
            }
          }
        } else {
          await updateLinkStatus(linkId, {
            mdStatus: "error",
            error: article.error || "Unknown error",
          });
          logger.info(`DB updated: link ${linkId} → error`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`Failed to update DB for link ${linkId}: ${msg}`);
      }
    }

    const successful = articles.filter((a) => a.status === "success").length;
    const failed = articles.length - successful;
    logger.info(
      `Done — ${successful} succeeded, ${failed} failed out of ${articles.length} total`
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
