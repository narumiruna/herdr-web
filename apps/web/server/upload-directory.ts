import { mkdir, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative, sep } from "node:path";

export async function paneUploadDirectory(
  cwd: string,
  projectsRoot?: string,
  uploadsRoot = join(homedir(), ".herdr-web", "uploads"),
): Promise<string> {
  if (!isAbsolute(cwd)) {
    throw new TypeError("Herdr pane did not report an absolute directory");
  }
  const projectDirectory = await realpath(cwd);
  if (projectsRoot) {
    const allowedRoot = await realpath(projectsRoot);
    const path = relative(allowedRoot, projectDirectory);
    const contained =
      path === "" ||
      (!isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`));
    if (!contained) {
      throw new TypeError(
        "Pane directory is outside the Docker-mounted HERDR_PROJECTS_ROOT",
      );
    }
  }
  if (!isAbsolute(uploadsRoot)) {
    throw new TypeError("herdr-web upload directory must be absolute");
  }
  await mkdir(uploadsRoot, { mode: 0o700, recursive: true });
  return realpath(uploadsRoot);
}
