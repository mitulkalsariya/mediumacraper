import { google, sheets_v4 } from "googleapis";
import { CONFIG } from "../config";
import { InputLink } from "../models/types";
import { logger } from "../utils/logger";

let sheetsApi: sheets_v4.Sheets | null = null;

async function getSheetsApi(): Promise<sheets_v4.Sheets> {
  if (sheetsApi) return sheetsApi;

  const auth = new google.auth.GoogleAuth({
    keyFile: CONFIG.GOOGLE_CREDENTIALS_PATH,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  sheetsApi = google.sheets({ version: "v4", auth });
  return sheetsApi;
}

function colToLetter(col: number): string {
  return String.fromCharCode(65 + col);
}

export async function getPendingLinks(batchSize: number): Promise<InputLink[]> {
  const sheets = await getSheetsApi();
  const sheetId = CONFIG.GOOGLE_SHEET_ID;

  // Read all rows (columns A through O)
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: "Sheet1!A:O",
  });

  const rows = res.data.values;
  if (!rows || rows.length <= 1) {
    logger.warn("No data rows found in sheet");
    return [];
  }

  const links: InputLink[] = [];

  // Skip header row (index 0), iterate data rows
  for (let i = 1; i < rows.length && links.length < batchSize; i++) {
    const row = rows[i];
    const url = (row[CONFIG.COL_URL] || "").trim();
    const mdStatus = (row[CONFIG.COL_MD_STATUS] || "").trim().toLowerCase();

    // Skip if no URL or already processed
    if (!url || mdStatus === "done" || mdStatus === "error") continue;

    links.push({
      url,
      label: url.split("/").pop()?.substring(0, 50) || "article",
      rowNumber: i + 1, // 1-based row number for Sheets API
    });
  }

  logger.info(`Found ${links.length} pending links in sheet`);
  return links;
}

export async function updateMdStatus(
  rowNumber: number,
  status: "done" | "error"
): Promise<void> {
  const sheets = await getSheetsApi();
  const cell = `Sheet1!${colToLetter(CONFIG.COL_MD_STATUS)}${rowNumber}`;

  await sheets.spreadsheets.values.update({
    spreadsheetId: CONFIG.GOOGLE_SHEET_ID,
    range: cell,
    valueInputOption: "RAW",
    requestBody: { values: [[status]] },
  });
}

export async function updateUploadStatus(
  rowNumber: number,
  status: "done" | "error"
): Promise<void> {
  const sheets = await getSheetsApi();
  const cell = `Sheet1!${colToLetter(CONFIG.COL_UPLOAD_STATUS)}${rowNumber}`;

  await sheets.spreadsheets.values.update({
    spreadsheetId: CONFIG.GOOGLE_SHEET_ID,
    range: cell,
    valueInputOption: "RAW",
    requestBody: { values: [[status]] },
  });
}

export async function updateErrorMessage(
  rowNumber: number,
  message: string
): Promise<void> {
  const sheets = await getSheetsApi();
  const cell = `Sheet1!${colToLetter(CONFIG.COL_ERROR)}${rowNumber}`;

  await sheets.spreadsheets.values.update({
    spreadsheetId: CONFIG.GOOGLE_SHEET_ID,
    range: cell,
    valueInputOption: "RAW",
    requestBody: { values: [[message]] },
  });
}
