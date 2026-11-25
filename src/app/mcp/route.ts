import { notAllowed, serveMcp } from "@/lib/mcp-http";

/** The preferred way in: the connector key travels in an Authorization header, never in the address. */
export async function POST(req: Request) {
  const m = (req.headers.get("authorization") || "").match(/^Bearer\s+(\S+)$/i);
  return serveMcp(req, m ? m[1] : null, true);
}
export const GET = notAllowed;
export const DELETE = notAllowed;
