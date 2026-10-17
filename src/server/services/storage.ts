import "server-only";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { db, type DbOrTx } from "@/db";
import { files } from "@/db/schema";
import { validationError } from "@/lib/errors";

/**
 * File storage. Bytes live in a storage driver; only metadata goes in Postgres.
 *
 * Files are written to local disk under ./.uploads (LOCAL_UPLOAD_DIR).
 *
 * Files are never publicly addressable. They are streamed through
 * /api/files/[id], which checks the viewer may see the course or submission
 * the file belongs to before returning a single byte.
 */

export type Purpose = "course_resource" | "submission";

type Rule = { exts: string[]; maxBytes: number };

const MB = 1024 * 1024;

const DOCS = ["pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "txt", "md", "csv", "odt", "odp", "ods", "rtf"];
const IMAGES = ["png", "jpg", "jpeg", "gif", "webp"];
const MEDIA = ["mp4", "webm", "mp3", "m4a", "wav"];

export const UPLOAD_RULES: Record<Purpose, Rule> = {
  course_resource: { exts: [...DOCS, ...IMAGES, ...MEDIA, "zip"], maxBytes: 25 * MB },
  submission: { exts: [...DOCS, ...IMAGES, "zip"], maxBytes: 10 * MB },
};
export const MAX_SUBMISSION_FILES = 5;

const MIME: Record<string, string> = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", mp4: "video/mp4", webm: "video/webm", mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav",
  txt: "text/plain", md: "text/markdown", csv: "text/csv", rtf: "application/rtf", zip: "application/zip",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  odt: "application/vnd.oasis.opendocument.text", odp: "application/vnd.oasis.opendocument.presentation",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
};

/** Content types a browser may render inline. Everything else is forced to download. */
export const INLINE_SAFE = new Set(["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp", "video/mp4", "video/webm", "audio/mpeg", "audio/mp4", "audio/wav"]);

/** Leading bytes for formats where a mismatch would be dangerous or misleading. */
const SIGNATURES: Record<string, number[][]> = {
  pdf: [[0x25, 0x50, 0x44, 0x46]],
  png: [[0x89, 0x50, 0x4e, 0x47]],
  jpg: [[0xff, 0xd8, 0xff]],
  jpeg: [[0xff, 0xd8, 0xff]],
  gif: [[0x47, 0x49, 0x46, 0x38]],
  zip: [[0x50, 0x4b, 0x03, 0x04], [0x50, 0x4b, 0x05, 0x06]],
  docx: [[0x50, 0x4b, 0x03, 0x04]],
  pptx: [[0x50, 0x4b, 0x03, 0x04]],
  xlsx: [[0x50, 0x4b, 0x03, 0x04]],
};

export function extensionOf(name: string): string {
  const m = /\.([a-z0-9]{1,8})$/i.exec(name);
  return m ? m[1].toLowerCase() : "";
}

export function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/\s+/g, " ").trim();
  return (cleaned || "file").slice(0, 160);
}

/** Validates an upload and returns the content type we will serve it as. */
export function validateUpload(name: string, size: number, head: Uint8Array, purpose: Purpose): string {
  const rule = UPLOAD_RULES[purpose];
  const ext = extensionOf(name);
  if (!ext || !rule.exts.includes(ext)) {
    throw validationError(`"${sanitizeFileName(name)}" is not an accepted file type. Allowed: ${rule.exts.join(", ")}.`);
  }
  if (size <= 0) throw validationError(`"${sanitizeFileName(name)}" is empty.`);
  if (size > rule.maxBytes) {
    throw validationError(`"${sanitizeFileName(name)}" is larger than ${Math.round(rule.maxBytes / MB)} MB.`);
  }
  const sigs = SIGNATURES[ext];
  if (sigs && !sigs.some((sig) => sig.every((b, i) => head[i] === b))) {
    throw validationError(`"${sanitizeFileName(name)}" does not look like a real .${ext} file.`);
  }
  return MIME[ext] ?? "application/octet-stream";
}

/* ── drivers ─────────────────────────────────────────────────────────── */

interface Driver {
  readonly name: string;
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  remove(key: string): Promise<void>;
}

class LocalDriver implements Driver {
  readonly name = "local";
  private root = resolve(process.env.LOCAL_UPLOAD_DIR ?? ".uploads");

  private path(key: string): string {
    // Keys are generated server-side (uuid + extension), but stay defensive.
    if (!/^[a-z0-9/_.-]+$/i.test(key) || key.includes("..")) throw new Error("bad storage key");
    return join(this.root, key);
  }
  async put(key: string, bytes: Uint8Array) {
    const p = this.path(key);
    await mkdir(resolve(p, ".."), { recursive: true });
    await writeFile(p, bytes);
  }
  async get(key: string) {
    return new Uint8Array(await readFile(this.path(key)));
  }
  async remove(key: string) {
    await unlink(this.path(key)).catch(() => undefined);
  }
}

function driverFor(name: string): Driver {
  if (name === "local") return new LocalDriver();
  throw new Error(`unknown storage driver ${name}`);
}

export function activeDriverName(): string {
  return "local";
}

/* ── public API ──────────────────────────────────────────────────────── */

export type StoredFile = typeof files.$inferSelect;

/**
 * Validates and stores one uploaded File, returning its metadata row.
 * Pass the transaction so the metadata commits with the record it belongs to;
 * if that transaction rolls back, the orphaned object is harmless and private.
 */
export async function storeUpload(file: File, ownerId: string, purpose: Purpose, conn: DbOrTx = db): Promise<StoredFile> {
  const driverName = activeDriverName();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = validateUpload(file.name, bytes.byteLength, bytes.subarray(0, 8), purpose);
  const ext = extensionOf(file.name);
  const key = `${purpose}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${ext}`;

  await driverFor(driverName).put(key, bytes, contentType);

  const [row] = await conn.insert(files).values({
    ownerId, driver: driverName, storageKey: key,
    originalName: sanitizeFileName(file.name), mimeType: contentType, sizeBytes: bytes.byteLength,
  }).returning();
  return row;
}

export async function readStoredFile(file: StoredFile): Promise<Uint8Array> {
  return driverFor(file.driver).get(file.storageKey);
}

export async function deleteStoredObject(file: StoredFile): Promise<void> {
  await driverFor(file.driver).remove(file.storageKey);
}

/** Pulls the real File objects out of a multipart field, ignoring empty inputs. */
export function filesFrom(fd: FormData, field: string): File[] {
  return fd.getAll(field).filter((v): v is File => typeof v === "object" && v !== null && "arrayBuffer" in v && (v as File).size > 0);
}
