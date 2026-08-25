import {
  CheckCircledIcon,
  CrossCircledIcon,
  CubeIcon,
  ReloadIcon,
} from "@radix-ui/react-icons";
import { Button } from "@radix-ui/themes";
import { useCallback, useEffect, useRef, useState } from "react";
import type { IntegrationAction, IntegrationTarget } from "../herdr-api";
import type { RuntimeManagementState } from "../use-herdr-runtime";
import { RadixDialog } from "./RadixDialog";

interface RuntimeManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  load: () => Promise<RuntimeManagementState>;
  onInvokePluginAction: (actionId: string) => Promise<void>;
  onManageIntegration: (
    target: IntegrationTarget,
    action: IntegrationAction,
  ) => Promise<void>;
  onSetPluginEnabled: (pluginId: string, enabled: boolean) => Promise<void>;
}

const INTEGRATIONS: Array<{
  label: string;
  target: IntegrationTarget;
}> = [
  { label: "Pi", target: "pi" },
  { label: "OMP", target: "omp" },
  { label: "Claude Code", target: "claude" },
  { label: "Codex", target: "codex" },
  { label: "GitHub Copilot CLI", target: "copilot" },
  { label: "Devin CLI", target: "devin" },
  { label: "Droid", target: "droid" },
  { label: "Kimi Code CLI", target: "kimi" },
  { label: "OpenCode", target: "opencode" },
  { label: "Kilo Code CLI", target: "kilo" },
  { label: "Hermes Agent", target: "hermes" },
  { label: "Qoder CLI", target: "qodercli" },
  { label: "Qwen Code", target: "qwen" },
  { label: "Cursor Agent CLI", target: "cursor" },
  { label: "MastraCode", target: "mastracode" },
  { label: "Antigravity CLI", target: "antigravity_cli" },
  { label: "Grok CLI", target: "grok" },
];

const EMPTY_MANAGEMENT: RuntimeManagementState = {
  actions: [],
  logs: [],
  plugins: [],
};

