import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { writePaneFile } from "../server/file-upload";
import type { HerdrClient } from "../server/herdr-client";
import { LiveHerdrService } from "../server/herdr-service";
import { writePaneImage } from "../server/image-upload";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "herdr-upload-"));
  directories.push(root);
  const projects = join(root, "projects");
  const cwd = join(projects, "project");
  const uploads = join(root, "uploads");
  const outside = join(root, "outside");
  await mkdir(cwd, { recursive: true });
  await mkdir(outside);
  return { root, projects, cwd, uploads, outside };
}

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const cases = [
  {
    name: "image",
    write: writePaneImage,
    input: { data: png, mediaType: "image/png" },
  },
  {
    name: "file",
    write: writePaneFile,
    input: {
      data: Buffer.from("hello"),
      mediaType: "text/plain",
      filename: "hello.txt",
    },
  },
];

for (const { name, write, input } of cases) {
  describe(`${name} upload directories`, () => {
    test("canonicalizes pane and root symlinks and writes private files outside the project", async () => {
      const paths = await fixture();
      const alias = join(paths.root, "alias");
      await symlink(paths.projects, alias, "junction");
      const uploaded = await write(
        join(alias, "project"),
        input,
        alias,
        paths.uploads,
      );
      expect(dirname(uploaded.path)).toBe(await realpath(paths.uploads));
      expect(await readFile(uploaded.path)).toEqual(input.data);
      expect(await readdir(paths.cwd)).toEqual([]);
      if (process.platform !== "win32") {
        expect((await stat(paths.uploads)).mode & 0o777).toBe(0o700);
        expect((await stat(uploaded.path)).mode & 0o777).toBe(0o600);
      }
    });

    test("rejects relative, missing, and outside pane directories before creating uploads", async () => {
      const paths = await fixture();
      await expect(
        write("relative", input, paths.projects, paths.uploads),
      ).rejects.toThrow("Herdr pane did not report an absolute directory");
      await expect(
        write(
          join(paths.root, "missing"),
          input,
          paths.projects,
          paths.uploads,
        ),
      ).rejects.toMatchObject({ code: "ENOENT" });
      await expect(
        write(paths.outside, input, paths.projects, paths.uploads),
      ).rejects.toThrow(
        "Pane directory is outside the Docker-mounted HERDR_PROJECTS_ROOT",
      );
      const escapingLink = join(paths.projects, "escape");
      await symlink(paths.outside, escapingLink, "junction");
      await expect(
        write(escapingLink, input, paths.projects, paths.uploads),
      ).rejects.toThrow("outside the Docker-mounted");
      await expect(stat(paths.uploads)).rejects.toMatchObject({
        code: "ENOENT",
      });
    });

    test("checks the project root before the upload root and allows the root itself", async () => {
      const paths = await fixture();
      await expect(
        write(paths.cwd, input, join(paths.root, "missing"), "relative"),
      ).rejects.toMatchObject({ code: "ENOENT" });
      await expect(
        write(paths.cwd, input, paths.projects, "relative"),
      ).rejects.toThrow("herdr-web upload directory must be absolute");
      const uploaded = await write(
        paths.projects,
        input,
        paths.projects,
        paths.uploads,
      );
      expect(await readFile(uploaded.path)).toEqual(input.data);
    });

    test("validates contents before directory resolution or Herdr lookup", async () => {
      const request = vi.fn();
      const service = new LiveHerdrService({
        request,
      } as unknown as HerdrClient);
      const invalid = { ...input, data: Buffer.alloc(0) };
      await expect(write("relative", invalid)).rejects.toThrow(
        "must not be empty",
      );
      await expect(
        name === "file"
          ? service.uploadFile("p1", invalid)
          : service.uploadImage("p1", invalid),
      ).rejects.toThrow("must not be empty");
      expect(request).not.toHaveBeenCalled();
    });
  });
}
