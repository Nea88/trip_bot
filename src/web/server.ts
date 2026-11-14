import http from "node:http";
import type { Api } from "grammy";
import { handleWeb } from "./handler.js";
import { peerAllowed } from "./peer.js";

const MAX_BODY = 16 * 1024;

/** The add-on's panel in the Home Assistant sidebar (Ingress). */
export function startWebServer(api: Api, port: number): http.Server {
  return http
    .createServer(async (req, res) => {
      if (!peerAllowed(req.socket.remoteAddress)) {
        res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Панель открывается только из Home Assistant.");
        return;
      }
      try {
        let body = "";
        for await (const chunk of req) {
          body += chunk;
          if (body.length > MAX_BODY) {
            res.writeHead(413);
            res.end();
            return;
          }
        }
        const response = await handleWeb(api, { method: req.method ?? "GET", url: req.url ?? "/", headers: req.headers, body });
        res.writeHead(response.status, response.headers);
        res.end(response.body);
      } catch (err) {
        console.error("[web] Request failed:", err);
        if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Что-то пошло не так, подробности в логе аддона.");
      }
    })
    .listen(port, () => {
      console.log(`[web] Home Assistant panel listening on port ${port}`);
    });
}
