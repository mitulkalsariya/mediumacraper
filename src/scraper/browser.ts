import { chromium, Browser, BrowserContext } from "playwright";
import { logger } from "../utils/logger";

let browser: Browser | null = null;
let context: BrowserContext | null = null;

export async function launchBrowser(): Promise<BrowserContext> {
  logger.info("Launching headless Chromium...");

  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
  });

  logger.info("Browser launched successfully");
  return context;
}

export async function closeBrowser(): Promise<void> {
  if (context) {
    await context.close();
    context = null;
  }
  if (browser) {
    await browser.close();
    browser = null;
  }
  logger.info("Browser closed");
}
