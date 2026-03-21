import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";

config();

const prisma = new PrismaClient();

function extractUrls(content: string): string[] {
  const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);
  const urls: string[] = [];

  for (const line of lines) {
    // Skip header-like lines
    if (line.toLowerCase() === "url" || line.toLowerCase().startsWith("url,")) continue;

    // Handle CSV: extract first field that looks like a URL
    const fields = line.split(",").map((f) => f.trim().replace(/^"|"$/g, ""));
    for (const field of fields) {
      if (field.startsWith("http://") || field.startsWith("https://")) {
        urls.push(field);
        break;
      }
    }
  }

  return urls;
}

async function main(): Promise<void> {
  const csvPath = process.argv[2];

  if (!csvPath) {
    console.error("Usage: npx ts-node src/import.ts <csv-file>");
    process.exit(1);
  }

  const absolutePath = path.resolve(csvPath);
  if (!fs.existsSync(absolutePath)) {
    console.error(`File not found: ${absolutePath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(absolutePath, "utf-8");
  const urls = extractUrls(content);

  if (urls.length === 0) {
    console.error("No URLs found in file");
    process.exit(1);
  }

  console.log(`Found ${urls.length} URLs to import`);

  let imported = 0;
  let skipped = 0;

  for (const url of urls) {
    try {
      await prisma.link.upsert({
        where: { url },
        create: { url },
        update: {},
      });
      imported++;
    } catch (err) {
      console.warn(`Skipped: ${url} — ${err instanceof Error ? err.message : err}`);
      skipped++;
    }
  }

  console.log(`Done — ${imported} imported, ${skipped} skipped`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
