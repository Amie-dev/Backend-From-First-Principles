import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOAD_DIR = path.join(__dirname, "../../uploads");

// Ensure uploads directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * POST /api/v1/stream/upload
 * Streams incoming network socket data directly to a file on disk
 * without loading the whole payload into memory (OOM Prevention).
 */
export function streamUpload(req, res) {
  const targetPath = path.join(UPLOAD_DIR, `upload_${Date.now()}.bin`);
  const writeStream = fs.createWriteStream(targetPath);

  let totalBytesRead = 0;

  req.on("data", (chunk) => {
    totalBytesRead += chunk.length;
    console.log(`[Stream Controller] Read ${chunk.length} bytes chunk. Total: ${totalBytesRead} B`);
  });

  // Pipe socket directly to file system
  req.pipe(writeStream);

  writeStream.on("finish", () => {
    res.status(200).json({
      status: "success",
      message: "Large file successfully streamed to disk without RAM overflow",
      bytesReceived: totalBytesRead,
      savedPath: targetPath
    });
  });

  writeStream.on("error", (err) => {
    console.error("[Stream Controller Error]", err);
    res.status(500).json({ error: "Failed to write streamed file to disk" });
  });
}

/**
 * GET /api/v1/stream/events (Server-Sent Events - SSE)
 * Opens a persistent HTTP stream delivering real-time progress events to browser.
 */
export function streamEvents(req, res) {
  // Set SSE Headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*"
  });

  let percent = 0;

  // Stream initial connection event
  res.write(`event: connected\ndata: {"message": "SSE Stream Established"}\n\n`);

  const interval = setInterval(() => {
    percent += 20;

    res.write(`event: progress\n`);
    res.write(`data: ${JSON.stringify({ percent, timestamp: new Date().toISOString() })}\n\n`);

    if (percent >= 100) {
      clearInterval(interval);
      res.write(`event: complete\ndata: {"status": "finished"}\n\n`);
      res.end();
    }
  }, 500);

  // Clean up timer if client closes connection abruptly
  req.on("close", () => {
    clearInterval(interval);
    console.log("[SSE Controller] Client closed connection.");
  });
}
