import { type KeyboardEvent, type PointerEvent, useRef } from "react";

export const MAX_PANE_RATIO = 0.9;
export const MIN_PANE_RATIO = 0.1;

export function clampPaneRatio(value: number): number {
  return Math.max(MIN_PANE_RATIO, Math.min(MAX_PANE_RATIO, value));
}

interface PaneResizeHandleProps {
  direction: "down" | "right";
  disabled: boolean;
  onCancel: () => void;
  onCommit: (ratio: number) => void;
  onDragStart: () => void;
  onPreview: (ratio: number) => void;
  ratio: number;
}

export function PaneResizeHandle({
  direction,
  disabled,
  onCancel,
  onCommit,
  onDragStart,
  onPreview,
  ratio,
}: PaneResizeHandleProps) {
  const pointerId = useRef<number | undefined>(undefined);

  const ratioFromPointer = (event: PointerEvent<HTMLHRElement>) => {
    const container =
      event.currentTarget.parentElement?.getBoundingClientRect();
    const handle = event.currentTarget.getBoundingClientRect();
    if (!container) return ratio;
    const horizontal = direction === "right";
    const length = horizontal ? container.width : container.height;
    const handleLength = horizontal ? handle.width : handle.height;
    const available = Math.max(1, length - handleLength);
    const pointer = horizontal
      ? event.clientX - container.left - handleLength / 2
      : event.clientY - container.top - handleLength / 2;
    return clampPaneRatio(pointer / available);
  };

  const resizeFromKey = (event: KeyboardEvent<HTMLHRElement>) => {
    if (disabled) return;
    const decrease = direction === "right" ? "ArrowLeft" : "ArrowUp";
    const increase = direction === "right" ? "ArrowRight" : "ArrowDown";
    const next =
      event.key === decrease
        ? ratio - 0.05
        : event.key === increase
          ? ratio + 0.05
          : event.key === "Home"
            ? MIN_PANE_RATIO
            : event.key === "End"
              ? MAX_PANE_RATIO
              : undefined;
    if (next === undefined) return;
    event.preventDefault();
    const value = clampPaneRatio(next);
    onPreview(value);
    onCommit(value);
  };

  return (
    <hr
      className="pane-resize-handle"
      data-direction={direction}
      aria-disabled={disabled}
      aria-label="Resize terminal panes"
      aria-orientation={direction === "right" ? "vertical" : "horizontal"}
      aria-valuemax={MAX_PANE_RATIO * 100}
      aria-valuemin={MIN_PANE_RATIO * 100}
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuetext={`${Math.round(ratio * 100)}% for the first pane`}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={resizeFromKey}
      onPointerCancel={(event) => {
        if (pointerId.current !== event.pointerId) return;
        pointerId.current = undefined;
        onCancel();
      }}
      onPointerDown={(event) => {
        if (disabled || event.button !== 0) return;
        pointerId.current = event.pointerId;
        onDragStart();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        onPreview(ratioFromPointer(event));
      }}
      onPointerMove={(event) => {
        if (pointerId.current !== event.pointerId) return;
        onPreview(ratioFromPointer(event));
      }}
      onPointerUp={(event) => {
        if (pointerId.current !== event.pointerId) return;
        const next = ratioFromPointer(event);
        onPreview(next);
        pointerId.current = undefined;
        event.currentTarget.releasePointerCapture?.(event.pointerId);
        onCommit(next);
      }}
    />
  );
}
