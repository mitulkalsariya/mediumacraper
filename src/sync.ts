import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { slugFromUrl } from "./io/writer";

config();

const prisma = new PrismaClient();

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

const BUCKET = process.env.AWS_S3_BUCKET || "";
const PREFIX = process.env.S3_PREFIX || "articles/medium/";

async function existsInS3(slug: string): Promise<boolean> {
  try {
    await s3Client.send(
      new HeadObjectCommand({
        Bucket: BUCKET,
        Key: `${PREFIX}${slug}.md`,
      })
    );
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  console.log("Syncing DB with S3...");
  console.log(`Bucket: ${BUCKET}, Prefix: ${PREFIX}`);

  const pendingLinks = await prisma.link.findMany({
    where: {
      OR: [{ mdStatus: "pending" }, { uploadStatus: "pending" }],
    },
  });

  console.log(`Found ${pendingLinks.length} links to check`);

  let synced = 0;
  let notFound = 0;

  for (const link of pendingLinks) {
    const slug = slugFromUrl(link.url);
    const exists = await existsInS3(slug);

    if (exists) {
      await prisma.link.update({
        where: { id: link.id },
        data: { mdStatus: "done", uploadStatus: "done" },
      });
      synced++;
      if (synced % 50 === 0) console.log(`  Synced ${synced}...`);
    } else {
      notFound++;
    }
  }

  console.log(`Done — ${synced} marked as done, ${notFound} not found in S3`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
