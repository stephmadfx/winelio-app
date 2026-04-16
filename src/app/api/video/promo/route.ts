import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const VIDEO_PATH = path.join(process.cwd(), "public", "promo.mp4");

export async function GET(req: NextRequest) {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(VIDEO_PATH);
  } catch {
    return new NextResponse("Not Found", { status: 404 });
  }

  const fileSize = stat.size;
  const rangeHeader = req.headers.get("range");

  if (rangeHeader) {
    // Parse: "bytes=start-end"
    const [, rangeStr] = rangeHeader.split("=");
    const [startStr, endStr] = rangeStr.split("-");
    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : Math.min(start + 1024 * 1024, fileSize - 1);
    const chunkSize = end - start + 1;

    const stream = fs.createReadStream(VIDEO_PATH, { start, end });
    const body = new ReadableStream({
      start(controller) {
        stream.on("data", (chunk) => controller.enqueue(chunk));
        stream.on("end", () => controller.close());
        stream.on("error", (err) => controller.error(err));
      },
      cancel() {
        stream.destroy();
      },
    });

    return new NextResponse(body, {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(chunkSize),
        "Content-Type": "video/mp4",
        "Cache-Control": "public, max-age=86400",
      },
    });
  }

  // Pas de Range → réponse complète
  const stream = fs.createReadStream(VIDEO_PATH);
  const body = new ReadableStream({
    start(controller) {
      stream.on("data", (chunk) => controller.enqueue(chunk));
      stream.on("end", () => controller.close());
      stream.on("error", (err) => controller.error(err));
    },
    cancel() {
      stream.destroy();
    },
  });

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Accept-Ranges": "bytes",
      "Content-Length": String(fileSize),
      "Content-Type": "video/mp4",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
