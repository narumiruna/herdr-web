import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface ShareScope {
  agentId?: string;
  paneId?: string;
  workspaceId: string;
}

export interface ViewerShare {
  createdAt: number;
  expiresAt: number;
  id: string;
  revokedAt?: number;
  scope: ShareScope;
  tokenHash: string;
}

export interface PublicViewerShare extends Omit<ViewerShare, "tokenHash"> {}

interface StoredShares {
  shares: ViewerShare[];
  version: 1;
}

interface ShareStoreOptions {
  maxActive?: number;
  now?: () => number;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

export class ViewerShareStore {
  private readonly events = new EventEmitter();
  private loaded = false;
  private readonly maxActive: number;
  private readonly now: () => number;
  private shares: ViewerShare[] = [];
  private readonly dirtyRevocations = new Set<string>();
  private writes: Promise<void> = Promise.resolve();

  constructor(
    private readonly filePath: string,
    options: ShareStoreOptions = {},
  ) {
    this.maxActive = options.maxActive ?? 64;
    this.now = options.now ?? Date.now;
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const parsed = JSON.parse(
        await readFile(this.filePath, "utf8"),
      ) as StoredShares;
      this.shares =
        parsed?.version === 1 && Array.isArray(parsed.shares)
          ? parsed.shares.filter(
              (share) =>
                typeof share?.id === "string" &&
                typeof share?.tokenHash === "string" &&
                typeof share?.expiresAt === "number",
            )
          : [];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      this.shares = [];
    }
    this.prune();
    this.loaded = true;
  }

  private prune(): void {
    const now = this.now();
    const active = this.shares.filter(
      ({ expiresAt, revokedAt }) => !revokedAt && expiresAt > now,
    );
    const inactive = this.shares
      .filter(
        ({ expiresAt, revokedAt }) => Boolean(revokedAt) || expiresAt <= now,
      )
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, 192);
    this.shares = [...active, ...inactive].slice(0, 256);
  }

  private ensureLoaded(): void {
    if (!this.loaded) throw new Error("ViewerShareStore must be loaded first");
  }

  private persist(): Promise<void> {
    const write = this.writes.then(async () => {
      await mkdir(dirname(this.filePath), { recursive: true });
      const temporary = `${this.filePath}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
      await writeFile(
        temporary,
        `${JSON.stringify({ shares: this.shares, version: 1 }, null, 2)}\n`,
        { mode: 0o600 },
      );
      await rename(temporary, this.filePath);
    });
    this.writes = write.catch(() => undefined);
    return write;
  }

  list(): PublicViewerShare[] {
    this.ensureLoaded();
    this.prune();
    return this.shares.map(({ tokenHash: _tokenHash, ...share }) => share);
  }

  async create(
    scope: ShareScope,
    expiresInMs: number,
  ): Promise<{ share: PublicViewerShare; token: string }> {
    this.ensureLoaded();
    this.prune();
    const now = this.now();
    const active = this.shares.filter(
      ({ expiresAt, revokedAt }) => !revokedAt && expiresAt > now,
    );
    if (active.length >= this.maxActive) {
      throw new RangeError(
        `At most ${this.maxActive} viewer shares may be active`,
      );
    }
    const id = randomBytes(12).toString("base64url");
    const token = `share_${id}.${randomBytes(32).toString("base64url")}`;
    const record: ViewerShare = {
      createdAt: now,
      expiresAt: now + expiresInMs,
      id,
      scope,
      tokenHash: hashToken(token),
    };
    this.shares.push(record);
    try {
      await this.persist();
    } catch (error) {
      this.shares = this.shares.filter(({ id: shareId }) => shareId !== id);
      throw error;
    }
    const { tokenHash: _tokenHash, ...share } = record;
    return { share, token };
  }

  resolve(token: string): PublicViewerShare | undefined {
    this.ensureLoaded();
    if (!token.startsWith("share_") || token.length > 160) return undefined;
    const tokenHash = hashToken(token);
    const now = this.now();
    const supplied = Buffer.from(tokenHash);
    const found = this.shares.find((share) => {
      const expected = Buffer.from(share.tokenHash);
      return (
        supplied.length === expected.length &&
        timingSafeEqual(supplied, expected)
      );
    });
    if (!found || found.revokedAt || found.expiresAt <= now) return undefined;
    const { tokenHash: _tokenHash, ...share } = found;
    return share;
  }

  isActive(id: string): boolean {
    this.ensureLoaded();
    const now = this.now();
    return this.shares.some(
      (share) => share.id === id && !share.revokedAt && share.expiresAt > now,
    );
  }

  async revoke(id: string): Promise<boolean> {
    this.ensureLoaded();
    const share = this.shares.find((entry) => entry.id === id);
    if (!share) return false;
    if (share.revokedAt && !this.dirtyRevocations.has(id)) return false;
    if (!share.revokedAt) {
      share.revokedAt = this.now();
      this.events.emit("revoked", id);
    }
    try {
      await this.persist();
      this.dirtyRevocations.delete(id);
      return true;
    } catch (error) {
      this.dirtyRevocations.add(id);
      throw error;
    }
  }

  onRevoked(listener: (id: string) => void): () => void {
    this.events.on("revoked", listener);
    return () => this.events.off("revoked", listener);
  }
}
