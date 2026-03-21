import { Page } from "playwright";
import { ScrapedArticle } from "../models/types";
import { CONFIG } from "../config";
import { logger } from "../utils/logger";
import { htmlToMarkdownBrowserFn } from "../utils/html-to-markdown";

export async function extractArticle(
  page: Page,
  sourceUrl: string
): Promise<ScrapedArticle> {
  const freediumUrl = CONFIG.FREEDIUM_BASE_URL + sourceUrl;
  const scrapedAt = new Date().toISOString();

  await page.goto(freediumUrl, {
    waitUntil: "domcontentloaded",
    timeout: CONFIG.DEFAULT_TIMEOUT,
  });

  // Wait for main content to render
  await page.waitForSelector("div.main-content", {
    timeout: CONFIG.DEFAULT_TIMEOUT,
  });

  // Extract title
  let title = "";
  try {
    title = (await page.locator("h1").first().textContent()) ?? "";
    title = title.trim();
  } catch (e) {
    logger.warn(`Failed to extract title for ${sourceUrl}`);
  }

  // Extract author
  let author = "";
  try {
    author =
      (await page.locator("a.font-semibold").first().textContent()) ?? "";
    author = author.trim();
  } catch (e) {
    logger.warn(`Failed to extract author for ${sourceUrl}`);
  }

  // Extract date and reading time from metadata bar
  let publishedAt = "";
  let readingTime = "";
  try {
    const metaContainer = page.locator(
      "div.flex.flex-wrap.items-center.space-x-2.text-sm.text-gray-500"
    );
    const metaSpans = await metaContainer
      .locator("span.text-gray-500")
      .allTextContents();
    for (const text of metaSpans) {
      const trimmed = text.trim();
      // Skip theme names and empty/dot separators
      if (!trimmed || trimmed === "·" || trimmed.length < 5) continue;
      // Look for date-like text (contains month names or date patterns)
      if (/\b(January|February|March|April|May|June|July|August|September|October|November|December|\d{4})\b/.test(trimmed)) {
        publishedAt = trimmed;
      } else if (trimmed.includes("min read")) {
        readingTime = trimmed;
      }
    }
  } catch (e) {
    logger.warn(`Failed to extract metadata for ${sourceUrl}`);
  }

  // Extract content as clean Markdown
  let contentMarkdown = "";
  try {
    const converterFn = htmlToMarkdownBrowserFn();
    contentMarkdown = await page.evaluate(converterFn, "div.main-content");
  } catch (e) {
    logger.warn(`Failed to extract content for ${sourceUrl}`);
  }

  // Extract tags
  let tags: string[] = [];
  try {
    const rawTags = await page
      .locator("div.flex.flex-wrap.gap-2.mt-5 span")
      .allTextContents();
    tags = rawTags.map((t) => t.replace(/^#/, "").trim()).filter(Boolean);
  } catch (e) {
    logger.warn(`Failed to extract tags for ${sourceUrl}`);
  }

  if (!title && !contentMarkdown) {
    throw new Error(`Failed to extract title and content for ${sourceUrl}`);
  }

  return {
    sourceUrl,
    freediumUrl,
    title,
    author,
    publishedAt,
    readingTime,
    tags,
    contentMarkdown,
    scrapedAt,
    status: "success",
  };
}
