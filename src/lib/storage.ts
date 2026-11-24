import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { DATA_DIR } from "./db";

const FILES = path.join(DATA_DIR, "files");

/** Files are stored under random keys outside any web root and only served through /api/file. */
export async function saveFile(data: Buffer): Promise<string> {
  const key = crypto.randomBytes(16).toString("hex");
  await fs.writeFile(path.join(FILES, key), data, { mode: 0o600 });
  return key;
}
export async function readFile(key: string): Promise<Buffer> {
  if (!/^[a-f0-9]{32}$/.test(key)) throw new Error("bad storage key");
  return fs.readFile(path.join(FILES, key));
}
export async function deleteFile(key: string) {
  if (!/^[a-f0-9]{32}$/.test(key)) return;
  await fs.rm(path.join(FILES, key), { force: true });
}
