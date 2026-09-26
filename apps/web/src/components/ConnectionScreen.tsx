import { LockClosedIcon, ReloadIcon } from "@radix-ui/react-icons";
import { Button, TextField } from "@radix-ui/themes";
import { type FormEvent, useState } from "react";
import type { ConnectionStatus } from "../use-herdr-runtime";
import { HerdrWebLogo } from "./HerdrWebLogo";

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

  if (status === "loading") {
    return (
      <main
        className="loading-workbench"
        aria-busy="true"
        aria-label="Connecting to Herdr"
      >
        <aside className="loading-sidebar">
          <HerdrWebLogo />
          <span className="skeleton skeleton-heading" />
          <span className="skeleton" />
          <span className="skeleton" />
          <span className="skeleton skeleton-short" />
        </aside>
        <section className="loading-surface">
          <header>
            <span className="skeleton skeleton-short" />
            <ReloadIcon className="connection-spinner" aria-hidden="true" />
          </header>
          <div>
            <span className="connection-eyebrow">Connecting to Herdr</span>
            <h1>Preparing your workbench…</h1>
            <p>Reading Spaces, detected Agents, and terminal output.</p>
            <span className="skeleton skeleton-terminal" />
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="connection-screen">
      <section className="connection-card" aria-live="polite">
        <HerdrWebLogo />
        <span className="connection-eyebrow">herdr-web bridge</span>
        {status === "auth" ? (
          <>
            <LockClosedIcon className="connection-lock" aria-hidden="true" />
            <h1>Enter the access token</h1>
            <p>
              Use the token printed by <code>just run</code> or{" "}
              <code>just up</code>.
            </p>
            <form className="connection-form" onSubmit={submit}>
              <TextField.Root
                aria-label="herdr-web access token"
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
            {error && (
              <span className="connection-error" role="alert">
                {error}
              </span>
            )}
          </>
        ) : (
          <>
            <h1>Herdr is unavailable</h1>
            <p>{error || "The bridge could not read the Herdr socket."}</p>
            <Button type="button" onClick={onRetry}>
              <ReloadIcon /> Retry
            </Button>
          </>
        )}
      </section>
    </main>
  );
}
