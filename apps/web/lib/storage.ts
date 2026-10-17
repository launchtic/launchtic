import { mkdir, writeFile, readFile, unlink, readdir, stat, copyFile, rm } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";
import { db } from "@launchtic/database";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MediaFile {
  key: string;
  name: string;
  url: string;
  size: number;
  lastModified?: string;
}

export interface ListResult {
  files: MediaFile[];
  hasMore: boolean;
  nextToken: string | null;
  total: number;
}

export interface StorageDriver {
  upload(key: string, buffer: Buffer, mimeType: string): Promise<string>;
  delete(key: string): Promise<void>;
  read(key: string): Promise<Buffer>;
  list(prefix: string, limit?: number, continuationToken?: string): Promise<ListResult>;
  /** Native server-side copy (no buffer through this app). Returns new public URL. */
  copy(srcKey: string, destKey: string): Promise<string>;
  /** Recursively delete every file under this workspace's prefix. Used when
   *  a workspace is hard-deleted so storage doesn't accumulate orphan files. */
  purge(workspaceId: string): Promise<void>;
}

// ─── Filename helpers ────────────────────────────────────────────────────────

const LEADING_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i;
const LEADING_SHORT_ID_RE = /^[0-9a-f]{8}-/i;     // matches our own short-id prefix
const MAX_BASE_LEN = 40;

function sanitizeName(filename: string): string {
  return filename
    // Drop diacritics instead of the whole letter: "hình" → "hinh", not "h_nh".
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D")
    .replace(/[^a-zA-Z0-9._-]/g, "_").toLowerCase();
}

// Names that image tools give files on export ("ChatGPT Image 16_17_30 12 thg
// 8, 2026", "Gemini_Generated_Image_8y47no…", "Screenshot 2026-08-14 at
// 11.00.38", "Untitled 2", Canva's Vietnamese "Thiết kế chưa có tên"). They end up in public URLs and say nothing about
// the image, so cleanFilename() drops them along with their date/hash noise.
const GENERATED_NAME_RE = /\b(chat\s*gpt|gemini|dall[\s·-]*e|midjourney|copilot|firefly|screen\s*shot|untitled)\b/i;
// Tokens left over from such names: generic words, month names (en + vi
// "thg"), numbers, and hash-like ids (mixed letters + digits, 8+ chars).
const GENERATED_NOISE_RE =
  /^(image|img|generated|at|am|pm|thg|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)$|^\d+$|^(?=.*\d)[a-z0-9]{8,}$/i;

/**
 * Human-meaningful display name for an uploaded file:
 *  - strips our own leading id prefixes (re-uploads of downloaded files);
 *  - always drops editing-tool marks: "Photoroom", "Background Removed",
 *    "removebg-preview", and
 *    trailing " copy 2" / " (1)";
 *  - for tool-generated names, drops the tool name and its date/hash noise.
 * Falls back to "image" when nothing meaningful is left. Keeps the extension.
 */
export function cleanFilename(filename: string): string {
  // NFC: macOS uploads arrive decomposed ("e" + combining marks).
  const name = filename.normalize("NFC").trim();
  const lastDot = name.lastIndexOf(".");
  let base  = lastDot > 0 ? name.slice(0, lastDot) : name;
  const ext = lastDot > 0 ? name.slice(lastDot)    : "";

  // A bare UUID name ("3ed99709-f4d1-….png") is as meaningless as a tool name.
  base = base.replace(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}(?=[\s(]|$)/i, "");
  // Strip ANY leading ID prefix(es) from previous hops — UUID v4 or short hex id.
  while (LEADING_UUID_RE.test(base) || LEADING_SHORT_ID_RE.test(base)) {
    base = base.replace(LEADING_UUID_RE, "").replace(LEADING_SHORT_ID_RE, "");
  }

  base = base.replace(/_+/g, " ").replace(/photoroom|background\s+removed|-?removebg(-preview)?/gi, " ");
  for (let prev = ""; prev !== base;) {
    prev = base;
    base = base.replace(/[\s.,_-]+$/, "").replace(/\s*\(\d+\)$/, "").replace(/\s+copy(\s+\d+)?$/i, "");
  }

  if (GENERATED_NAME_RE.test(base)) {
    base = base
      .replace(new RegExp(GENERATED_NAME_RE.source, "gi"), " ")
      .split(/[\s.,()-]+/)
      .filter((t) => t && !GENERATED_NOISE_RE.test(t))
      .join(" ");
  }

  base = base.replace(/\s+/g, " ").trim();
  return `${base || "image"}${ext}`;
}

