import { MAX_ATTACHMENT_BYTES, SUPPORTED_IMAGE_TYPES } from "../herdr-api";

export const MAX_TERMINAL_IMAGES = 8;

export type TerminalImageStatus =
  | "failed"
  | "staged"
  | "uploaded"
  | "uploading";

export interface TerminalImageItem {
  error: string;
  file: File;
  id: string;
  path: string;
  status: TerminalImageStatus;
}

export interface TerminalImageBatch {
  error: string;
  id: number;
  items: TerminalImageItem[];
}

let imageSequence = 0;

export function emptyTerminalImageBatch(id = 0): TerminalImageBatch {
  return { error: "", id, items: [] };
}

function nextImageId(): string {
  imageSequence += 1;
  return `terminal-image-${imageSequence}`;
}

export function terminalImageValidationError(file: File): string {
  if (
    !SUPPORTED_IMAGE_TYPES.includes(
      file.type as (typeof SUPPORTED_IMAGE_TYPES)[number],
    )
  ) {
    return "Choose a PNG, JPEG, GIF, or WebP image.";
  }
  if (file.size === 0 || file.size > MAX_ATTACHMENT_BYTES) {
    return "Image size must be between 1 byte and 8 MiB.";
  }
  return "";
}

export function appendTerminalImages(
  batch: TerminalImageBatch,
  files: File[],
): TerminalImageBatch {
  const capacity = Math.max(0, MAX_TERMINAL_IMAGES - batch.items.length);
  const accepted = files.slice(0, capacity).map((file) => {
    const error = terminalImageValidationError(file);
    return {
      error,
      file,
      id: nextImageId(),
      path: "",
      status: error ? ("failed" as const) : ("staged" as const),
    };
  });
  const rejected = Math.max(0, files.length - accepted.length);
  return {
    ...batch,
    error:
      rejected > 0
        ? `Only ${MAX_TERMINAL_IMAGES} images can be inserted at once. Remove an image before adding another.`
        : "",
    items: [...batch.items, ...accepted],
  };
}

export function updateTerminalImage(
  batch: TerminalImageBatch,
  batchId: number,
  itemId: string,
  update: Partial<Omit<TerminalImageItem, "file" | "id">>,
): TerminalImageBatch {
  if (batch.id !== batchId) return batch;
  return {
    ...batch,
    items: batch.items.map((item) =>
      item.id === itemId ? { ...item, ...update } : item,
    ),
  };
}

export function removeTerminalImage(
  batch: TerminalImageBatch,
  itemId: string,
): TerminalImageBatch {
  return {
    ...batch,
    error: "",
    items: batch.items.filter(({ id }) => id !== itemId),
  };
}

export function retryFailedTerminalImages(
  batch: TerminalImageBatch,
): TerminalImageBatch {
  return {
    ...batch,
    error: "",
    items: batch.items.map((item) =>
      item.status === "failed" && !terminalImageValidationError(item.file)
        ? { ...item, error: "", status: "staged" }
        : item,
    ),
  };
}

export function imageFilesFromTransfer(data: DataTransfer): File[] {
  const files = Array.from(data.files).filter(({ type }) =>
    type.startsWith("image/"),
  );
  if (files.length > 0) return files;
  const images: File[] = [];
  for (const item of Array.from(data.items)) {
    if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
    const file = item.getAsFile();
    if (file) images.push(file);
  }
  return images;
}

export async function imageFilesFromClipboardApi(): Promise<File[]> {
  if (typeof navigator.clipboard?.read !== "function") return [];
  try {
    const items = await navigator.clipboard.read();
    const images: File[] = [];
    for (const item of items) {
      const mediaType = item.types.find((type) => type.startsWith("image/"));
      if (!mediaType) continue;
      const blob = await item.getType(mediaType);
      const extension =
        mediaType.split("/")[1]?.replace("jpeg", "jpg") || "png";
      const position = images.length + 1;
      images.push(
        new File(
          [blob],
          `clipboard-image${position === 1 ? "" : `-${position}`}.${extension}`,
          { type: mediaType },
        ),
      );
    }
    return images;
  } catch {
    return [];
  }
}

export function shellEscapePath(path: string): string {
  return `'${path.replaceAll("'", `'"'"'`)}'`;
}

export function terminalImageInput(paths: string[]): string {
  return ` ${paths.map(shellEscapePath).join(" ")} `;
}
