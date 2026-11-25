import crypto from "node:crypto";
import { getSetting, q, q1, run } from "./db";
import { hashToken } from "./auth";
import { logActivity } from "./activity";
import { parseAnswer } from "./docfill";
import { notify } from "./notify";
import { listHolders } from "./rounds";

/**
 * A small MCP server, so a founder can connect the AI assistant they already
 * use (Claude, ChatGPT, Grok…) to their room. It is deliberately narrow: the
 * assistant can read what is in the room and can SUGGEST changes. Suggestions
 * wait for the founder to review them in the app; nothing an assistant sends
 * goes live on its own.
 *
 * Speaks the 2026-07-28 revision (no handshake, version on every request) and
 * the earlier 2025 revisions (initialize handshake), over Streamable HTTP with
 * plain JSON responses and no sessions.
 */

export const MODERN = "2026-07-28";
const LEGACY = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
export const SUPPORTED = [MODERN, ...LEGACY];
const META_VERSION = "io.modelcontextprotocol/protocolVersion";
const SERVER = { name: "pretty-good-dataroom", title: "Data room", version: "1.0.0" };

export type McpUser = { id: number; name: string; tokenId: number; label: string; canRead: boolean; firstUse: boolean };

/** How long a new connector lasts, in days. Short by default: setup is a one-off job. */
export const CONNECTOR_DAYS = [1, 7, 30, 90];

/** Who a connector key belongs to, or null. Only founders and team may connect an assistant. */
export function userForToken(token: string): McpUser | null {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const row = q1<{ id: number; name: string; token_id: number; label: string; can_read: number; last_used_at: string | null }>(
    `SELECT u.id, u.name, t.id AS token_id, t.label, t.can_read, t.last_used_at FROM mcp_tokens t JOIN users u ON u.id = t.user_id
      WHERE t.token_hash = ? AND t.revoked = 0 AND t.expires_at > datetime('now') AND u.disabled = 0 AND u.role IN ('founder','team')`,
    hashToken(token),
  );
  if (!row) return null;
  run("UPDATE mcp_tokens SET last_used_at = datetime('now') WHERE id = ?", row.token_id);
  return { id: row.id, name: row.name, tokenId: row.token_id, label: row.label, canRead: !!row.can_read, firstUse: !row.last_used_at };
}

/** The first time a connector is used, its owner is told, so a key used by someone else does not go unnoticed. */
export function noteFirstUse(user: McpUser, ip: string) {
  logActivity({ id: user.id, orgId: null }, "connector.first_use", undefined, undefined, `${user.label} from ${ip}`);
  void notify([user.id], {
    category: "reminders",
    title: `Your ${user.label} connector was just used for the first time`,
    body: "If that was you connecting your assistant, all is well. If you were not expecting it, turn the connector off now.",
    href: "/fill",
    cta: "See your connectors",
    mail: { transactional: true },
  }).catch(() => {});
}

export function newConnectorToken(): string {
  return crypto.randomBytes(36).toString("base64url");
}

const instructions = (canRead: boolean) =>
  `This is the investor data room for ${getSetting("company_name")}. Use it to help the founder fill the room from documents they share with you (pitch deck, formation documents, stock agreements, signed SAFEs). ` +
  (canRead ? "Call get_room first to see what is already there. Then call" : "Call") +
  ` propose_changes with only what the documents actually say: never guess or fill gaps, use plain numbers for amounts and share counts, and list anything missing, unsigned or contradictory under "unsure". ` +
  (canRead ? "" : "This connection can send suggestions but cannot read the room; the data room itself flags anything that is already there, so send everything the documents support. ") +
  `Your proposal is a suggestion. The founder reviews and applies it inside the data room; tell them to open "From your documents" there when you are done.`;