/**
 * Build a short, predictable storage key. Output filename format:
 *   {8-hex-id}-{sanitized-base-up-to-40-chars}.{ext}
 *
 * The name goes through cleanFilename(): no accumulated IDs from round trips
 * (download → re-upload → export → import), no tool-generated noise.
 */
export function buildKey(workspaceId: string, filename: string, folder?: string): string {
  const name = cleanFilename(filename);

  const lastDot = name.lastIndexOf(".");
  const base = lastDot > 0 ? name.slice(0, lastDot) : name;
  const ext  = lastDot > 0 ? name.slice(lastDot)    : "";

  const safeBase = sanitizeName(base).slice(0, MAX_BASE_LEN) || "asset";
  const safeExt  = sanitizeName(ext);   // keeps ".jpg", ".png"…
  const shortId  = randomBytes(4).toString("hex");
  const file     = `${shortId}-${safeBase}${safeExt}`;

  if (folder && folder.trim()) {
    return `${workspaceId}/${sanitizeName(folder.trim())}/${file}`;
  }
  return `${workspaceId}/${file}`;
}

/**
 * Library display name. A name that cleaned down to the bare "image" fallback
 * shows the storage file name instead ("2a7fa121-image.png") so such files
 * stay tellable apart.
 */
export function assetDisplayName(filename: string, key: string): string {
  const name = cleanFilename(filename);
  return /^image(\.[^.]*)?$/i.test(name) ? key.slice(key.lastIndexOf("/") + 1) : name;
}

/**
 * Storage key of a file's grid thumbnail. Lives outside the workspace prefix
 * (`_thumbs/{ws}/…`) so library listings and their pagination never see it.
 */
export function thumbKey(key: string): string {
  return `_thumbs/${key}.webp`;
}

// ─── Local driver ────────────────────────────────────────────────────────────

export class LocalDriver implements StorageDriver {
  private root = join(process.cwd(), "public", "uploads");

  async upload(key: string, buffer: Buffer, mimeType: string): Promise<string> {
    const parts = key.split("/");
    const dir = join(this.root, ...parts.slice(0, -1));
    await mkdir(dir, { recursive: true });
    await writeFile(join(this.root, ...parts), buffer);
    return `/uploads/${key}`;
  }

  async delete(key: string): Promise<void> {
    const filePath = join(this.root, ...key.split("/"));
    await unlink(filePath);
  }

  async read(key: string): Promise<Buffer> {
    return readFile(join(this.root, ...key.split("/")));
  }

  /**
   * Native copy via fs.copyFile. On btrfs / APFS / XFS-reflink filesystems
   * this is a zero-byte metadata copy (copy-on-write) — instant even for
   * gigabyte files. Falls back to actual byte copy on ext4 etc., still
   * faster than read-into-buffer + write because Node's buffer is bypassed.
   */
  async copy(srcKey: string, destKey: string): Promise<string> {
    const srcParts  = srcKey.split("/");
    const destParts = destKey.split("/");
    const srcPath   = join(this.root, ...srcParts);
    const destDir   = join(this.root, ...destParts.slice(0, -1));
    const destPath  = join(this.root, ...destParts);
    await mkdir(destDir, { recursive: true });
    await copyFile(srcPath, destPath);
    return `/uploads/${destKey}`;
  }

