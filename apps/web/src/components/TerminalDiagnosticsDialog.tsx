import { ActivityLogIcon } from "@radix-ui/react-icons";
import { RadixDialog } from "./RadixDialog";

export interface TerminalDiagnostics {
  accessMode: "control" | "observe";
  cols: number;
  inputRoundTripMs?: number;
  outputDeliveryMs?: number;
  protocol: number;
  reconnects: number;
  renderer: "canvas" | "webgl";
  rows: number;
  status: string;
  unicodeVersion: string;
}

interface TerminalDiagnosticsDialogProps {
  diagnostics: TerminalDiagnostics;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function latency(value: number | undefined): string {
  return value === undefined
    ? "Measuring…"
    : `${Math.max(0, Math.round(value))} ms`;
}

export function TerminalDiagnosticsDialog({
  diagnostics,
  open,
  onOpenChange,
}: TerminalDiagnosticsDialogProps) {
  return (
    <RadixDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Terminal diagnostics"
      description="Measured transport and renderer metadata. Terminal content, paths, credentials, and environment values are never included."
      className="terminal-diagnostics-dialog"
    >
      <div className="terminal-diagnostics-heading">
        <ActivityLogIcon aria-hidden="true" />
        <span>
          <strong>{diagnostics.status}</strong>
          <small>
            {diagnostics.accessMode === "control"
              ? "Terminal control session"
              : "Read-only terminal observation"}
          </small>
        </span>
      </div>
      <dl className="terminal-diagnostics-grid">
        <div>
          <dt>WebSocket bridge RTT</dt>
          <dd>{latency(diagnostics.inputRoundTripMs)}</dd>
        </div>
        <div>
          <dt>Output delivery</dt>
          <dd>{latency(diagnostics.outputDeliveryMs)}</dd>
        </div>
        <div>
          <dt>Reconnects</dt>
          <dd>{diagnostics.reconnects}</dd>
        </div>
        <div>
          <dt>Renderer</dt>
          <dd>
            {diagnostics.renderer === "webgl" ? "WebGL" : "Canvas fallback"}
          </dd>
        </div>
        <div>
          <dt>Dimensions</dt>
          <dd>
            {diagnostics.cols} × {diagnostics.rows}
          </dd>
        </div>
        <div>
          <dt>Unicode</dt>
          <dd>{diagnostics.unicodeVersion || "Default"}</dd>
        </div>
        <div>
          <dt>Herdr protocol</dt>
          <dd>{diagnostics.protocol || "Unavailable"}</dd>
        </div>
        <div>
          <dt>Access</dt>
          <dd>{diagnostics.accessMode}</dd>
        </div>
      </dl>
      <p className="terminal-diagnostics-note">
        WebSocket bridge RTT measures a non-mutating ping to herdr-web, not
        Herdr input processing. Output delivery uses a clock-offset estimate for
        frame transit and does not inspect output.
      </p>
    </RadixDialog>
  );
}
