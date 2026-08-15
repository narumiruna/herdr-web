import { randomBytes } from "node:crypto";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, extname, isAbsolute, join, relative, sep } from "node:path";

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

function contains(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return (
    path === "" ||
    (!isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`))
  );
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
  uploadsRoot = join(homedir(), ".herdr-web", "uploads"),
): Promise<UploadedFile> {
  validateFile(input);
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
