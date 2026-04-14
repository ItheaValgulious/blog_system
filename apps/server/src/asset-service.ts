import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const mimeExtensionMap: Record<string, string> = {
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/svg+xml": ".svg",
  "image/webp": ".webp"
};

export interface PastedImagePayload {
  mimeType: string;
  base64Data: string;
  fileName?: string;
}

export interface SavedAssetResult {
  fileName: string;
  relativePath: string;
  markdownPath: string;
}

export interface MediaAssetSummary {
  fileName: string;
  mimeType: string;
  relativePath: string;
  size: number;
  urlPath: string;
}

function inferFileExtension(mimeType: string, fileName?: string) {
  const fileNameExtension = fileName ? path.extname(fileName) : "";

  if (fileNameExtension) {
    return fileNameExtension.toLowerCase();
  }

  return mimeExtensionMap[mimeType] ?? ".png";
}

function inferMimeType(fileName: string) {
  const extension = path.extname(fileName).toLowerCase();
  const match = Object.entries(mimeExtensionMap).find(([, value]) => value === extension);
  return match?.[0] ?? "application/octet-stream";
}

function buildHashedFileName(binary: Buffer, extension: string) {
  const hash = createHash("sha256").update(binary).digest("hex");
  return `${hash}${extension}`;
}

export async function ensureAssetsRoot(assetsRoot: string) {
  await fs.mkdir(assetsRoot, { recursive: true });
}

export async function savePastedImages(
  assetsRoot: string,
  images: PastedImagePayload[]
): Promise<SavedAssetResult[]> {
  if (images.length === 0) {
    return [];
  }

  await ensureAssetsRoot(assetsRoot);
  const savedAssets: SavedAssetResult[] = [];

  for (const image of images) {
    const extension = inferFileExtension(image.mimeType, image.fileName);
    const binary = Buffer.from(image.base64Data, "base64");
    const fileName = buildHashedFileName(binary, extension);
    const absolutePath = path.join(assetsRoot, fileName);

    try {
      await fs.access(absolutePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        await fs.writeFile(absolutePath, binary);
      } else {
        throw error;
      }
    }

    savedAssets.push({
      fileName,
      relativePath: fileName,
      markdownPath: `@media/${fileName}`
    });
  }

  return savedAssets;
}

export async function listMediaAssets(assetsRoot: string): Promise<MediaAssetSummary[]> {
  await ensureAssetsRoot(assetsRoot);
  const entries = await fs.readdir(assetsRoot, { withFileTypes: true });
  const assets: MediaAssetSummary[] = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isFile()) {
      continue;
    }

    const absolutePath = path.join(assetsRoot, entry.name);
    const stats = await fs.stat(absolutePath);
    assets.push({
      fileName: entry.name,
      mimeType: inferMimeType(entry.name),
      relativePath: entry.name,
      size: stats.size,
      urlPath: `/media/${entry.name}`
    });
  }

  return assets;
}