const nullable = (type: string, description: string) => ({ type: [type, "null"], description });
const PROPOSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    company: {
      type: ["object", "null"],
      description: "Company profile, mostly from the pitch deck. Omit or null if the documents do not cover it.",
      properties: {
        one_liner: nullable("string", "Who it is for and what it does, under 15 words, plain English, not a slogan."),
        overview_markdown: nullable("string", "250-400 words for an investor. Only these headings, each on its own line: '## The problem', '## What we do', '## Why now', '## Traction', '## Team', '## The ask'. Plain paragraphs, '- ' lists, '**bold**' for an occasional key number. Leave out sections the documents do not support."),
        stage: nullable("string", "For example Pre-seed."),
        founded: nullable("string", "Year or date of incorporation."),
        location: nullable("string", "City and state or country."),
        website: nullable("string", "https:// address."),
      },
    },
    team: {
      type: "array",
      description: "Founders and team shown in the deck.",
      items: { type: "object", required: ["name"], properties: { name: { type: "string" }, title: nullable("string", "Role."), bio: nullable("string", "Two or three sentences."), link: nullable("string", "LinkedIn or personal https:// address, if shown.") } },
    },
    holders: {
      type: "array",
      description: "Issued shares and the reserved option pool only, from formation documents, stock purchase agreements or a cap table. Do NOT list SAFE investors here.",
      items: {
        type: "object",
        required: ["name", "shares"],
        properties: { name: { type: "string", description: "Person or entity; 'Option pool' for unissued reserved shares." }, kind: { type: "string", enum: ["founder", "employee", "advisor", "investor", "pool"] }, share_class: nullable("string", "For example Common."), shares: { type: "number", description: "Whole number of shares." } },
      },
    },
    round: {
      type: ["object", "null"],
      description: "The raise the pitch deck asks for. Null if the documents do not describe one.",
      properties: {
        name: nullable("string", "For example Pre-seed."),
        instrument: { type: "string", enum: ["safe", "priced"] },
        target_amount: { type: "number", description: "US dollars, plain number." },
        valuation_cap: nullable("number", "US dollars."),
        discount_percent: nullable("number", "20 for 20%."),
        pre_money: nullable("number", "US dollars, priced rounds only."),
        min_check: nullable("number", "US dollars."),
        use_of_funds: nullable("string", "One or two sentences on what the money achieves."),
      },
    },
    safes: {
      type: "array",
      description: "One entry per signed SAFE document.",
      items: {
        type: "object",
        required: ["investor", "amount"],
        properties: { investor: { type: "string" }, amount: { type: "number", description: "US dollars." }, valuation_cap: nullable("number", "US dollars."), discount_percent: nullable("number", "20 for 20%."), type: { type: "string", enum: ["post", "pre"], description: "post-money or pre-money SAFE." }, mfn: { type: "boolean" }, signed_on: nullable("string", "YYYY-MM-DD."), status: { type: "string", enum: ["signed", "wired"] } },
      },
    },
    unsure: { type: "array", items: { type: "string" }, description: "Anything missing, unclear, unsigned or contradictory that the founder should check." },
  },
} as const;

const TOOLS = [
  {
    name: "get_room",
    title: "See what is in the data room",
    description: "Returns the company profile, team, cap table, rounds and SAFEs currently in the data room, and what is still missing. Call this first so you do not propose things that are already there.",
    inputSchema: { type: "object", additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "propose_changes",
    title: "Suggest details for the data room",
    description:
      "Saves a set of suggested details, taken from documents the founder shared with you, for the founder to review inside the data room. Nothing becomes visible to investors until the founder applies it there. Use only facts stated in the documents; never guess. Include only the sections you have evidence for.",
    inputSchema: PROPOSE_SCHEMA,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
];

function roomSnapshot() {
  const company = {
    name: getSetting("company_name"),
    one_liner: getSetting("tagline") || null,
    overview_markdown: getSetting("overview_md") || null,
    stage: getSetting("fact_stage") || null,
    founded: getSetting("fact_founded") || null,
    location: getSetting("fact_location") || null,
    website: getSetting("fact_website") || null,
  };
  const team = q<{ name: string; title: string | null }>("SELECT name, title FROM team_members ORDER BY position, id");
  const holders = listHolders().map((h) => ({ name: h.name, kind: h.kind, share_class: h.share_class, shares: h.shares, ...(h.left ? { left_on: h.end_date } : {}) }));
  const rounds = q("SELECT name, instrument, status, target_amount, valuation_cap, discount, min_check FROM rounds ORDER BY id");
  const safes = q("SELECT investor_name AS investor, amount, valuation_cap, discount, kind AS type, status, signed_on FROM safes ORDER BY id");
  const missing = [
    !company.one_liner && "one-line description",
    !company.overview_markdown && "overview",
    !team.length && "team",
    !holders.length && "cap table",
    !rounds.length && "a round",
  ].filter(Boolean);
  return { company, team, holders, rounds, safes, missing };
}

function callTool(user: McpUser, name: string, args: unknown): { content: { type: "text"; text: string }[]; isError?: boolean; structuredContent?: unknown } | null {
  const text = (t: string, isError = false) => ({ content: [{ type: "text" as const, text: t }], ...(isError ? { isError: true } : {}) });
  if (name === "get_room") {
    if (!user.canRead) return text("This connection can only send suggestions; the founder has not allowed it to read the room. Send what the documents say with propose_changes. The data room flags anything already there.", true);
    const snapshot = roomSnapshot();
    return { content: [{ type: "text", text: JSON.stringify(snapshot, null, 2) }], structuredContent: snapshot };
  }
  if (name === "propose_changes") {
    const answer = parseAnswer(JSON.stringify(args ?? {}));
    if (!answer) return text("Nothing usable was provided. Include at least one of: company, team, holders, round (with target_amount), safes (each with investor and amount).", true);
    const pending = q1<{ n: number }>("SELECT COUNT(*) AS n FROM proposals WHERE user_id = ? AND status = 'pending'", user.id)?.n ?? 0;
    if (pending >= 10) return text("There are already 10 suggestions waiting for the founder. Ask them to review or dismiss those in the data room first.", true);
    run("INSERT INTO proposals (user_id, source, payload) VALUES (?, 'assistant', ?)", user.id, JSON.stringify(answer));
    logActivity({ id: user.id, orgId: null }, "proposal.create", undefined, undefined, "from a connected AI assistant");
    const counts = [answer.company && "company profile", answer.team.length && `${answer.team.length} team`, answer.holders.length && `${answer.holders.length} shareholders`, answer.round && "a round", answer.safes.length && `${answer.safes.length} SAFEs`].filter(Boolean).join(", ");
    return text(`Saved as a suggestion (${counts}). Nothing is live yet. Tell the founder to open the data room, go to The room → From your documents, and review it: ${(process.env.APP_URL || "").replace(/\/$/, "")}/fill`);
  }
  return null;
}

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
export type McpReply = { status: number; body?: unknown };

const rpcError = (id: Rpc["id"], code: number, message: string, data?: unknown) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message, ...(data ? { data } : {}) } });

