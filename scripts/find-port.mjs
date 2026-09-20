import { findPort } from "./startup-environment.mjs";

const preferred = Number.parseInt(process.argv[2] ?? "0", 10);
process.stdout.write(String(await findPort(preferred)));
