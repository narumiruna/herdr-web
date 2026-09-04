import { createHash, randomBytes } from "node:crypto";
import {
  link,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative, sep } from "node:path";

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export interface ImageUploadInput {
  data: Buffer;
  mediaType: string;
  uploadId?: string;
}

export interface UploadedImage {
  mediaType: string;
  path: string;
  size: number;
  type: "image_uploaded";
}

const IMAGE_UPLOAD_ID = /^[A-Za-z0-9_-]{16,128}$/;

const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function startsWith(data: Buffer, bytes: number[]): boolean {
  return bytes.every((byte, index) => data[index] === byte);
}

function matchesSignature(mediaType: string, data: Buffer): boolean {
  switch (mediaType) {
    case "image/png":
      return startsWith(data, [137, 80, 78, 71, 13, 10, 26, 10]);
    case "image/jpeg":
      return startsWith(data, [255, 216, 255]);
    case "image/gif":
      return (
        data.subarray(0, 6).toString("ascii") === "GIF87a" ||
        data.subarray(0, 6).toString("ascii") === "GIF89a"
      );
    case "image/webp":
      return (
        data.subarray(0, 4).toString("ascii") === "RIFF" &&
        data.subarray(8, 12).toString("ascii") === "WEBP"
      );
    default:
      return false;
  }
}

export function validateImageUploadId(value: string): string {
  if (!IMAGE_UPLOAD_ID.test(value)) {
    throw new TypeError("Invalid image upload id");
  }
  return value;
}

export function validateImage({ data, mediaType }: ImageUploadInput): string {
  const extension = IMAGE_EXTENSIONS[mediaType];
  if (!extension) {
    throw new TypeError("Image must be PNG, JPEG, GIF, or WebP");
  }
  if (data.length === 0) throw new TypeError("Image must not be empty");
  if (data.length > MAX_IMAGE_BYTES) {
    throw new RangeError("Image must not exceed 8 MiB");
  }
  if (!matchesSignature(mediaType, data)) {
    throw new TypeError(`Image content does not match ${mediaType}`);
  }
  return extension;
}

function contains(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return (
    path === "" ||
    (!isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`))
  );
}

export async function writePaneImage(
  cwd: string,
  input: ImageUploadInput,
  projectsRoot?: string,
  uploadsRoot = join(homedir(), ".herdr-web", "uploads"),
): Promise<UploadedImage> {
  const extension = validateImage(input);
  if (!isAbsolute(cwd)) {
    throw new TypeError("Herdr pane did not report an absolute directory");
  }
  const projectDirectory = await realpath(cwd);
  if (projectsRoot) {
    const allowedRoot = await realpath(projectsRoot);
    if (!contains(allowedRoot, projectDirectory)) {
      throw new TypeError(
        "Pane directory is outside the Docker-mounted HERDR_PROJECTS_ROOT",
      );
    }
  }

  if (!isAbsolute(uploadsRoot)) {
    throw new TypeError("herdr-web upload directory must be absolute");
  }
  await mkdir(uploadsRoot, { mode: 0o700, recursive: true });
  const uploadDirectory = await realpath(uploadsRoot);

  const uploadId = input.uploadId
    ? validateImageUploadId(input.uploadId)
    : undefined;
  const digest = createHash("sha256").update(input.data).digest("hex");
  const filename = uploadId
    ? `image-${uploadId}-${digest.slice(0, 16)}.${extension}`
    : `image-${Date.now()}-${randomBytes(8).toString("hex")}.${extension}`;
  const path = join(uploadDirectory, filename);
  if (uploadId) {
    const temporaryPath = `${path}.${randomBytes(8).toString("hex")}.tmp`;
    await writeFile(temporaryPath, input.data, { flag: "wx", mode: 0o600 });
    try {
      try {
        await link(temporaryPath, path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
    } finally {
      await rm(temporaryPath, { force: true });
    }
    const existing = await readFile(path);
    if (!existing.equals(input.data)) {
      throw new TypeError("Image upload id conflicts with stored content");
    }
  } else {
    await writeFile(path, input.data, { flag: "wx", mode: 0o600 });
  }
  return {
    mediaType: input.mediaType,
    path,
    size: input.data.length,
    type: "image_uploaded",
  };
}
