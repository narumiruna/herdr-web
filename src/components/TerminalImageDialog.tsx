import {
  CheckCircledIcon,
  Cross2Icon,
  ReloadIcon,
  UploadIcon,
} from "@radix-ui/react-icons";
import { Button, IconButton } from "@radix-ui/themes";
import { useEffect, useState } from "react";
import { RadixDialog } from "./RadixDialog";
import type { TerminalImageBatch, TerminalImageItem } from "./terminal-images";
import { terminalImageValidationError } from "./terminal-images";

interface TerminalImageDialogProps {
  batch: TerminalImageBatch;
  busy: boolean;
  canRequestControl: boolean;
  canUpload: boolean;
  controlActive: boolean;
  terminalReady: boolean;
  onCancel: () => void;
  onCloseAutoFocus: () => void;
  onRemove: (itemId: string) => void;
  onRequestControl: () => void;
  onSubmit: () => void;
}

function ImagePreview({ item }: { item: TerminalImageItem }) {
  const [previewUrl, setPreviewUrl] = useState("");

  useEffect(() => {
    if (typeof URL.createObjectURL !== "function") return;
    const url = URL.createObjectURL(item.file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [item.file]);

  return previewUrl ? (
    <img src={previewUrl} alt="" />
  ) : (
    <span className="terminal-image-placeholder" aria-hidden="true" />
  );
}

function statusText(item: TerminalImageItem): string {
  switch (item.status) {
    case "failed":
      return item.error;
    case "staged":
      return "Ready to upload";
    case "uploaded":
      return "Uploaded";
    case "uploading":
      return "Uploading…";
  }
}

export function TerminalImageDialog({
  batch,
  busy,
  canRequestControl,
  canUpload,
  controlActive,
  terminalReady,
  onCancel,
  onCloseAutoFocus,
  onRemove,
  onRequestControl,
  onSubmit,
}: TerminalImageDialogProps) {
  const count = batch.items.length;
  const uploaded = batch.items.filter(({ status }) => status === "uploaded");
  const failed = batch.items.filter(({ status }) => status === "failed");
  const invalid = failed.some(({ file }) => terminalImageValidationError(file));
  const allUploaded = count > 0 && uploaded.length === count;
  const retrying = failed.some(
    ({ file }) => !terminalImageValidationError(file),
  );
  const singular = count === 1;
  const buttonLabel = busy
    ? "Uploading…"
    : allUploaded
      ? `Insert uploaded path${singular ? "" : "s"}`
      : retrying
        ? "Retry failed uploads"
        : singular
          ? "Upload and insert path"
          : `Upload ${count} images and insert paths`;

  return (
    <RadixDialog
      open={count > 0}
      onOpenChange={(open) => {
        if (!open && !busy) onCancel();
      }}
      title={`Insert image path${singular ? "" : "s"}`}
      description={`Review ${singular ? "the image" : "these images"} before uploading. herdr-web inserts ${singular ? "the path" : "all paths"} without pressing Enter.`}
      className="terminal-image-dialog"
      closeDisabled={busy}
      onCloseAutoFocus={onCloseAutoFocus}
    >
      <div className="terminal-image-queue">
        <ul className="terminal-image-list">
          {batch.items.map((item) => (
            <li key={item.id} data-status={item.status}>
              <ImagePreview item={item} />
              <span className="terminal-image-copy">
                <strong data-testid="terminal-image-name">
                  {item.file.name}
                </strong>
                <small>
                  {Math.max(1, Math.ceil(item.file.size / 1024))} KB
                </small>
                {item.path && <code>{item.path}</code>}
                <span
                  className="terminal-image-status"
                  role={item.status === "failed" ? "alert" : "status"}
                >
                  {item.status === "uploaded" && (
                    <CheckCircledIcon aria-hidden="true" />
                  )}
                  {item.status === "uploading" && (
                    <ReloadIcon aria-hidden="true" />
                  )}
                  {statusText(item)}
                </span>
              </span>
              <IconButton
                type="button"
                size="1"
                variant="ghost"
                color="gray"
                aria-label={`Remove ${item.file.name}`}
                disabled={busy || item.status === "uploaded"}
                onClick={() => onRemove(item.id)}
              >
                <Cross2Icon />
              </IconButton>
            </li>
          ))}
        </ul>

        {batch.error && <span role="alert">{batch.error}</span>}
        {uploaded.length > 0 && (
          <span className="terminal-image-warning" role="status">
            Uploaded files remain on the Herdr host if this batch is cancelled.
            {!allUploaded && " Retrying uploads only unfinished images."}
          </span>
        )}
        {!controlActive && (
          <span className="terminal-image-warning" role="status">
            Take control of the terminal before uploading.
          </span>
        )}
        {controlActive && !terminalReady && (
          <span className="terminal-image-warning" role="status">
            Image ready. Wait for an Interactive terminal before uploading.
          </span>
        )}

        <div className="form-actions">
          {uploaded.length > 0 && (
            <Button
              type="button"
              variant="soft"
              color="gray"
              disabled={busy}
              onClick={() =>
                void navigator.clipboard?.writeText(
                  uploaded.map(({ path }) => path).join("\n"),
                )
              }
            >
              Copy uploaded path{uploaded.length === 1 ? "" : "s"}
            </Button>
          )}
          {!canUpload && canRequestControl && (
            <Button
              type="button"
              variant="soft"
              color="amber"
              disabled={busy}
              onClick={onRequestControl}
            >
              Restore control
            </Button>
          )}
          <Button
            type="button"
            variant="soft"
            color="gray"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="2"
            variant="solid"
            color="amber"
            highContrast
            disabled={busy || !canUpload || invalid}
            onClick={onSubmit}
          >
            {retrying ? (
              <ReloadIcon aria-hidden="true" />
            ) : (
              <UploadIcon aria-hidden="true" />
            )}
            {buttonLabel}
          </Button>
        </div>
      </div>
    </RadixDialog>
  );
}
