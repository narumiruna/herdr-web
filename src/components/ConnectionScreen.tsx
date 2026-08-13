import { LockClosedIcon, ReloadIcon } from "@radix-ui/react-icons";
import { Button, TextField } from "@radix-ui/themes";
import { type FormEvent, useState } from "react";
import type { ConnectionStatus } from "../use-herdr-runtime";
import { HerdrLogo } from "./HerdrLogo";

interface ConnectionScreenProps {
  error: string;
  onRetry: () => void;
  onToken: (token: string) => void;
  status: Exclude<ConnectionStatus, "ready">;
}

export function ConnectionScreen({
  error,
  onRetry,
  onToken,
  status,
}: ConnectionScreenProps) {
  const [token, setToken] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (token.trim()) onToken(token);
  };
  return (
    <main className="connection-screen">
      <section className="connection-card" aria-live="polite">
        <HerdrLogo />
        <span className="connection-eyebrow">herdr live bridge</span>
        {status === "loading" ? (
          <>
            <ReloadIcon className="connection-spinner" />
            <h1>Connecting to your flock…</h1>
            <p>Reading the live herdr session and terminal panes.</p>
          </>
        ) : status === "auth" ? (
          <>
            <LockClosedIcon className="connection-lock" />
            <h1>Enter the access token</h1>
            <p>
              Use the token printed by <code>just run</code> or{" "}
              <code>just up</code>.
            </p>
            <form className="connection-form" onSubmit={submit}>
              <TextField.Root
                aria-label="Herdr web access token"
                autoComplete="off"
                placeholder="Access token"
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
              />
              <Button type="submit" disabled={!token.trim()}>
                Connect
              </Button>
            </form>
            {error && <span className="connection-error">{error}</span>}
          </>
        ) : (
          <>
            <h1>Herdr is unavailable</h1>
            <p>{error || "The bridge could not read the herdr socket."}</p>
            <Button type="button" onClick={onRetry}>
              <ReloadIcon /> Retry
            </Button>
          </>
        )}
      </section>
    </main>
  );
}
