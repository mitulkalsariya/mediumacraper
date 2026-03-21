import { PrismaClient } from "@prisma/client";
import { InputLink } from "../models/types";
import { logger } from "../utils/logger";

const prisma = new PrismaClient();

export async function getPendingLinks(batchSize: number): Promise<InputLink[]> {
  const links = await prisma.link.findMany({
    where: { mdStatus: "pending" },
    take: batchSize,
    orderBy: { id: "asc" },
  });

  logger.info(`Found ${links.length} pending links in database`);

  return links.map((link) => ({
    url: link.url,
    id: link.id,
  }));
}

export async function updateLinkStatus(
  id: number,
  data: { mdStatus?: string; uploadStatus?: string; error?: string }
): Promise<void> {
  await prisma.link.update({
    where: { id },
    data,
  });
}

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}