/** Header values may be Base64-wrapped as =?base64?…?= when they contain non-ASCII characters. */
const decodeHeader = (v: string) => {
  const m = v.match(/^=\?base64\?(.*)\?=$/i);
  return m ? Buffer.from(m[1], "base64").toString("utf8") : v;
};

/** Handles one JSON-RPC message. `headers` are lower-cased. */
export function handleMessage(user: McpUser, msg: Rpc, headers: Record<string, string | undefined>): McpReply {
  if (!msg || typeof msg !== "object" || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return { status: 400, body: rpcError(msg?.id, -32600, "Invalid request") };
  const isNotification = msg.id === undefined;
  const meta = (msg.params?._meta ?? {}) as Record<string, unknown>;
  const metaVersion = typeof meta[META_VERSION] === "string" ? (meta[META_VERSION] as string) : undefined;
  const headerVersion = headers["mcp-protocol-version"];
  if (metaVersion && headerVersion && metaVersion !== headerVersion) return { status: 400, body: rpcError(msg.id, -32020, "MCP-Protocol-Version header does not match the request") };

  // The older handshake: negotiate a version and describe the server.
  if (msg.method === "initialize") {
    const asked = typeof msg.params?.protocolVersion === "string" ? (msg.params.protocolVersion as string) : "";
    const version = LEGACY.includes(asked) ? asked : LEGACY[0];
    return { status: 200, body: { jsonrpc: "2.0", id: msg.id, result: { protocolVersion: version, capabilities: { tools: {} }, serverInfo: SERVER, instructions: instructions(user.canRead) } } };
  }

  const version = headerVersion ?? metaVersion ?? "2025-03-26";
  if (!SUPPORTED.includes(version)) return { status: 400, body: rpcError(msg.id, -32022, "Unsupported protocol version", { supported: SUPPORTED, requested: version }) };
  const modern = version === MODERN;
  if (modern) {
    // The newest revision repeats the method (and tool name) in headers so proxies can route on them; they must agree with the body.
    if (!headerVersion || !metaVersion) return { status: 400, body: rpcError(msg.id, -32020, "MCP-Protocol-Version is required in both the header and the request") };
    const method = headers["mcp-method"];
    if (!method || decodeHeader(method) !== msg.method) return { status: 400, body: rpcError(msg.id, -32020, "Mcp-Method header is missing or does not match the request") };
    if (msg.method === "tools/call") {
      const name = headers["mcp-name"];
      if (!name || decodeHeader(name) !== msg.params?.name) return { status: 400, body: rpcError(msg.id, -32020, "Mcp-Name header is missing or does not match the request") };
    }
  }
  if (isNotification) return { status: 202 };
  const ok = (result: Record<string, unknown>): McpReply => ({ status: 200, body: { jsonrpc: "2.0", id: msg.id, result: modern ? { resultType: "complete", ...result } : result } });

  switch (msg.method) {
    case "server/discover":
      return ok({ supportedVersions: SUPPORTED, capabilities: { tools: {} }, instructions: instructions(user.canRead), _meta: { "io.modelcontextprotocol/serverInfo": SERVER } });
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: user.canRead ? TOOLS : TOOLS.filter((t) => t.name !== "get_room") });
    case "tools/call": {
      const name = typeof msg.params?.name === "string" ? msg.params.name : "";
      const result = callTool(user, name, msg.params?.arguments);
      if (!result) return { status: modern ? 400 : 200, body: rpcError(msg.id, -32602, `Unknown tool: ${name.slice(0, 80)}`) };
      return ok(result);
    }
    default:
      return { status: modern ? 404 : 200, body: rpcError(msg.id, -32601, "Method not found") };
  }
}
