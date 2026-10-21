import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

export async function htmlToPdf(html: string): Promise<Buffer> {
  const directory = await mkdtemp(join(tmpdir(), "winelio-pdf-"));
  try {
    const input = join(directory, "document.html");
    const output = join(directory, "document.pdf");
    await writeFile(input, html, "utf8");
    await execFileAsync("weasyprint", [input, output], { timeout: 30_000, maxBuffer: 1024 * 1024 });
    return await readFile(output);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
