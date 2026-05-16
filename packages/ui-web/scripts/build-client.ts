import { mkdir } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import autoprefixer from "autoprefixer";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import type { AcceptedPlugin } from "postcss";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distPublic = path.join(packageRoot, "dist", "public");

await mkdir(distPublic, { recursive: true });

const result = await Bun.build({
  entrypoints: [path.join(packageRoot, "src", "client", "main.tsx")],
  outdir: distPublic,
  target: "browser",
  format: "esm",
  sourcemap: "external",
  naming: {
    entry: "assets/app.js",
    chunk: "assets/[name]-[hash].js",
    asset: "assets/[name]-[hash].[ext]"
  }
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(log.message);
  }
  process.exit(1);
}

await mkdir(path.join(distPublic, "assets"), { recursive: true });
await Bun.write(
  path.join(distPublic, "index.html"),
  await Bun.file(path.join(packageRoot, "public", "index.html")).text()
);

const cssInput = path.join(packageRoot, "src", "client", "styles.css");
const cssOutput = path.join(distPublic, "assets", "styles.css");
const createTailwindPlugin = tailwindcss as unknown as (options: { config: string }) => AcceptedPlugin;
const createAutoprefixerPlugin = autoprefixer as unknown as () => AcceptedPlugin;
const processedCss = await postcss([
  createTailwindPlugin({ config: path.join(packageRoot, "tailwind.config.js") }),
  createAutoprefixerPlugin()
]).process(await Bun.file(cssInput).text(), {
  from: cssInput,
  to: cssOutput
});

await Bun.write(cssOutput, processedCss.css);
