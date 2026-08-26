import {
  CheckCircledIcon,
  CircleIcon,
  CrossCircledIcon,
  ExclamationTriangleIcon,
  UpdateIcon,
} from "@radix-ui/react-icons";
import type { AgentStatus } from "../state";

const STATUS_LABEL: Record<AgentStatus, string> = {
  blocked: "Needs input",
  done: "Done",
  failed: "Failed",
  idle: "Idle",
  unknown: "Terminal",
  working: "Working",
};

export function agentStatusLabel(status: AgentStatus): string {
  return status === "unknown" ? "Unknown" : STATUS_LABEL[status];
}

interface StatusPillProps {
  status: AgentStatus;
  compact?: boolean;
}

export function StatusPill({ status, compact = false }: StatusPillProps) {
  const Icon =
    status === "blocked"
      ? ExclamationTriangleIcon
      : status === "done"
        ? CheckCircledIcon
        : status === "failed"
          ? CrossCircledIcon
          : status === "working"
            ? UpdateIcon
            : CircleIcon;

  return (
    <span className={`status-pill status-${status}`}>
      <Icon aria-hidden="true" />
      {!compact && STATUS_LABEL[status]}
      <span className="sr-only">{compact ? STATUS_LABEL[status] : ""}</span>
    </span>
  );
}
