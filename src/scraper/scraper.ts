import { BrowserContext } from "playwright";
import { InputLink, ScrapedArticle } from "../models/types";
import { CONFIG } from "../config";
import { extractArticle } from "./extractor";
import { retryAsync } from "../utils/retry";
import { logger } from "../utils/logger";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function scrapeAll(
  links: InputLink[],
  context: BrowserContext
): Promise<ScrapedArticle[]> {
  const articles: ScrapedArticle[] = [];

  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    const label = link.label || link.url;
    logger.info(`Scraping [${i + 1}/${links.length}]: ${label}`);

    try {
      const page = await context.newPage();

      const article = await retryAsync(
        () => extractArticle(page, link.url),
        CONFIG.MAX_RETRIES,
        CONFIG.RETRY_BASE_DELAY,
        label
      );

      articles.push(article);
      logger.info(`Success: ${article.title || label}`);

      await page.close();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error(`Failed after ${CONFIG.MAX_RETRIES} retries: ${label} — ${errorMsg}`);

      articles.push({
        sourceUrl: link.url,
        freediumUrl: CONFIG.FREEDIUM_BASE_URL + link.url,
        title: "",
        author: "",
        publishedAt: "",
        readingTime: "",
        tags: [],
        contentMarkdown: "",
        scrapedAt: new Date().toISOString(),
        status: "error",
        error: errorMsg,
      });
    }

    // Rate limit between articles
    if (i < links.length - 1) {
      await sleep(CONFIG.RATE_LIMIT_DELAY);
    }
  }

  return articles;
}
