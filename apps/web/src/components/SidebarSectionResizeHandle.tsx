import { type KeyboardEvent, type PointerEvent, useRef, useState } from "react";

export const DEFAULT_SIDEBAR_SPACES_RATIO = 0.5;
export const MAX_SIDEBAR_SPACES_RATIO = 0.9;
export const MIN_SIDEBAR_SPACES_RATIO = 0.1;

export function clampSidebarSpacesRatio(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SIDEBAR_SPACES_RATIO;
  return Math.max(
    MIN_SIDEBAR_SPACES_RATIO,
    Math.min(MAX_SIDEBAR_SPACES_RATIO, value),
  );
}

interface SidebarSectionResizeHandleProps {
  onResize: (ratio: number) => void;
  ratio: number;
}

export function SidebarSectionResizeHandle({
  onResize,
  ratio,
}: SidebarSectionResizeHandleProps) {
  const safeRatio = clampSidebarSpacesRatio(ratio);
  const [dragging, setDragging] = useState(false);
  const pointerId = useRef<number | undefined>(undefined);
  const startRatio = useRef(safeRatio);

  const ratioFromPointer = (event: PointerEvent<HTMLHRElement>) => {
    const container =
      event.currentTarget.parentElement?.getBoundingClientRect();
    const handle = event.currentTarget.getBoundingClientRect();
    if (!container || container.height <= handle.height) return safeRatio;
    return clampSidebarSpacesRatio(
      (event.clientY - container.top - handle.height / 2) /
        (container.height - handle.height),
    );
  };
  const cancelDrag = (event: PointerEvent<HTMLHRElement>) => {
    if (pointerId.current !== event.pointerId) return;
    pointerId.current = undefined;
    setDragging(false);
    onResize(startRatio.current);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  const resizeFromKey = (event: KeyboardEvent<HTMLHRElement>) => {
    const next =
      event.key === "ArrowUp"
        ? safeRatio - 0.05
        : event.key === "ArrowDown"
          ? safeRatio + 0.05
          : event.key === "Home"
            ? MIN_SIDEBAR_SPACES_RATIO
            : event.key === "End"
              ? MAX_SIDEBAR_SPACES_RATIO
              : undefined;
    if (next === undefined) return;
    event.preventDefault();
    onResize(clampSidebarSpacesRatio(next));
  };
  const percent = Math.round(safeRatio * 100);

  return (
    <hr
      className="sidebar-section-resize-handle"
      data-dragging={dragging}
      aria-label="Resize Spaces and Agents panels"
      aria-orientation="horizontal"
      aria-valuemax={MAX_SIDEBAR_SPACES_RATIO * 100}
      aria-valuemin={MIN_SIDEBAR_SPACES_RATIO * 100}
      aria-valuenow={percent}
      aria-valuetext={`${percent}% Spaces, ${100 - percent}% Agents`}
      tabIndex={0}
      onKeyDown={resizeFromKey}
      onPointerCancel={cancelDrag}
      onLostPointerCapture={cancelDrag}
      onPointerDown={(event) => {
        if (event.button !== 0 || pointerId.current !== undefined) return;
        event.preventDefault();
        event.currentTarget.focus();
        pointerId.current = event.pointerId;
        startRatio.current = safeRatio;
        setDragging(true);
        event.currentTarget.setPointerCapture?.(event.pointerId);
        onResize(ratioFromPointer(event));
      }}
      onPointerMove={(event) => {
        if (pointerId.current !== event.pointerId) return;
        onResize(ratioFromPointer(event));
      }}
      onPointerUp={(event) => {
        if (pointerId.current !== event.pointerId) return;
        onResize(ratioFromPointer(event));
        pointerId.current = undefined;
        setDragging(false);
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      }}
    />
  );
}
