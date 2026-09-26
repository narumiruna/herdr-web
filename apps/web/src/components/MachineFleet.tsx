import {
  Component1Icon,
  ExclamationTriangleIcon,
  GlobeIcon,
  ReloadIcon,
} from "@radix-ui/react-icons";
import { Button } from "@radix-ui/themes";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SavedMachineListResult, SavedMachineSummary } from "../herdr-api";

interface MachineFleetProps {
  load: (forceRefresh?: boolean) => Promise<SavedMachineListResult>;
  open: boolean;
}

function statusLabel(machine: SavedMachineSummary): string {
  if (machine.status === "online") return "Online";
  if (machine.status === "disabled") return "Disabled";
  return "Unavailable";
}

export function MachineFleet({ load, open }: MachineFleetProps) {
  const loadRef = useRef(load);
  const latestLoadId = useRef(0);
  const [catalog, setCatalog] = useState<SavedMachineListResult>({
    machineCount: 0,
    machines: [],
    machinesTruncated: false,
    type: "machine_list",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  const reload = useCallback(async (forceRefresh = false) => {
    const loadId = ++latestLoadId.current;
    setLoading(true);
    setError("");
    try {
      const next = await loadRef.current(forceRefresh);
      if (loadId === latestLoadId.current) setCatalog(next);
    } catch (loadError) {
      if (loadId === latestLoadId.current) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Saved SSH machines could not be loaded.",
        );
      }
    } finally {
      if (loadId === latestLoadId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      latestLoadId.current += 1;
      setLoading(false);
      return;
    }
    void reload();
  }, [open, reload]);

  const { machines } = catalog;

  return (
    <section className="machine-fleet" aria-labelledby="machine-fleet-title">
      <header>
        <span>
          <GlobeIcon aria-hidden="true" />
          <span>
            <h3 id="machine-fleet-title">Saved SSH machines</h3>
            <small>
              Remote snapshots from Herdr. Interactive terminals stay in the
              native client.
            </small>
          </span>
        </span>
        <Button
          type="button"
          size="1"
          variant="soft"
          loading={loading}
          onClick={() => void reload(true)}
        >
          <ReloadIcon /> Reload
        </Button>
      </header>

      {catalog.machinesTruncated && !error && (
        <p className="machine-fleet-limit" role="status">
          Showing the first {machines.length} of {catalog.machineCount} saved
          machines.
        </p>
      )}

      {error ? (
        <p className="machine-fleet-error" role="alert">
          {error}
        </p>
      ) : machines.length === 0 && !loading ? (
        <p className="machine-fleet-empty">
          No saved SSH machines. Add one with <code>herdr machine add</code>.
        </p>
      ) : (
        <div className="machine-fleet-grid">
          {machines.map((machine) => (
            <article className="machine-card" key={machine.id}>
              <header>
                <span>
                  <strong>{machine.label}</strong>
                  <small>
                    Session {machine.session}
                    {machine.version ? ` · Herdr ${machine.version}` : ""}
                    {machine.protocol ? ` · protocol ${machine.protocol}` : ""}
                  </small>
                </span>
                <span className="machine-status" data-state={machine.status}>
                  <i aria-hidden="true" /> {statusLabel(machine)}
                </span>
              </header>

              {machine.status === "online" ? (
                <>
                  <div className="machine-counts">
                    <span>
                      {machine.workspaceCount} Spaces
                      {machine.workspacesTruncated
                        ? ` · showing ${machine.workspaces.length}`
                        : ""}
                    </span>
                    <span>{machine.agentCount} Agents</span>
                    <span data-attention={machine.needsInput > 0}>
                      {machine.needsInput} need input
                    </span>
                  </div>
                  <div className="machine-space-list">
                    {machine.workspaces.map((workspace) => (
                      <section key={workspace.key}>
                        <header>
                          <Component1Icon aria-hidden="true" />
                          <strong>{workspace.label}</strong>
                          <small>
                            {workspace.agentCount} Agents
                            {workspace.agentsTruncated
                              ? ` · showing ${workspace.agents.length}`
                              : ""}
                          </small>
                          {workspace.needsInput > 0 && (
                            <span>
                              <ExclamationTriangleIcon aria-hidden="true" />
                              {workspace.needsInput}
                            </span>
                          )}
                        </header>
                        {workspace.agents.length > 0 && (
                          <ul>
                            {workspace.agents.map((agent) => (
                              <li key={agent.key} data-status={agent.status}>
                                <i aria-hidden="true" />
                                <span>{agent.label}</span>
                                <small>{agent.status}</small>
                              </li>
                            ))}
                          </ul>
                        )}
                      </section>
                    ))}
                  </div>
                </>
              ) : (
                <p className="machine-card-message">
                  {machine.status === "disabled"
                    ? "This saved machine is disabled in Herdr."
                    : machine.error || "The remote snapshot is unavailable."}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
