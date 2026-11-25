import { notAllowed, serveMcp } from "@/lib/mcp-http";

/** For assistants that only accept a plain connector address: the key is the last part of the address. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  return serveMcp(req, (await params).token, false);
}
export const GET = notAllowed;
export const DELETE = notAllowed;
