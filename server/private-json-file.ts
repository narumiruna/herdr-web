import { randomBytes } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

// Read the value after mkdir, at the same point each store previously serialized.
// Stores retain ownership of mutation queues and persistence-failure recovery.
export async function writePrivateJson(
  filePath: string,
  value: () => unknown,
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value(), null, 2)}\n`, {
    mode: 0o600,
  });
  await rename(temporary, filePath);
}
