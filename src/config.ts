import * as dotenv from "dotenv";
dotenv.config();

export const CONFIG = {
  // Freedium
  FREEDIUM_BASE_URL: "https://freedium-mirror.cfd/",
  DEFAULT_TIMEOUT: 30_000,
  RATE_LIMIT_DELAY: 2_000,
  MAX_RETRIES: 3,
  RETRY_BASE_DELAY: 1_000,

  // Output
  OUTPUT_DIR: "data/output",

  // Batch
  BATCH_SIZE: parseInt(process.env.BATCH_SIZE || "3", 10),

  // AWS S3
  AWS_S3_BUCKET: process.env.AWS_S3_BUCKET || "",
  AWS_REGION: process.env.AWS_REGION || "us-east-1",
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID || "",
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY || "",
  S3_PREFIX: process.env.S3_PREFIX || "articles/medium/",
};
