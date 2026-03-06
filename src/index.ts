import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { getSpreadsheetInfo, listSheets, readSheet, updateSheet } from "./sheets.js";

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const MCP_SECRET = process.env.MCP_SECRET;

// MCP OAuth discovery — Claude.ai checks this before connecting.
// We respond with an empty doc to signal "no auth required".

// ---------------------------------------------------------------------------
// MCP server factory — one server instance per HTTP session
// ---------------------------------------------------------------------------
function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "sheets-mcp",
    version: "1.0.0",
  });

  // --- Tool: get_spreadsheet_info ---
  server.tool(
    "get_spreadsheet_info",
    "Get the title and list of worksheets (tabs) in a Google Spreadsheet.",
    {
      spreadsheet_id: z
        .string()
        .describe(
          "The Google Spreadsheet ID. Found in the URL: docs.google.com/spreadsheets/d/{ID}/edit"
        ),
    },
    async ({ spreadsheet_id }) => {
      const info = await getSpreadsheetInfo(spreadsheet_id);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(info, null, 2),
          },
        ],
      };
    }
  );

  // --- Tool: list_sheets ---
  server.tool(
    "list_sheets",
    "List all worksheet (tab) names in a Google Spreadsheet.",
    {
      spreadsheet_id: z
        .string()
        .describe("The Google Spreadsheet ID from the URL."),
    },
    async ({ spreadsheet_id }) => {
      const sheets = await listSheets(spreadsheet_id);
      return {
        content: [
          {
            type: "text",
            text: `Worksheets in spreadsheet:\n${sheets.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
          },
        ],
      };
    }
  );

  // --- Tool: read_sheet ---
  server.tool(
    "read_sheet",
    "Read cell values from a Google Spreadsheet. Returns rows as a 2D array of strings. Use get_spreadsheet_info or list_sheets first if you don't know the sheet names.",
    {
      spreadsheet_id: z
        .string()
        .describe("The Google Spreadsheet ID from the URL."),
      range: z
        .string()
        .describe(
          "A1 notation range, e.g. 'Sheet1!A1:Z100', 'Sheet1' (entire sheet), or 'A1:D50'. " +
            "Include the sheet name when the spreadsheet has multiple tabs."
        ),
    },
    async ({ spreadsheet_id, range }) => {
      const data = await readSheet(spreadsheet_id, range);

      if (data.rowCount === 0) {
        return {
          content: [{ type: "text", text: "The requested range is empty." }],
        };
      }

      // Format as a readable table (pipe-delimited) for Claude to parse easily
      const table = data.values
        .map((row) => row.join(" | "))
        .join("\n");

      return {
        content: [
          {
            type: "text",
            text:
              `Range: ${data.range}\nRows: ${data.rowCount}, Columns: ${data.columnCount}\n\n` +
              table,
          },
        ],
      };
    }
  );

  // --- Tool: update_sheet ---
  server.tool(
    "update_sheet",
    "Write values to a range in a Google Spreadsheet. Values are interpreted as if typed by a user (formulas, dates, and numbers are parsed naturally). The service account must have Editor access to the spreadsheet.",
    {
      spreadsheet_id: z.string().describe("The Google Spreadsheet ID from the URL."),
      range: z
        .string()
        .describe(
          "A1 notation of the top-left cell to start writing, e.g. 'Sheet1!A2' or 'Applications!J5'. " +
            "The range expands to fit the values array."
        ),
      values: z
        .array(z.array(z.string()))
        .describe(
          "2D array of values to write. Each inner array is one row. " +
            "Use empty string '' to leave a cell unchanged. " +
            "Example: [['Yes', '3/6/2026', 'Phone screen scheduled']]"
        ),
    },
    async ({ spreadsheet_id, range, values }) => {
      const result = await updateSheet(spreadsheet_id, range, values);
      return {
        content: [
          {
            type: "text",
            text:
              `Updated ${result.updatedCells} cell(s) in ${result.updatedRange}\n` +
              `Rows: ${result.updatedRows}, Columns: ${result.updatedColumns}`,
          },
        ],
      };
    }
  );

  return server;
}

// ---------------------------------------------------------------------------
// Express HTTP server with Streamable HTTP MCP transport
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json());

// Map of sessionId → transport for stateful connections
const sessions = new Map<string, StreamableHTTPServerTransport>();

const mcpPath = MCP_SECRET ? `/mcp/${MCP_SECRET}` : "/mcp";
console.log(`MCP path: ${mcpPath}`);

// Claude.ai performs OAuth discovery before connecting.
// Returning an empty object signals that no auth is required.
app.get("/.well-known/oauth-authorization-server", (_req, res) => {
  res.json({});
});

app.post(mcpPath, async (req, res) => {
  // Check if this is a new session (Initialize request) or existing
  if (isInitializeRequest(req.body)) {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: (sessionId) => {
        sessions.set(sessionId, transport);
      },
    });

    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid) sessions.delete(sid);
    };

    const server = createMcpServer();
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    return;
  }

  // Existing session
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  const transport = sessionId ? sessions.get(sessionId) : undefined;

  if (!transport) {
    res.status(404).json({ error: "Session not found or expired. Please re-initialize." });
    return;
  }

  await transport.handleRequest(req, res, req.body);
});

// SSE stream endpoint for server-to-client notifications
app.get(mcpPath, async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
const transport = sessionId ? sessions.get(sessionId) : undefined;

  if (!transport) {
    res.status(404).json({ error: "Session not found or expired. Please re-initialize." });
    return;
  }

  await transport.handleRequest(req, res);
});

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", server: "sheets-mcp" });
});

app.listen(PORT, () => {
  console.log(`sheets-mcp listening on http://localhost:${PORT}`);
  console.log(`MCP endpoint: http://localhost:${PORT}${mcpPath}`);
  if (!MCP_SECRET) {
    console.warn("Warning: MCP_SECRET is not set. The server is unauthenticated.");
  }
});