export function RuntimeManagementDialog({
  open,
  onOpenChange,
  load,
  onInvokePluginAction,
  onManageIntegration,
  onSetPluginEnabled,
}: RuntimeManagementDialogProps) {
  const loadRef = useRef(load);
  const [state, setState] = useState(EMPTY_MANAGEMENT);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setState(await loadRef.current());
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Herdr runtime controls could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setPending("");
      setError("");
      setNotice("");
      return;
    }
    void reload();
  }, [open, reload]);

  const mutate = async (key: string, action: () => Promise<void>) => {
    if (pending) return;
    setPending(key);
    setError("");
    setNotice("");
    try {
      await action();
      await reload();
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "The Herdr runtime action failed.",
      );
    } finally {
      setPending("");
    }
  };

  const manageIntegration = async (
    label: string,
    target: IntegrationTarget,
    action: IntegrationAction,
  ) => {
    const key = `integration:${target}:${action}`;
    await mutate(key, async () => {
      await onManageIntegration(target, action);
      setNotice(
        action === "install"
          ? `${label} integration was installed or repaired.`
          : `${label} integration was uninstalled.`,
      );
    });
  };

  return (
    <RadixDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Herdr runtime"
      description="Manage installed plugins, run declared actions, inspect logs, and update official Agent integrations."
      className="runtime-management-dialog"
    >
      <div className="runtime-management-content">
        <div className="runtime-management-heading">
          <span>
            <CubeIcon aria-hidden="true" /> Runtime extensions
          </span>
          <Button
            type="button"
            size="1"
            variant="soft"
            disabled={loading || Boolean(pending)}
            onClick={() => void reload()}
          >
            <ReloadIcon /> {loading ? "Loading…" : "Reload"}
          </Button>
        </div>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="runtime-management-notice" role="status">
            <CheckCircledIcon /> {notice}
          </p>
        )}

        <section className="runtime-management-section">
          <h3>Plugins</h3>
          <p>
            Plugins and actions come from Herdr. herdr-web never edits the
            plugin registry directly.
          </p>
          {state.plugins.length === 0 ? (
            <div className="runtime-management-empty">
              {loading ? "Loading plugins…" : "No installed plugins"}
            </div>
          ) : (
            <div className="runtime-management-list">
              {state.plugins.map((plugin) => (
                <article
                  className="runtime-management-card"
                  key={plugin.plugin_id}
                >
                  <div>
                    <strong>{plugin.name}</strong>
                    <small>
                      {plugin.plugin_id} · {plugin.version || "unversioned"}
                    </small>
                    {plugin.description && <p>{plugin.description}</p>}
                    {plugin.warnings?.map((warning) => (
                      <span
                        className="runtime-management-warning"
                        key={warning}
                      >
                        <CrossCircledIcon /> {warning}
                      </span>
                    ))}
                  </div>
                  <Button
                    type="button"
                    size="1"
                    color={plugin.enabled ? "red" : "green"}
                    variant="soft"
                    disabled={Boolean(pending)}
                    onClick={() =>
                      void mutate(`plugin:${plugin.plugin_id}`, () =>
                        onSetPluginEnabled(plugin.plugin_id, !plugin.enabled),
                      )
                    }
                  >
                    {plugin.enabled ? "Disable" : "Enable"}
                  </Button>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="runtime-management-section">
          <h3>Plugin actions</h3>
          {state.actions.length === 0 ? (
            <div className="runtime-management-empty">No declared actions</div>
          ) : (
            <div className="runtime-management-list">
              {state.actions.map((action) => (
                <article
                  className="runtime-management-card"
                  key={action.action_id}
                >
                  <div>
                    <strong>{action.title}</strong>
                    <small>{action.plugin_id}</small>
                    {action.description && <p>{action.description}</p>}
                  </div>
                  <Button
                    type="button"
                    size="1"
                    color="amber"
                    disabled={Boolean(pending)}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Run plugin action “${action.title}”? The plugin command will execute on the Herdr host.`,
                        )
                      ) {
                        void mutate(`action:${action.action_id}`, () =>
                          onInvokePluginAction(action.action_id),
                        );
                      }
                    }}
                  >
                    Run
                  </Button>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="runtime-management-section">
          <h3>Recent plugin logs</h3>
          {state.logs.length === 0 ? (
            <div className="runtime-management-empty">
              No plugin command logs
            </div>
          ) : (
            <div className="runtime-log-list">
              {state.logs.slice(0, 10).map((log) => (
                <article key={log.log_id}>
                  <span data-status={log.status}>{log.status}</span>
                  <strong>{log.action_id || log.plugin_id}</strong>
                  <time dateTime={new Date(log.started_unix_ms).toISOString()}>
                    {new Date(log.started_unix_ms).toLocaleString()}
                  </time>
                  {(log.error || log.stderr || log.stdout) && (
                    <pre>{log.error || log.stderr || log.stdout}</pre>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="runtime-management-section">
          <h3>Official Agent integrations</h3>
          <p>
            Herdr does not expose typed integration status through its socket
            API yet. Install/repair is idempotent; uninstall removes only
            Herdr-managed integration files.
          </p>
          <div className="integration-management-grid">
            {INTEGRATIONS.map(({ label, target }) => (
              <article key={target}>
                <strong>{label}</strong>
                <span>
                  <Button
                    type="button"
                    size="1"
                    variant="soft"
                    disabled={Boolean(pending)}
                    onClick={() =>
                      void manageIntegration(label, target, "install")
                    }
                  >
                    Install / repair
                  </Button>
                  <Button
                    type="button"
                    size="1"
                    variant="ghost"
                    color="red"
                    disabled={Boolean(pending)}
                    onClick={() =>
                      void manageIntegration(label, target, "uninstall")
                    }
                  >
                    Uninstall
                  </Button>
                </span>
              </article>
            ))}
          </div>
        </section>
      </div>
    </RadixDialog>
  );
}
