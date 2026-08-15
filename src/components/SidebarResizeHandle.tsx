import { type KeyboardEvent, type PointerEvent, useRef, useState } from "react";

export const DEFAULT_SIDEBAR_WIDTH = 220;
export const MAX_SIDEBAR_WIDTH = 320;
export const MIN_SIDEBAR_WIDTH = 180;

export function clampSidebarWidth(value: number): number {
  return Math.round(
    Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, value)),
  );
}

interface SidebarResizeHandleProps {
  onResize: (width: number) => void;
  width: number;
}

export function SidebarResizeHandle({
  onResize,
  width,
}: SidebarResizeHandleProps) {
  const [dragging, setDragging] = useState(false);
  const pointerId = useRef<number | undefined>(undefined);
  const startWidth = useRef(width);

  const widthFromPointer = (event: PointerEvent<HTMLHRElement>) => {
    const container =
      event.currentTarget.parentElement?.getBoundingClientRect();
    return clampSidebarWidth(event.clientX - (container?.left ?? 0));
  };

  const resizeFromKey = (event: KeyboardEvent<HTMLHRElement>) => {
    const next =
      event.key === "ArrowLeft"
        ? width - 10
        : event.key === "ArrowRight"
          ? width + 10
          : event.key === "Home"
            ? MIN_SIDEBAR_WIDTH
            : event.key === "End"
              ? MAX_SIDEBAR_WIDTH
              : undefined;
    if (next === undefined) return;
    event.preventDefault();
    onResize(clampSidebarWidth(next));
  };

  return (
    <hr
      className="sidebar-resize-handle"
      data-dragging={dragging}
      aria-label="Resize navigation"
      aria-orientation="vertical"
      aria-valuemax={MAX_SIDEBAR_WIDTH}
      aria-valuemin={MIN_SIDEBAR_WIDTH}
      aria-valuenow={width}
      tabIndex={0}
      onKeyDown={resizeFromKey}
      onPointerCancel={(event) => {
        if (pointerId.current !== event.pointerId) return;
        pointerId.current = undefined;
        setDragging(false);
        onResize(startWidth.current);
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        pointerId.current = event.pointerId;
        startWidth.current = width;
        setDragging(true);
        event.currentTarget.setPointerCapture?.(event.pointerId);
        onResize(widthFromPointer(event));
      }}
      onPointerMove={(event) => {
        if (pointerId.current !== event.pointerId) return;
        onResize(widthFromPointer(event));
      }}
      onPointerUp={(event) => {
        if (pointerId.current !== event.pointerId) return;
        onResize(widthFromPointer(event));
        pointerId.current = undefined;
        setDragging(false);
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      }}
    />
  );
}
