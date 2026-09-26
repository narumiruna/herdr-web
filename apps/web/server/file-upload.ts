import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { paneUploadDirectory } from "./upload-directory.js";

export const MAX_FILE_BYTES = 16 * 1024 * 1024;

export interface FileUploadInput {
  data: Buffer;
  filename?: string;
  mediaType: string;
}

export interface UploadedFile {
  mediaType: string;
  path: string;
  size: number;
  type: "file_uploaded";
}

const ALLOWED_FILE_TYPES = new Set([
  "application/json",
  "application/pdf",
  "application/zip",
  "text/csv",
  "text/markdown",
  "text/plain",
]);

function cleanExtension(filename?: string): string {
  const extension = extname(basename(filename ?? ""))
    .toLowerCase()
    .replaceAll(/[^a-z0-9.]/g, "")
    .slice(0, 16);
  return extension && extension !== "." ? extension : "";
}

export function validateFile({ data, mediaType }: FileUploadInput): void {
  const cleanType = mediaType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (!cleanType) throw new TypeError("File content type is required");
  if (!cleanType.startsWith("text/") && !ALLOWED_FILE_TYPES.has(cleanType)) {
    throw new TypeError(
      "File type is not allowed by the herdr-web upload policy",
    );
  }
  if (data.length === 0) throw new TypeError("File must not be empty");
  if (data.length > MAX_FILE_BYTES) {
    throw new RangeError("File must not exceed 16 MiB");
  }
}

export async function writePaneFile(
  cwd: string,
  input: FileUploadInput,
  projectsRoot?: string,
  uploadsRoot?: string,
): Promise<UploadedFile> {
  validateFile(input);
  const uploadDirectory = await paneUploadDirectory(
    cwd,
    projectsRoot,
    uploadsRoot,
  );
  const filename = `file-${Date.now()}-${randomBytes(8).toString("hex")}${cleanExtension(input.filename)}`;
  const path = join(uploadDirectory, filename);
  await writeFile(path, input.data, { flag: "wx", mode: 0o600 });
  return {
    mediaType: input.mediaType,
    path,
    size: input.data.length,
    type: "file_uploaded",
  };
}
