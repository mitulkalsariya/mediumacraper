import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { CONFIG } from "../config";
import { logger } from "../utils/logger";

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (s3Client) return s3Client;

  s3Client = new S3Client({
    region: CONFIG.AWS_REGION,
    credentials: {
      accessKeyId: CONFIG.AWS_ACCESS_KEY_ID,
      secretAccessKey: CONFIG.AWS_SECRET_ACCESS_KEY,
    },
  });

  return s3Client;
}

export async function uploadMarkdownToS3(
  slug: string,
  content: string
): Promise<string> {
  const client = getS3Client();
  const key = `${CONFIG.S3_PREFIX}${slug}.md`;

  await client.send(
    new PutObjectCommand({
      Bucket: CONFIG.AWS_S3_BUCKET,
      Key: key,
      Body: content,
      ContentType: "text/markdown",
    })
  );

  logger.info(`Uploaded to S3: s3://${CONFIG.AWS_S3_BUCKET}/${key}`);
  return key;
}
