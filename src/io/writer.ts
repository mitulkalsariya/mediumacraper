import * as fs from "fs";
import * as path from "path";
import { ScrapedArticle } from "../models/types";
import { logger } from "../utils/logger";

export function slugFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const segments = pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1] || "article";
    return last.replace(/[^a-z0-9-]/gi, "-").substring(0, 80);
  } catch {
    return "article";
  }
}

export function articleToMarkdownFile(article: ScrapedArticle): string {
  const lines: string[] = [
    "---",
    `title: "${article.title.replace(/"/g, '\\"')}"`,
    `author: "${article.author}"`,
    `published: "${article.publishedAt}"`,
    `source: ${article.sourceUrl}`,
    `tags: [${article.tags.map((t) => `"${t}"`).join(", ")}]`,
    `scraped: ${article.scrapedAt}`,
    "---",
    "",
    `# ${article.title}`,
    "",
    article.contentMarkdown,
  ];
  return lines.join("\n");
}

export function writeArticlesAsMarkdown(
  outputDir: string,
  articles: ScrapedArticle[]
): void {
  const dir = path.resolve(outputDir);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let written = 0;
  for (const article of articles) {
    if (article.status !== "success") continue;
    const slug = slugFromUrl(article.sourceUrl);
    const mdPath = path.join(dir, `${slug}.md`);
    fs.writeFileSync(mdPath, articleToMarkdownFile(article), "utf-8");
    logger.info(`Written: ${mdPath}`);
    written++;
  }

  logger.info(`${written} Markdown files written to ${dir}`);
}
