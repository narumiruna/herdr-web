import { randomBytes } from "node:crypto";

process.stdout.write(randomBytes(24).toString("hex"));
