import { mkdir, writeFile, unlink, readdir, stat } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";
import { db } from "@launchtic/database";
import { decrypt, encrypt } from "./crypto";

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
  list(prefix: string, limit?: number, continuationToken?: string): Promise<ListResult>;
  listFolders(workspaceId: string): Promise<string[]>;
}

// ─── Filename helpers ────────────────────────────────────────────────────────

const LEADING_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i;
const LEADING_SHORT_ID_RE = /^[0-9a-f]{8}-/i;     // matches our own short-id prefix
const MAX_BASE_LEN = 40;

function sanitizeName(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_").toLowerCase();
}

/**
 * Build a short, predictable storage key. Output filename format:
 *   {8-hex-id}-{sanitized-base-up-to-40-chars}.{ext}
 *
 * Strips any leading UUID (or our own short-id prefix) recursively so a file
 * making multiple round trips (download → re-upload → export → import) does
 * not accumulate IDs in its name.
 */
export function buildKey(workspaceId: string, filename: string, folder?: string): string {
  let name = filename;
  // Strip ANY leading ID prefix(es) from previous hops — UUID v4 or short hex id.
  while (LEADING_UUID_RE.test(name) || LEADING_SHORT_ID_RE.test(name)) {
    name = name.replace(LEADING_UUID_RE, "").replace(LEADING_SHORT_ID_RE, "");
  }

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

// ─── Local driver ────────────────────────────────────────────────────────────

class LocalDriver implements StorageDriver {
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

  async listFolders(workspaceId: string): Promise<string[]> {
    const dir = join(this.root, workspaceId);
    if (!existsSync(dir)) return [];
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter(e => e.isDirectory()).map(e => e.name).sort();
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

  async delete(key: string): Promise<void> {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.client();
    await client.send(new DeleteObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
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

  async listFolders(workspaceId: string): Promise<string[]> {
    const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
    const client = await this.client();
    const res = await client.send(new ListObjectsV2Command({
      Bucket: this.cfg.bucket,
      Prefix: `${workspaceId}/`,
      Delimiter: "/",
      MaxKeys: 100,
    }));
    return (res.CommonPrefixes ?? [])
      .map(p => (p.Prefix ?? "").replace(`${workspaceId}/`, "").replace(/\/$/, ""))
      .filter(Boolean)
      .sort();
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export async function getDriver(workspaceId: string): Promise<StorageDriver> {
  const settings = await db.workspaceSettings.findUnique({ where: { workspaceId } });
  const s = settings?.storage as any;

  if (!s || s.driver === "local") return new LocalDriver();

  if (s.driver === "s3") {
    if (!s.bucket || !s.accessKey || !s.secretKeyEnc) {
      throw new Error("S3 storage is not fully configured");
    }
    return new S3Driver({
      endpoint:  s.endpoint  ?? undefined,
      region:    s.region    ?? "us-east-1",
      bucket:    s.bucket,
      accessKey: s.accessKey,
      secretKey: decrypt(s.secretKeyEnc),
      publicUrl: s.publicUrl ?? undefined,
    });
  }

  return new LocalDriver();
}

// ─── Re-export encrypt so settings route can use it ──────────────────────────
export { encrypt };