  // Recursively collect all files under a directory
  private async collectFiles(dir: string, keyPrefix: string): Promise<MediaFile[]> {
    if (!existsSync(dir)) return [];
    const entries = await readdir(dir, { withFileTypes: true });
    const results: MediaFile[] = [];
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const key = `${keyPrefix}/${entry.name}`;
      if (entry.isFile()) {
        const info = await stat(fullPath).catch(() => null);
        results.push({ key, name: entry.name, url: `/uploads/${key}`, size: info?.size ?? 0, lastModified: info?.mtime.toISOString() });
      } else if (entry.isDirectory()) {
        results.push(...await this.collectFiles(fullPath, key));
      }
    }
    return results;
  }

  async list(prefix: string, limit = 20, continuationToken?: string): Promise<ListResult> {
    const dir = join(this.root, prefix);
    if (!existsSync(dir)) return { files: [], hasMore: false, nextToken: null, total: 0 };

    const isSubfolder = prefix.split("/").length > 1;
    let allFiles: MediaFile[];

    if (isSubfolder) {
      // Specific folder: list only direct files
      const entries = await readdir(dir, { withFileTypes: true });
      allFiles = await Promise.all(
        entries.filter(e => e.isFile()).map(async (e) => {
          const key = `${prefix}/${e.name}`;
          const info = await stat(join(dir, e.name)).catch(() => null);
          return { key, name: e.name, url: `/uploads/${key}`, size: info?.size ?? 0, lastModified: info?.mtime.toISOString() };
        })
      );
    } else {
      // Root workspace: collect all files recursively
      allFiles = await this.collectFiles(dir, prefix);
    }

    // Sort by lastModified descending (newest first)
    allFiles.sort((a, b) => (b.lastModified ?? "").localeCompare(a.lastModified ?? ""));

    const offset = continuationToken ? parseInt(continuationToken, 10) : 0;
    const page = allFiles.slice(offset, offset + limit);
    const hasMore = offset + limit < allFiles.length;
    return { files: page, hasMore, nextToken: hasMore ? String(offset + limit) : null, total: allFiles.length };
  }

  /** Wipe the entire workspace folder. force:true → no error if missing. */
  async purge(workspaceId: string): Promise<void> {
    await rm(join(this.root, workspaceId), { recursive: true, force: true });
    await rm(join(this.root, "_thumbs", workspaceId), { recursive: true, force: true });
  }
}

// ─── S3 driver ───────────────────────────────────────────────────────────────

interface S3Config {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  publicUrl?: string;
}

class S3Driver implements StorageDriver {
  constructor(private cfg: S3Config) {}

  private async client() {
    const { S3Client } = await import("@aws-sdk/client-s3");
    return new S3Client({
      endpoint: this.cfg.endpoint || undefined,
      region: this.cfg.region || "auto",
      credentials: { accessKeyId: this.cfg.accessKey, secretAccessKey: this.cfg.secretKey },
      forcePathStyle: !!this.cfg.endpoint, // required for MinIO / R2 custom endpoint
    });
  }

  private publicUrl(key: string): string {
    if (this.cfg.publicUrl) return `${this.cfg.publicUrl.replace(/\/$/, "")}/${key}`;
    return `https://${this.cfg.bucket}.s3.${this.cfg.region}.amazonaws.com/${key}`;
  }

  async upload(key: string, buffer: Buffer, mimeType: string): Promise<string> {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.client();
    await client.send(new PutObjectCommand({
      Bucket: this.cfg.bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    }));
    return this.publicUrl(key);
  }

  /** Get the bucket name — used by clone to detect same-bucket case. */
  get bucket(): string { return this.cfg.bucket; }

