import * as Tooltip from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";

interface IconTooltipProps {
  label: string;
  children: ReactNode;
}

export function IconTooltip({ label, children }: IconTooltipProps) {
  return (
    <Tooltip.Root delayDuration={350}>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip-content" sideOffset={7}>
          {label}
          <Tooltip.Arrow className="tooltip-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
