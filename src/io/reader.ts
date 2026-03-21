import { InputLink } from "../models/types";
import { getPendingLinks } from "./db";
import { CONFIG } from "../config";
import { logger } from "../utils/logger";

export async function readInputLinks(): Promise<InputLink[]> {
  logger.info(`Reading from database (batch size: ${CONFIG.BATCH_SIZE})`);
  return getPendingLinks(CONFIG.BATCH_SIZE);
}
