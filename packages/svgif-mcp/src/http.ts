/**
 * Loopback HTTP listener for `--http`.
 * One JSON-RPC message per POST to `/mcp`, one JSON response.
 * The bind address is checked before a socket is opened.
 * [[sot:svgif/agent-surface]]
 */

import { createServer, type Server } from "node:http";
import type { FileWriter } from "../../svgif-cli/src/index.ts";
import { assertLoopback, handleMessage, originAllowed } from "./index.ts";

const MAX_BODY = 8 * 1024 * 1024;

/** `handle` answers one message. Tests pass a failing one to reach the 500 response. */
export function listen(
  host: string,
  port: number,
  files?: FileWriter,
  handle: typeof handleMessage = handleMessage,
): Promise<Server> {
  assertLoopback(host);
  const server = createServer((request, response) => {
    const send = (status: number, body?: unknown): void => {
      response.writeHead(status, body === undefined ? {} : { "content-type": "application/json" });
      response.end(body === undefined ? undefined : JSON.stringify(body));
    };
    if (!originAllowed(request.headers.origin)) return send(403);
    if (request.url !== "/mcp") return send(404);
    if (request.method !== "POST") return send(405);
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        send(413);
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      let message: unknown;
      try {
        message = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        return send(400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "the body is not JSON" } });
      }
      handle(message, files).then(
        (result) => (result ? send(200, result) : send(202)),
        () => send(500),
      );
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve(server));
  });
}
