import { networkInterfaces } from "node:os";

const addresses = Object.values(networkInterfaces())
  .flatMap((entries) => entries ?? [])
  .filter(
    (entry) =>
      entry.family === "IPv4" &&
      !entry.internal &&
      !entry.address.startsWith("169.254."),
  )
  .map(({ address }) => address);
const preferred =
  addresses.find((address) => address.startsWith("192.168.")) ??
  addresses.find((address) => address.startsWith("10.")) ??
  addresses[0] ??
  "localhost";
process.stdout.write(preferred);
