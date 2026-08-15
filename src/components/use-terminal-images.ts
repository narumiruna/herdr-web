import { useCallback, useEffect, useRef, useState } from "react";
import type { UploadedImage } from "../herdr-api";
import {
  appendTerminalImages,
  emptyTerminalImageBatch,
  imageFilesFromClipboardApi,
  imageFilesFromTransfer,
  removeTerminalImage,
  retryFailedTerminalImages,
  updateTerminalImage,
} from "./terminal-images";

interface UseTerminalImagesOptions {
  onInsert: (paths: string[]) => boolean;
  onUpload: (paneId: string, image: File) => Promise<UploadedImage>;
  paneId: string;
  pasteEnabled: boolean;
}

export function useTerminalImages({
  onInsert,
  onUpload,
  paneId,
  pasteEnabled,
}: UseTerminalImagesOptions) {
  const batchRef = useRef(emptyTerminalImageBatch());
  const operation = useRef(false);
  const pasteGeneration = useRef(0);
  const mounted = useRef(true);
  const [batch, setBatch] = useState(batchRef.current);
  const [busy, setBusy] = useState(false);

  const commit = useCallback(
    (update: (current: typeof batchRef.current) => typeof batchRef.current) => {
      const next = update(batchRef.current);
      batchRef.current = next;
      setBatch(next);
      return next;
    },
    [],
  );

  const reset = useCallback(() => {
    commit((current) => emptyTerminalImageBatch(current.id + 1));
  }, [commit]);

  const stage = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      commit((current) => {
        const target = current.items.length
          ? current
          : emptyTerminalImageBatch(current.id + 1);
        return appendTerminalImages(target, files);
      });
    },
    [commit],
  );

  const stageTransfer = useCallback(
    (data: DataTransfer) => stage(imageFilesFromTransfer(data)),
    [stage],
  );

  const remove = useCallback(
    (itemId: string) =>
      commit((current) => removeTerminalImage(current, itemId)),
    [commit],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pasteGeneration.current += 1;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const pasteImages = (event: globalThis.ClipboardEvent) => {
      if (!pasteEnabled) return;
      const generation = ++pasteGeneration.current;
      const files = event.clipboardData
        ? imageFilesFromTransfer(event.clipboardData)
        : [];
      if (files.length > 0) {
        event.preventDefault();
        event.stopPropagation();
        stage(files);
        return;
      }
      if (!event.clipboardData?.types?.length) {
        void imageFilesFromClipboardApi().then((fallback) => {
          if (
            active &&
            generation === pasteGeneration.current &&
            fallback.length > 0
          ) {
            stage(fallback);
          }
        });
      }
    };
    window.addEventListener("paste", pasteImages, true);
    return () => {
      active = false;
      window.removeEventListener("paste", pasteImages, true);
    };
  }, [pasteEnabled, stage]);

  const submit = useCallback(async () => {
    if (operation.current || batchRef.current.items.length === 0) return;
    const prepared = commit(retryFailedTerminalImages);
    const batchId = prepared.id;
    operation.current = true;
    setBusy(true);
    try {
      while (mounted.current && batchRef.current.id === batchId) {
        const item = batchRef.current.items.find(
          ({ status }) => status === "staged",
        );
        if (!item) break;
        commit((current) =>
          updateTerminalImage(current, batchId, item.id, {
            error: "",
            status: "uploading",
          }),
        );
        try {
          const uploaded = await onUpload(paneId, item.file);
          if (!uploaded.path) {
            throw new Error(
              "The Herdr bridge did not return an uploaded image path.",
            );
          }
          if (!mounted.current || batchRef.current.id !== batchId) return;
          commit((current) =>
            updateTerminalImage(current, batchId, item.id, {
              error: "",
              path: uploaded.path,
              status: "uploaded",
            }),
          );
        } catch (uploadError) {
          if (!mounted.current || batchRef.current.id !== batchId) return;
          commit((current) =>
            updateTerminalImage(current, batchId, item.id, {
              error:
                uploadError instanceof Error
                  ? uploadError.message
                  : "Image upload failed.",
              status: "failed",
            }),
          );
        }
      }
      const completed = batchRef.current;
      if (
        completed.id !== batchId ||
        completed.items.length === 0 ||
        !completed.items.every(({ status }) => status === "uploaded")
      ) {
        return;
      }
      const paths = completed.items.map(({ path }) => path);
      if (onInsert(paths)) {
        reset();
      } else {
        commit((current) =>
          current.id === batchId
            ? {
                ...current,
                error:
                  "The images are uploaded, but their paths could not be inserted because this terminal is not writable. Take control and retry insertion.",
              }
            : current,
        );
      }
    } finally {
      operation.current = false;
      if (mounted.current) setBusy(false);
    }
  }, [commit, onInsert, onUpload, paneId, reset]);

  return { batch, busy, remove, reset, stage, stageTransfer, submit };
}
