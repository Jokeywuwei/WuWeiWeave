import { mkdir, readdir, rename, rm } from "node:fs/promises";
import * as path from "node:path";
import { createWorkspacePaths, toStoragePath } from "../utils/paths";
import type { WorkspacePaths } from "../utils/paths";

export class FileStore {
  readonly root: string;
  readonly paths: WorkspacePaths;

  constructor(root?: string) {
    this.paths = createWorkspacePaths(root);
    this.root = this.paths.root;
  }

  async ensureWorkspace(): Promise<void> {
    await Promise.all([
      mkdir(this.paths.config, { recursive: true }),
      mkdir(this.paths.challenges, { recursive: true }),
      mkdir(this.paths.solvers, { recursive: true }),
      mkdir(this.paths.archiveSolvers, { recursive: true }),
      mkdir(this.paths.runtime, { recursive: true }),
      mkdir(this.paths.prompts, { recursive: true }),
      mkdir(this.paths.skills, { recursive: true }),
      mkdir(this.paths.logs, { recursive: true })
    ]);
  }

  resolve(relativePath: string): string {
    return toStoragePath(this.root, relativePath);
  }

  async exists(relativePath: string): Promise<boolean> {
    return Bun.file(this.resolve(relativePath)).exists();
  }

  async readText(relativePath: string, fallback = ""): Promise<string> {
    const file = Bun.file(this.resolve(relativePath));
    if (!(await file.exists())) {
      return fallback;
    }

    return file.text();
  }

  async writeText(relativePath: string, content: string): Promise<void> {
    const target = this.resolve(relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await Bun.write(target, content);
  }

  async appendText(relativePath: string, content: string): Promise<void> {
    const current = await this.readText(relativePath);
    await this.writeText(relativePath, `${current}${content}`);
  }

  async readJson<T>(relativePath: string, fallback: T): Promise<T> {
    const file = Bun.file(this.resolve(relativePath));
    if (!(await file.exists())) {
      return fallback;
    }

    return JSON.parse(await file.text()) as T;
  }

  async writeJson<T>(relativePath: string, value: T): Promise<void> {
    await this.writeText(relativePath, `${JSON.stringify(value, null, 2)}\n`);
  }

  async listJson<T>(relativeDirectory: string): Promise<T[]> {
    const directory = this.resolve(relativeDirectory);
    await mkdir(directory, { recursive: true });
    const names = await readdir(directory);
    const values: T[] = [];

    for (const name of names.filter((item) => item.endsWith(".json")).sort()) {
      const value = await this.readJson<T | undefined>(path.join(relativeDirectory, name), undefined);
      if (value !== undefined) {
        values.push(value);
      }
    }

    return values;
  }

  async move(relativeFrom: string, relativeTo: string): Promise<void> {
    const from = this.resolve(relativeFrom);
    const to = this.resolve(relativeTo);
    await mkdir(path.dirname(to), { recursive: true });
    await rename(from, to);
  }

  async remove(relativePath: string): Promise<void> {
    await rm(this.resolve(relativePath), { recursive: true, force: true });
  }
}
