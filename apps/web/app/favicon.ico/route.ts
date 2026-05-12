import { readFile } from "node:fs/promises";

export const runtime = "nodejs";

export async function GET() {
  const icon = await readFile(new URL("../icon.png", import.meta.url));
  return new Response(icon, {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=31536000, immutable"
    }
  });
}
