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

  // Google Sheets
  GOOGLE_SHEET_ID: process.env.GOOGLE_SHEET_ID || "",
  GOOGLE_CREDENTIALS_PATH: process.env.GOOGLE_CREDENTIALS_PATH || "./credentials.json",
  BATCH_SIZE: parseInt(process.env.BATCH_SIZE || "3", 10),

  // AWS S3
  AWS_S3_BUCKET: process.env.AWS_S3_BUCKET || "",
  AWS_REGION: process.env.AWS_REGION || "us-east-1",
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID || "",
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY || "",
  S3_PREFIX: process.env.S3_PREFIX || "articles/",

  // Sheet column indices (0-based)
  COL_URL: 4,              // E: z href 2
  COL_MD_STATUS: 12,       // M: md status
  COL_UPLOAD_STATUS: 13,   // N: upload status
  COL_ERROR: 14,           // O: error massage
};
