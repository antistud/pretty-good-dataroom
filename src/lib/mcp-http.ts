import { clientIp, rateLimited } from "./auth";
import { handleMessage, noteFirstUse, userForToken } from "./mcp";
import { mailEnabled } from "./mail";

const json = (status: number, body?: unknown, extra: Record<string, string> = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer", ...extra },
  });
const fail = (status: number, code: number, message: string, extra: Record<string, string> = {}) => json(status, { jsonrpc: "2.0", id: null, error: { code, message } }, extra);

/**
 * One MCP request. The connector key arrives either in an Authorization
 * header (POST /mcp, preferred: the key stays out of addresses and logs) or
 * as the last part of the address (POST /mcp/<key>, for assistants that only
 * accept a plain connector URL).
 */
export async function serveMcp(req: Request, token: string | null, viaHeader: boolean): Promise<Response> {
  // Assistants call from their own servers and send no Origin. A browser page on another site would, and is refused.
  const origin = req.headers.get("origin");
  if (origin) {
    let own = "";
    try {
      own = new URL(process.env.APP_URL || "http://localhost:3000").origin;
    } catch {
      /* no usable APP_URL: treat every origin as foreign */
    }
    if (origin !== own) return fail(403, -32600, "Origin not allowed");
  }
  // The room is closed to everyone while it cannot send email (see lib/auth), connectors included.
  if (!mailEnabled()) return fail(503, -32000, "This data room is not available: email is not set up on the server.");
  const ip = await clientIp();
  const challenge: Record<string, string> = viaHeader ? { "WWW-Authenticate": 'Bearer realm="data room connector"' } : {};
  const refuse = () => {
    // Wrong keys are counted per caller, so nobody can try keys quickly, however unlikely a hit is.
    if (rateLimited(`mcp-bad:${ip}`, 20)) return fail(429, -32000, "Too many requests. Try again in a few minutes.");
    return fail(401, -32001, "This connector key is not valid. It may have expired or been turned off. Ask the founder for a new one.", challenge);
  };
  if (!token) return refuse();
  if (rateLimited(`mcp:${token.slice(0, 12)}`, 240)) return fail(429, -32000, "Too many requests. Try again in a few minutes.");
  const user = userForToken(token);
  if (!user) return refuse();
  if (user.firstUse) noteFirstUse(user, ip);

  const raw = await req.text();
  if (raw.length > 300_000) return fail(413, -32600, "Request too large");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail(400, -32700, "Parse error");
  }
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));

  // Batches were allowed in the earliest Streamable HTTP revision.
  if (Array.isArray(body)) {
    const replies = body.slice(0, 20).map((m) => handleMessage(user, m, headers)).filter((r) => r.body !== undefined);
    return replies.length ? json(200, replies.map((r) => r.body)) : json(202);
  }
  const reply = handleMessage(user, body as never, headers);
  return json(reply.status, reply.body);
}

// No server-to-client stream and no sessions, so there is nothing to GET or DELETE.
export const notAllowed = () => json(405, { jsonrpc: "2.0", id: null, error: { code: -32000, message: "Method not allowed. POST JSON-RPC messages to this address." } }, { Allow: "POST" });
