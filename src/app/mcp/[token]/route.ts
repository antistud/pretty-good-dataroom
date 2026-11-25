import { rateLimited } from "@/lib/auth";
import { handleMessage, userForToken } from "@/lib/mcp";
import { mailEnabled } from "@/lib/mail";

const json = (status: number, body?: unknown, extra: Record<string, string> = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), "Cache-Control": "no-store", "X-Robots-Tag": "noindex", ...extra },
  });
const fail = (status: number, code: number, message: string) => json(status, { jsonrpc: "2.0", id: null, error: { code, message } });

/**
 * The MCP endpoint a founder's AI assistant connects to. The long random
 * token in the address is the credential, so it works with assistants that
 * only accept a plain connector URL.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
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
  const { token } = await params;
  if (rateLimited(`mcp:${token.slice(0, 12)}`, 240)) return fail(429, -32000, "Too many requests. Try again in a few minutes.");
  const user = userForToken(token);
  if (!user) return fail(401, -32001, "This connector link is not valid. It may have been turned off. Ask the founder for a new one.");

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
const notAllowed = () => json(405, { jsonrpc: "2.0", id: null, error: { code: -32000, message: "Method not allowed. POST JSON-RPC messages to this address." } }, { Allow: "POST" });
export const GET = notAllowed;
export const DELETE = notAllowed;
