import { google } from "googleapis";
import { getAuthClient } from "./auth.js";

function getSheetsClient() {
  return google.sheets({ version: "v4", auth: getAuthClient() });
}

export interface SpreadsheetInfo {
  spreadsheetId: string;
  title: string;
  sheets: Array<{ title: string; sheetId: number; rowCount: number; columnCount: number }>;
  spreadsheetUrl: string;
}

export interface SheetData {
  range: string;
  values: string[][];
  rowCount: number;
  columnCount: number;
}

/**
 * Returns title and worksheet metadata for a spreadsheet.
 */
export async function getSpreadsheetInfo(spreadsheetId: string): Promise<SpreadsheetInfo> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.get({ spreadsheetId });
  const data = res.data;

  return {
    spreadsheetId,
    title: data.properties?.title ?? "Untitled",
    spreadsheetUrl: data.spreadsheetUrl ?? "",
    sheets: (data.sheets ?? []).map((s) => ({
      title: s.properties?.title ?? "",
      sheetId: s.properties?.sheetId ?? 0,
      rowCount: s.properties?.gridProperties?.rowCount ?? 0,
      columnCount: s.properties?.gridProperties?.columnCount ?? 0,
    })),
  };
}

/**
 * Lists just the worksheet names (tab titles) in a spreadsheet.
 */
export async function listSheets(spreadsheetId: string): Promise<string[]> {
  const info = await getSpreadsheetInfo(spreadsheetId);
  return info.sheets.map((s) => s.title);
}

export interface UpdateResult {
  updatedRange: string;
  updatedRows: number;
  updatedColumns: number;
  updatedCells: number;
}

/**
 * Writes values to a spreadsheet range.
 * values is a 2D array of strings/numbers. Use USER_ENTERED so formulas and
 * dates are interpreted the same way as typing directly into the sheet.
 */
export async function updateSheet(
  spreadsheetId: string,
  range: string,
  values: string[][]
): Promise<UpdateResult> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });

  return {
    updatedRange: res.data.updatedRange ?? range,
    updatedRows: res.data.updatedRows ?? 0,
    updatedColumns: res.data.updatedColumns ?? 0,
    updatedCells: res.data.updatedCells ?? 0,
  };
}

/**
 * Reads values from a spreadsheet range.
 * range examples: "Sheet1!A1:Z100", "Sheet1", "A1:D10"
 */
export async function readSheet(spreadsheetId: string, range: string): Promise<SheetData> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption: "FORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });

  const values = (res.data.values ?? []) as string[][];
  return {
    range: res.data.range ?? range,
    values,
    rowCount: values.length,
    columnCount: values.length > 0 ? Math.max(...values.map((r) => r.length)) : 0,
  };
}
