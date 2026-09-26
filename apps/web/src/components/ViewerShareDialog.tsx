import {
  CheckIcon,
  CopyIcon,
  Link2Icon,
  TrashIcon,
} from "@radix-ui/react-icons";
import { Button } from "@radix-ui/themes";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CreatedViewerShare,
  ViewerShare,
  ViewerShareScope,
} from "../herdr-api";
import type { HerdrState } from "../state";
import { RadixDialog } from "./RadixDialog";

interface ViewerShareDialogProps {
  open: boolean;
  state: HerdrState;
  load: () => Promise<ViewerShare[]>;
  onCreate: (
    scope: ViewerShareScope,
    expiresInMinutes: number,
  ) => Promise<CreatedViewerShare>;
  onOpenChange: (open: boolean) => void;
  onRevoke: (id: string) => Promise<void>;
}

export function ViewerShareDialog({
  open,
  state,
  load,
  onCreate,
  onOpenChange,
  onRevoke,
}: ViewerShareDialogProps) {
  const [shares, setShares] = useState<ViewerShare[]>([]);
  const [workspaceId, setWorkspaceId] = useState(state.selectedWorkspaceId);
  const [agentId, setAgentId] = useState("");
  const [paneId, setPaneId] = useState("");
  const [expiresInMinutes, setExpiresInMinutes] = useState(60);
  const [created, setCreated] = useState<CreatedViewerShare>();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const loadRef = useRef(load);
  loadRef.current = load;
  const sessions = useMemo(
    () => state.agents.filter((session) => session.workspaceId === workspaceId),
    [state.agents, workspaceId],
  );
  const selectedSession = sessions.find(({ id }) => id === agentId);
  const panes = selectedSession?.panes ?? [];

  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setCreated(undefined);
    setCopied(false);
    setError("");
    setWorkspaceId(state.selectedWorkspaceId);
    setBusy(true);
    void loadRef
      .current()
      .then(setShares)
      .catch((loadError) =>
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Shares could not load.",
        ),
      )
      .finally(() => setBusy(false));
  }, [open, state.selectedWorkspaceId]);

  const create = async () => {
    if (!workspaceId || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await onCreate(
        {
          workspaceId,
          ...(selectedSession?.kind === "agent" ? { agentId } : {}),
          ...(paneId ? { paneId } : {}),
        },
        expiresInMinutes,
      );
      setCreated(result);
      setShares((current) => [result.share, ...current]);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Viewer share could not be created.",
      );
    } finally {
      setBusy(false);
    }
  };

  const absoluteCreatedUrl = created
    ? new URL(created.url, window.location.href).toString()
    : "";

  return (
    <RadixDialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        if (!next) {
          setCreated(undefined);
          setCopied(false);
          setError("");
        }
        onOpenChange(next);
      }}
      title="Read-only viewer shares"
      description="Create short-lived, revocable links scoped to one Space, Agent, or pane. Shared viewers can observe only."
      className="viewer-share-dialog"
    >
      <div className="viewer-share-create">
        <label>
          <span>Space</span>
          <select
            value={workspaceId}
            onChange={(event) => {
              setWorkspaceId(event.target.value);
              setAgentId("");
              setPaneId("");
            }}
          >
            {state.workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>
            Session <small>optional</small>
          </span>
          <select
            value={agentId}
            onChange={(event) => {
              const session = sessions.find(
                ({ id }) => id === event.target.value,
              );
              setAgentId(event.target.value);
              setPaneId(
                session?.kind === "terminal" ? session.activePaneId : "",
              );
            }}
          >
            <option value="">Entire Space</option>
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.label}
                {session.kind === "terminal" ? " · Terminal" : " · Agent"}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>
            Pane <small>optional</small>
          </span>
          <select
            value={paneId}
            disabled={!agentId}
            onChange={(event) => setPaneId(event.target.value)}
          >
            <option value="" disabled={selectedSession?.kind === "terminal"}>
              {selectedSession?.kind === "terminal"
                ? "Select a Terminal pane"
                : "All panes in session"}
            </option>
            {panes.map((pane) => (
              <option key={pane.id} value={pane.id}>
                {pane.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Expires</span>
          <select
            value={expiresInMinutes}
            onChange={(event) =>
              setExpiresInMinutes(Number(event.target.value))
            }
          >
            <option value={15}>15 minutes</option>
            <option value={60}>1 hour</option>
            <option value={480}>8 hours</option>
            <option value={1440}>24 hours</option>
            <option value={10080}>7 days</option>
          </select>
        </label>
        <Button
          type="button"
          color="amber"
          disabled={
            busy ||
            !workspaceId ||
            (selectedSession?.kind === "terminal" && !paneId)
          }
          onClick={() => void create()}
        >
          <Link2Icon /> {busy ? "Working…" : "Create link"}
        </Button>
      </div>
      {created && (
        <section className="viewer-share-created" aria-label="New viewer share">
          <strong>The secret link is shown once</strong>
          <code>{absoluteCreatedUrl}</code>
          <Button
            type="button"
            size="1"
            variant="soft"
            onClick={() => {
              setError("");
              void navigator.clipboard
                .writeText(absoluteCreatedUrl)
                .then(() => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1_500);
                })
                .catch(() => setError("The viewer link could not be copied."));
            }}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? "Copied" : "Copy link"}
          </Button>
          <span className="sr-only" aria-live="polite">
            {copied ? "Viewer link copied" : ""}
          </span>
        </section>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <section className="viewer-share-list" aria-label="Viewer shares">
        <header>
          <h3>Issued links</h3>
          <span>
            {
              shares.filter(
                ({ revokedAt, expiresAt }) => !revokedAt && expiresAt > now,
              ).length
            }{" "}
            active
          </span>
        </header>
        {shares.length === 0 ? (
          <p>No viewer shares have been issued.</p>
        ) : (
          shares.map((share) => {
            const workspace = state.workspaces.find(
              ({ id }) => id === share.scope.workspaceId,
            );
            const target = state.agents.find(
              ({ id }) => id === share.scope.agentId,
            );
            const expired = share.expiresAt <= now;
            return (
              <div
                key={share.id}
                data-inactive={Boolean(share.revokedAt) || expired}
              >
                <span>
                  <strong>
                    {target?.label ??
                      workspace?.name ??
                      share.scope.workspaceId}
                  </strong>
                  <small>
                    {share.scope.paneId
                      ? `Pane ${share.scope.paneId}`
                      : share.scope.agentId
                        ? "Session"
                        : "Space"}
                    {" · "}
                    {share.revokedAt
                      ? "Revoked"
                      : expired
                        ? "Expired"
                        : `expires ${new Date(share.expiresAt).toLocaleString()}`}
                  </small>
                </span>
                {!share.revokedAt && !expired && (
                  <Button
                    type="button"
                    size="1"
                    color="red"
                    variant="soft"
                    disabled={busy}
                    onClick={() => {
                      setBusy(true);
                      void onRevoke(share.id)
                        .then(() =>
                          setShares((current) =>
                            current.map((entry) =>
                              entry.id === share.id
                                ? { ...entry, revokedAt: Date.now() }
                                : entry,
                            ),
                          ),
                        )
                        .catch((revokeError) =>
                          setError(
                            revokeError instanceof Error
                              ? revokeError.message
                              : "Share could not be revoked.",
                          ),
                        )
                        .finally(() => setBusy(false));
                    }}
                  >
                    <TrashIcon /> Revoke
                  </Button>
                )}
              </div>
            );
          })
        )}
      </section>
    </RadixDialog>
  );
}
