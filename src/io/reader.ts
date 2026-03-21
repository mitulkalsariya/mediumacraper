import { InputLink } from "../models/types";
import { getPendingLinks } from "./sheets";
import { CONFIG } from "../config";
import { logger } from "../utils/logger";

export async function readInputLinks(): Promise<InputLink[]> {
  if (!CONFIG.GOOGLE_SHEET_ID) {
    throw new Error(
      "GOOGLE_SHEET_ID is not set. Create a .env file (see .env.example)"
    );
  }

  logger.info(`Reading from Google Sheet (batch size: ${CONFIG.BATCH_SIZE})`);
  return getPendingLinks(CONFIG.BATCH_SIZE);
}