  /**
   * Native S3 server-side copy (CopyObjectCommand). Bytes never transit
   * through this app — S3 streams them internally between source and dest
   * keys. ~50ms per object, $0.0004 per 1000 requests, zero egress.
   * Same-bucket only (CopySource is bucket/key).
   */
  async copy(srcKey: string, destKey: string): Promise<string> {
    const { CopyObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.client();
    await client.send(new CopyObjectCommand({
      CopySource: `${this.cfg.bucket}/${srcKey}`,
      Bucket:     this.cfg.bucket,
      Key:        destKey,
    }));
    return this.publicUrl(destKey);
  }

  async delete(key: string): Promise<void> {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.client();
    await client.send(new DeleteObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
  }

  async read(key: string): Promise<Buffer> {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.client();
    const res = await client.send(new GetObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
    return Buffer.from(await res.Body!.transformToByteArray());
  }

  async list(prefix: string, limit = 20, continuationToken?: string): Promise<ListResult> {
    const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
    const client = await this.client();
    const res = await client.send(new ListObjectsV2Command({
      Bucket: this.cfg.bucket,
      Prefix: prefix + "/",
      MaxKeys: limit,
      ContinuationToken: continuationToken || undefined,
    }));

    const files: MediaFile[] = (res.Contents ?? []).map((obj) => ({
      key: obj.Key!,
      name: obj.Key!.split("/").pop() ?? obj.Key!,
      url: this.publicUrl(obj.Key!),
      size: obj.Size ?? 0,
      lastModified: obj.LastModified?.toISOString(),
    }));

    return {
      files,
      hasMore: res.IsTruncated ?? false,
      nextToken: res.NextContinuationToken ?? null,
      total: files.length,
    };
  }

  /**
   * Wipe every object under the workspace prefix. List+delete in 1000-key
   * batches (S3 DeleteObjects API limit). Handles paginated listings for
   * workspaces with >1000 assets.
   */
  async purge(workspaceId: string): Promise<void> {
    const { ListObjectsV2Command, DeleteObjectsCommand } = await import("@aws-sdk/client-s3");
    const client = await this.client();
    for (const prefix of [`${workspaceId}/`, `_thumbs/${workspaceId}/`]) {
      let token: string | undefined;
      do {
        const list = await client.send(new ListObjectsV2Command({
          Bucket: this.cfg.bucket,
          Prefix: prefix,
          ContinuationToken: token,
        }));
        const keys = (list.Contents ?? []).map((o) => ({ Key: o.Key! }));
        if (keys.length > 0) {
          await client.send(new DeleteObjectsCommand({
            Bucket: this.cfg.bucket,
            Delete: { Objects: keys, Quiet: true },
          }));
        }
        token = list.IsTruncated ? list.NextContinuationToken ?? undefined : undefined;
      } while (token);
    }
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/** Resolve the driver for a workspace via its organization's storage config. */
export async function getDriver(workspaceId: string): Promise<StorageDriver> {
  const ws = await db.workspace.findUnique({
    where:  { id: workspaceId },
    select: { organization: { select: { storage: true } } },
  });
  const cfg = ws?.organization?.storage as any;
  if (!cfg || cfg.driver === "local") return new LocalDriver();
  if (cfg.driver === "s3")            return driverFromConfig(cfg);
  return new LocalDriver();
}

/** Resolve just the driver NAME ("local" | "s3") for a workspace — used by
 *  Asset row creation to persist which driver wrote each file. */
export async function getDriverName(workspaceId: string): Promise<string> {
  const ws = await db.workspace.findUnique({
    where:  { id: workspaceId },
    select: { organization: { select: { storage: true } } },
  });
  return ((ws?.organization?.storage as any)?.driver as string) ?? "local";
}

/** Build a driver from a raw config object (used by the connection-test
 *  endpoint to probe credentials without persisting them). */
export function buildDriver(cfg: {
  driver?: string;
  bucket?: string; accessKey?: string; secretKey?: string;
  endpoint?: string; region?: string; publicUrl?: string;
}): StorageDriver {
  if (!cfg || cfg.driver === "local" || !cfg.driver) return new LocalDriver();
  if (cfg.driver === "s3")                          return driverFromConfig(cfg);
  return new LocalDriver();
}

function driverFromConfig(cfg: {
  bucket?: string; accessKey?: string; secretKey?: string;
  endpoint?: string; region?: string; publicUrl?: string;
}): StorageDriver {
  if (!cfg.bucket || !cfg.accessKey || !cfg.secretKey) {
    throw new Error("S3 storage is not fully configured");
  }
  return new S3Driver({
    endpoint:  cfg.endpoint  ?? undefined,
    region:    cfg.region    ?? "us-east-1",
    bucket:    cfg.bucket,
    accessKey: cfg.accessKey,
    secretKey: cfg.secretKey,
    publicUrl: cfg.publicUrl ?? undefined,
  });
}

