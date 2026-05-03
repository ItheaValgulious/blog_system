import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";

export interface RunningAdminHost {
  close(): Promise<void>;
  port: number;
  server: HttpServer;
}

interface StartAdminHostOptions {
  adminDistDir: string;
  port: number;
  targetBaseUrl: string;
}

const MIME_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".webp": "image/webp"
};

function isProxiedPath(pathname: string) {
  return ["/api/", "/content-files/", "/media/", "/theme-files/"].some((prefix) => pathname.startsWith(prefix));
}

function isStaticAdminAsset(pathname: string) {
  return pathname === "/favicon.svg" || pathname.startsWith("/assets/") || pathname.startsWith("/quiver/");
}

function getContentType(filePath: string) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

function ensureInsideDirectory(rootDir: string, targetPath: string) {
  const normalizedRoot = path.resolve(rootDir);
  const normalizedTarget = path.resolve(targetPath);

  return (
    normalizedTarget === normalizedRoot ||
    normalizedTarget.startsWith(`${normalizedRoot}${path.sep}`)
  );
}

async function readRequestBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  return Buffer.concat(chunks);
}

function rewriteSetCookieHeader(rawCookie: string) {
  let cookie = rawCookie
    .replace(/;\s*domain=[^;]+/gi, "")
    .replace(/;\s*secure/gi, "")
    .replace(/;\s*samesite=none/gi, "; SameSite=Lax");

  if (!/;\s*path=/i.test(cookie)) {
    cookie = `${cookie}; Path=/`;
  }

  return cookie;
}

function writeJson(response: ServerResponse, statusCode: number, payload: unknown) {
  const body = Buffer.from(JSON.stringify(payload));
  response.writeHead(statusCode, {
    "Content-Length": String(body.byteLength),
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(body);
}

async function serveFile(response: ServerResponse, filePath: string) {
  const content = await fs.readFile(filePath);
  response.writeHead(200, {
    "Content-Length": String(content.byteLength),
    "Content-Type": getContentType(filePath)
  });
  response.end(content);
}

async function proxyRequest(
  request: IncomingMessage,
  response: ServerResponse,
  targetBaseUrl: string
) {
  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
  const upstreamBaseUrl = new URL(targetBaseUrl.endsWith("/") ? targetBaseUrl : `${targetBaseUrl}/`);
  const upstreamUrl = new URL(
    `${requestUrl.pathname.replace(/^\/+/, "")}${requestUrl.search}`,
    upstreamBaseUrl
  );
  const requestBody =
    request.method === "GET" || request.method === "HEAD" ? undefined : await readRequestBody(request);
  const requestHeaders = new Headers();

  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined || ["connection", "content-length", "host"].includes(key.toLowerCase())) {
      continue;
    }

    requestHeaders.set(key, Array.isArray(value) ? value.join(key.toLowerCase() === "cookie" ? "; " : ", ") : value);
  }

  const upstreamResponse = await fetch(upstreamUrl, {
    body: requestBody && requestBody.byteLength > 0 ? requestBody : undefined,
    headers: requestHeaders,
    method: request.method
  });
  const responseBody = Buffer.from(await upstreamResponse.arrayBuffer());

  response.statusCode = upstreamResponse.status;
  response.statusMessage = upstreamResponse.statusText;

  for (const [key, value] of upstreamResponse.headers.entries()) {
    if (["content-length", "set-cookie", "transfer-encoding"].includes(key.toLowerCase())) {
      continue;
    }

    response.setHeader(key, value);
  }

  const setCookieAccessor = upstreamResponse.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const setCookies =
    typeof setCookieAccessor.getSetCookie === "function"
      ? setCookieAccessor.getSetCookie().map(rewriteSetCookieHeader)
      : [];

  if (setCookies.length > 0) {
    response.setHeader("Set-Cookie", setCookies);
  }

  response.setHeader("Content-Length", String(responseBody.byteLength));
  response.end(responseBody);
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: StartAdminHostOptions
) {
  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
  const { pathname } = requestUrl;

  if (pathname === "/desktop/health") {
    writeJson(response, 200, { ok: true });
    return;
  }

  if (pathname === "/") {
    response.writeHead(302, { Location: "/admin/" });
    response.end();
    return;
  }

  if (pathname === "/admin") {
    response.writeHead(302, { Location: "/admin/" });
    response.end();
    return;
  }

  if (isProxiedPath(pathname)) {
    await proxyRequest(request, response, options.targetBaseUrl);
    return;
  }

  if (isStaticAdminAsset(pathname)) {
    const relativePath = pathname.slice(1);
    const filePath = path.join(options.adminDistDir, relativePath);

    if (!ensureInsideDirectory(options.adminDistDir, filePath)) {
      writeJson(response, 403, { error: "Forbidden." });
      return;
    }

    try {
      await serveFile(response, filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        writeJson(response, 404, { error: "Not found." });
        return;
      }

      throw error;
    }
    return;
  }

  if (pathname === "/admin/" || pathname.startsWith("/admin/")) {
    await serveFile(response, path.join(options.adminDistDir, "index.html"));
    return;
  }

  writeJson(response, 404, { error: "Not found." });
}

export async function startAdminHostServer(
  options: StartAdminHostOptions
): Promise<RunningAdminHost> {
  const server = createServer((request, response) => {
    void handleRequest(request, response, options).catch((error) => {
      response.statusCode = 500;
      response.end(error instanceof Error ? error.message : "Unknown desktop host error.");
    });
  });

  await new Promise<void>((resolve, reject) => {
    const handleError = (error: Error) => {
      server.off("listening", handleListening);
      reject(error);
    };
    const handleListening = () => {
      server.off("error", handleError);
      resolve();
    };

    server.once("error", handleError);
    server.once("listening", handleListening);
    server.listen(options.port, "127.0.0.1");
  });

  return {
    close() {
      return new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },
    port: options.port,
    server
  };
}
