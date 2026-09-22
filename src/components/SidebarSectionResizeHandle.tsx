import { type KeyboardEvent, type PointerEvent, useRef, useState } from "react";

export const DEFAULT_SIDEBAR_SPACES_RATIO = 0.64;
export const MAX_SIDEBAR_SPACES_RATIO = 0.8;
export const MIN_SIDEBAR_SPACES_RATIO = 0.2;

export function clampSidebarSpacesRatio(value: number): number {
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
  const [dragging, setDragging] = useState(false);
  const pointerId = useRef<number | undefined>(undefined);
  const startRatio = useRef(ratio);

  const ratioFromPointer = (event: PointerEvent<HTMLHRElement>) => {
    const container =
      event.currentTarget.parentElement?.getBoundingClientRect();
    if (!container) return ratio;
    const handle = event.currentTarget.getBoundingClientRect();
    const available = Math.max(1, container.height - handle.height);
    const pointer = event.clientY - container.top - handle.height / 2;
    return clampSidebarSpacesRatio(pointer / available);
  };

  const resizeFromKey = (event: KeyboardEvent<HTMLHRElement>) => {
    const next =
      event.key === "ArrowUp"
        ? ratio - 0.05
        : event.key === "ArrowDown"
          ? ratio + 0.05
          : event.key === "Home"
            ? MIN_SIDEBAR_SPACES_RATIO
            : event.key === "End"
              ? MAX_SIDEBAR_SPACES_RATIO
              : undefined;
    if (next === undefined) return;
    event.preventDefault();
    onResize(clampSidebarSpacesRatio(next));
  };

  const spacesPercent = Math.round(ratio * 100);

  return (
    <hr
      className="sidebar-section-resize-handle"
      data-dragging={dragging}
      aria-label="Resize Spaces and Agents panels"
      aria-orientation="horizontal"
      aria-valuemax={MAX_SIDEBAR_SPACES_RATIO * 100}
      aria-valuemin={MIN_SIDEBAR_SPACES_RATIO * 100}
      aria-valuenow={spacesPercent}
      aria-valuetext={`${spacesPercent}% Spaces, ${100 - spacesPercent}% Agents`}
      tabIndex={0}
      onKeyDown={resizeFromKey}
      onPointerCancel={(event) => {
        if (pointerId.current !== event.pointerId) return;
        pointerId.current = undefined;
        setDragging(false);
        onResize(startRatio.current);
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        pointerId.current = event.pointerId;
        startRatio.current = ratio;
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
