interface AttentionNotificationInput {
  detail: string;
  id: string;
  label: string;
  status: string;
  url: string;
  workspaceName: string;
}

export function isAttentionStatus(status: string): boolean {
  return status === "blocked" || status === "done" || status === "failed";
}

// URLs and detail fallbacks belong to each transport's projection, not delivery.
export function attentionNotification(
  agent: AttentionNotificationInput,
  privacy: "full" | "private",
) {
  const privateMode = privacy === "private";
  const title = privateMode
    ? agent.status === "done"
      ? "A Herdr Agent completed"
      : "A Herdr Agent needs attention"
    : agent.status === "blocked"
      ? `${agent.label} needs input`
      : agent.status === "failed"
        ? `${agent.label} failed`
        : `${agent.label} completed`;
  return {
    body: privateMode
      ? "Open herdr-web to review this Agent."
      : `${agent.workspaceName} · ${agent.detail}`,
    data: { url: agent.url },
    icon: "/icons/herdr-web-192.png",
    tag: `herdr-web-${agent.id}-${agent.status}`,
    title,
  };
}
