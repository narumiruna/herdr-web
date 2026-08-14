#!/usr/bin/env node

import { spawn } from "node:child_process";
import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:net";

const port = Number.parseInt(process.argv[2] ?? "", 10);
const token = process.env.HERDR_TERMINAL_PROXY_TOKEN?.trim() ?? "";
const command = process.env.HERDR_BINARY?.trim() || "herdr";
const MAX_CONNECTIONS = 16;
const MAX_LINE_BYTES = 70 * 1024;
const MAX_DIMENSION = 1_000;
const TARGET = /^[A-Za-z0-9:_-]{1,128}$/;

if (!Number.isInteger(port) || port < 1 || port > 65_535 || !token) {
  console.error(
    "usage: HERDR_TERMINAL_PROXY_TOKEN=<secret> terminal-session-proxy.mjs <port>",
  );
  process.exit(2);
}

function sameSecret(supplied) {
  const actual = Buffer.from(typeof supplied === "string" ? supplied : "");
  const expected = Buffer.from(token);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function validDimension(value) {
  return Number.isInteger(value) && value >= 1 && value <= MAX_DIMENSION;
}

function parseStart(line) {
  let value;
  try {
    value = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (
    value?.type !== "terminal.start" ||
    !sameSecret(value.token) ||
    !TARGET.test(value.paneId ?? "") ||
    !validDimension(value.cols) ||
    !validDimension(value.rows) ||
    !["control", "observe"].includes(value.mode) ||
    typeof value.takeover !== "boolean" ||
    (value.mode === "observe" && value.takeover)
  ) {
    return undefined;
  }
  return value;
}

function validCommand(line) {
  let value;
  try {
    value = JSON.parse(line);
  } catch {
    return false;
  }
  if (!value || typeof value !== "object") return false;
  if (value.type === "terminal.release") return true;
  if (value.type === "terminal.input") {
    return (
      typeof value.text === "string" &&
      Buffer.byteLength(value.text) <= 64 * 1024
    );
  }
  if (value.type === "terminal.resize") {
    return validDimension(value.cols) && validDimension(value.rows);
  }
  if (value.type === "terminal.scroll") {
    return (
      ["up", "down"].includes(value.direction) && validDimension(value.lines)
    );
  }
  return false;
}

function sendError(socket, code, message, recoverable = true) {
  if (!socket.destroyed) {
    socket.write(
      `${JSON.stringify({ type: "terminal.error", code, message, recoverable })}\n`,
    );
  }
}

let connections = 0;
const server = createServer((socket) => {
  if (connections >= MAX_CONNECTIONS) {
    sendError(socket, "terminal_capacity", "Terminal proxy capacity reached");
    socket.end();
    return;
  }
  connections += 1;
  socket.setEncoding("utf8");
  socket.setTimeout(10_000);
  let buffer = "";
  let child;
  let stderr = "";

  const closeChild = () => {
    if (!child || child.killed) return;
    child.stdin.write(`${JSON.stringify({ type: "terminal.release" })}\n`);
    child.stdin.end();
    const timer = setTimeout(() => child?.kill("SIGTERM"), 250);
    timer.unref();
  };

  const handleLine = (line) => {
    if (!child) {
      const start = parseStart(line);
      if (!start) {
        sendError(
          socket,
          "terminal_proxy_unauthorized",
          "Invalid terminal proxy request",
          false,
        );
        socket.end();
        return;
      }
      const args = [
        "terminal",
        "session",
        start.mode,
        start.paneId,
        "--cols",
        String(start.cols),
        "--rows",
        String(start.rows),
      ];
      if (start.mode === "control" && start.takeover) args.push("--takeover");
      child = spawn(command, args, {
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"],
      });
      socket.setTimeout(0);
      child.stdout.pipe(socket, { end: false });
      child.stdin.on("error", () => undefined);
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => {
        if (stderr.length < 8 * 1024)
          stderr += chunk.slice(0, 8 * 1024 - stderr.length);
      });
      child.once("error", (error) => {
        sendError(socket, "terminal_unavailable", error.message);
        socket.end();
      });
      child.once("exit", (code, signal) => {
        if (!socket.destroyed && !socket.writableEnded) {
          if (stderr.trim()) {
            sendError(socket, "terminal_process_exited", stderr.trim());
          } else if (code !== 0) {
            sendError(
              socket,
              "terminal_process_exited",
              `Herdr terminal session exited (${signal ?? code ?? "unknown"})`,
            );
          }
          socket.end();
        }
      });
      return;
    }
    if (!validCommand(line)) {
      sendError(
        socket,
        "invalid_terminal_message",
        "Invalid terminal proxy command",
      );
      return;
    }
    if (!child.stdin.write(`${line}\n`)) {
      socket.pause();
      child.stdin.once("drain", () => socket.resume());
    }
  };

  socket.on("data", (chunk) => {
    buffer += chunk;
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
      if (Buffer.byteLength(line) > MAX_LINE_BYTES) {
        sendError(
          socket,
          "terminal_message_too_large",
          "Terminal proxy command is too large",
          false,
        );
        socket.end();
        return;
      }
      if (line) handleLine(line);
    }
    if (Buffer.byteLength(buffer) > MAX_LINE_BYTES) {
      sendError(
        socket,
        "terminal_message_too_large",
        "Terminal proxy command is too large",
        false,
      );
      socket.end();
    }
  });
  socket.once("timeout", () => {
    sendError(
      socket,
      "terminal_proxy_timeout",
      "Terminal proxy start timed out",
      false,
    );
    socket.destroy();
  });
  socket.once("close", () => {
    connections = Math.max(0, connections - 1);
    closeChild();
  });
  socket.once("error", closeChild);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Herdr terminal session proxy listening on 127.0.0.1:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
