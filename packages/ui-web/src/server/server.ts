import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { createDefaultDaemon } from "@wuweiweave/core";
import type { DaemonManager } from "@wuweiweave/core";
import { handleApiRequest } from "./api-router";
import { handleSseRequest } from "./sse";

export interface WebServerOptions {
  daemon?: DaemonManager;
  host?: string;
  port?: number;
  publicDir?: string;
}

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export async function startWebServer(options: WebServerOptions = {}): Promise<ReturnType<typeof Bun.serve>> {
  const daemon = options.daemon ?? (await createDefaultDaemon());
  const config = await daemon.config.getConfig();
  const publicDir = options.publicDir ?? path.join(packageRoot, "dist", "public");
  const host = options.host ?? config.host.webHost;
  const port = options.port ?? config.host.webPort;

  const server = Bun.serve({
    hostname: host,
    port,
    async fetch(request) {
      const url = new URL(request.url);

      if (url.pathname.startsWith("/api/")) {
        const sse = handleSseRequest(request, daemon);
        if (sse) {
          return sse;
        }

        return handleApiRequest(request, daemon);
      }

      return serveStatic(publicDir, url.pathname);
    }
  });

  console.log(`WuWeiWeave web control plane running at http://${server.hostname}:${server.port}`);
  console.log(`Workspace: ${daemon.store.root}`);
  return server;
}

async function serveStatic(publicDir: string, pathname: string): Promise<Response> {
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const target = path.resolve(publicDir, relative);
  const normalizedPublic = path.resolve(publicDir);
  if (target !== normalizedPublic && !target.startsWith(`${normalizedPublic}${path.sep}`)) {
    return new Response("Forbidden", { status: 403 });
  }

  const file = Bun.file(target);
  if (await file.exists()) {
    return new Response(file, {
      headers: {
        "Content-Type": contentType(target)
      }
    });
  }

  const index = Bun.file(path.join(publicDir, "index.html"));
  if (await index.exists()) {
    return new Response(index, {
      headers: {
        "Content-Type": "text/html; charset=utf-8"
      }
    });
  }

  return new Response("Web assets are missing. Run `bun run --cwd packages/ui-web build` first.", {
    status: 503,
    headers: {
      "Content-Type": "text/plain; charset=utf-8"
    }
  });
}

function contentType(filePath: string): string {
  const ext = path.extname(filePath);
  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

if (import.meta.main) {
  await startWebServer();
}
