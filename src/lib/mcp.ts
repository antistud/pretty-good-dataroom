import crypto from "node:crypto";
import { getSetting, q, q1, run } from "./db";
import { hashToken } from "./auth";
import { logActivity } from "./activity";
import { parseAnswer } from "./docfill";
import { notify } from "./notify";
import { listHolders } from "./rounds";
import { cleanHints, fileKey } from "./filing";
import { tally } from "./docfill-apply";

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
  ` propose_changes with only what the documents actually say: never guess or fill gaps, use plain numbers for amounts and share counts and YYYY-MM-DD for dates, and list anything missing, unsigned or contradictory under "unsure". It can correct existing entries as well as add new ones: send the name and only the fields that change. Read its reply; it names any value it could not read so you can send it again. ` +
  (canRead ? "" : "This connection can send suggestions but cannot read the room; the data room itself flags anything that is already there, so send everything the documents support. ") +
  `Your proposal is a suggestion. The founder reviews and applies it inside the data room; tell them to open "From your documents" there when you are done. ` +
  `Then call file_documents with every file they shared, so that when they upload the files to the room each one is named and filed correctly. You cannot upload files yourself.`;

const nullable = (type: string, description: string) => ({ type: [type, "null"], description });
const DATE = "A date as YYYY-MM-DD.";
const PROPOSE_SCHEMA = {
  type: "object",
  properties: {
    company: {
      type: ["object", "null"],
      description: "Company profile, mostly from the pitch deck. Include only the fields you want to set or change.",
      properties: {
        name: nullable("string", "The company's name."),
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
      description: "People on the team page. Someone already there (same name) is updated with the fields you give.",
      items: { type: "object", required: ["name"], properties: { name: { type: "string" }, title: nullable("string", "Role."), bio: nullable("string", "Two or three sentences."), link: nullable("string", "LinkedIn or personal https:// address, if shown.") } },
    },
    holders: {
      type: "array",
      description:
        "Shareholders and the reserved option pool, from formation documents, stock purchase agreements or a cap table. Do NOT list SAFE investors here. A holder already on the cap table (same name) is updated: send only the name and the fields that change, for example a leaving date. A new holder needs 'shares'.",
      items: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", description: "Person or entity; 'Option pool' for unissued reserved shares." },
          kind: { type: "string", enum: ["founder", "employee", "advisor", "investor", "pool"] },
          share_class: nullable("string", "For example Common."),
          shares: nullable("number", "Whole number of shares ORIGINALLY granted or bought. Never the vested or kept number: the room works that out from the dates, or takes it from shares_kept."),
          start_date: nullable("string", `When they started and vesting began. ${DATE}`),
          vest_months: nullable("number", "Length of the vesting schedule in months, for example 48. Omit if the shares do not vest."),
          cliff_months: nullable("number", "Months before anything vests, for example 12."),
          end_date: nullable("string", `The day they left the company, if they have. ${DATE} The room then counts only the shares vested by that day.`),
          notes: nullable("string", "A short note, for example 'Acceleration on change of control'."),
          shares_kept: nullable("number", "Only for someone who has left, and only when the separation or repurchase paperwork states the number they kept. It overrides the vesting schedule. Keep 'shares' as the ORIGINAL grant; never put the kept number there."),
          clear: { type: "array", items: { type: "string", enum: ["start_date", "end_date", "vest_months", "cliff_months", "shares_kept", "notes"] }, description: "Fields to empty on an existing holder. Sending null does not clear a field; listing it here does." },
        },
      },
    },
    round: {
      type: ["object", "null"],
      description: "The raise. A round with the same name is updated with the fields you give; a new one needs target_amount and is created in planning. You cannot open or close a round.",
      properties: {
        name: nullable("string", "For example Pre-seed."),
        instrument: { type: "string", enum: ["safe", "priced"] },
        target_amount: nullable("number", "US dollars, plain number."),
        valuation_cap: nullable("number", "US dollars."),
        discount_percent: nullable("number", "20 for 20%."),
        pre_money: nullable("number", "US dollars, priced rounds only."),
        min_check: nullable("number", "US dollars."),
        use_of_funds: nullable("string", "One or two sentences on what the money achieves."),
      },
    },
    safes: {
      type: "array",
      description: "One entry per SAFE. A SAFE already recorded for that investor is updated with the fields you give (include the amount if the investor has more than one). A new one needs 'amount'.",
      items: {
        type: "object",
        required: ["investor"],
        properties: {
          investor: { type: "string" },
          amount: nullable("number", "US dollars."),
          valuation_cap: nullable("number", "US dollars."),
          discount_percent: nullable("number", "20 for 20%."),
          type: { type: "string", enum: ["post", "pre"], description: "post-money or pre-money SAFE." },
          mfn: { type: "boolean", description: "True only if this SAFE has a most-favoured-nation clause. The room lets an MFN SAFE take better terms from SAFEs signed after it, so signing dates matter." },
          signed_on: nullable("string", `The date it was signed. ${DATE}`),
          status: { type: "string", enum: ["committed", "signed", "wired"] },
          clear: { type: "array", items: { type: "string", enum: ["valuation_cap", "discount_percent", "signed_on"] }, description: "Fields to empty on an existing SAFE, for example a cap entered by mistake on an uncapped SAFE." },
        },
      },
    },
    financials: {
      type: "array",
      description: "Monthly figures, one entry per month, only when a document gives them. An existing month is updated with the fields you give; a new month needs 'cash'.",
      items: {
        type: "object",
        required: ["month"],
        properties: { month: { type: "string", description: "YYYY-MM." }, revenue: nullable("number", "US dollars received that month."), expenses: nullable("number", "US dollars spent that month."), cash: nullable("number", "Bank balance on the last day of the month, US dollars."), notes: nullable("string", "Anything unusual about the month.") },
      },
    },
    unsure: { type: "array", items: { type: "string" }, description: "Anything missing, unclear, unsigned or contradictory that the founder should check." },
  },
} as const;

const TOOLS = [
  {
    name: "get_room",
    title: "See what is in the data room",
    description: "Returns everything propose_changes can set, as it stands now: company profile, team, cap table (with grant, vesting and leaving dates), rounds, SAFEs and monthly financials, plus what is still missing. Call this first so you only send what is new or different.",
    inputSchema: { type: "object", additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "propose_changes",
    title: "Suggest details for the data room",
    description:
      "Suggests additions AND corrections to the data room, for the founder to review there. Entries are matched by name: someone already on the cap table, a SAFE already recorded or a month already entered is UPDATED with just the fields you send, so to add a leaving date or fix a signing date, send the name and that one field. Nothing changes until the founder applies it. Use only facts from the documents or from what the founder told you; never guess. Dates are YYYY-MM-DD, amounts plain numbers. The reply says what was understood and lists any value that could not be read.",
    inputSchema: PROPOSE_SCHEMA,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "file_documents",
    title: "Say how each document should be filed",
    description:
      "You cannot upload files to the data room; the founder does that. This tells the room what each file is, so that when the founder uploads it, it is named, described and put in the right folder automatically. Call it once with every document the founder shared with you. Use the exact file names.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["documents"],
      properties: {
        documents: {
          type: "array",
          items: {
            type: "object",
            required: ["filename"],
            properties: {
              filename: { type: "string", description: "The file's name exactly as the founder shared it, with its extension." },
              title: nullable("string", "A clear name for the room, for example 'Signed SAFE - Oak Ventures' or 'Certificate of incorporation'."),
              folder: nullable("string", "Which folder it belongs in. See the folder list in this tool's description."),
              description: nullable("string", "One line on what it is and why it matters. Mention if it is unsigned or a draft."),
              safe_investor: nullable("string", "Only for a signed SAFE: the investor's name, so the file can be attached to that SAFE on the cap table."),
            },
          },
        },
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
];

/** The tools on offer to a connector. Folder names are added so the assistant can pick a real one; they are not confidential. */
function toolsFor(user: McpUser) {
  const folders = q<{ name: string }>("SELECT name FROM folders WHERE parent_id IS NULL ORDER BY position, id").map((f) => f.name.slice(0, 60)).slice(0, 30);
  return TOOLS.filter((t) => user.canRead || t.name !== "get_room").map((t) => (t.name === "file_documents" ? { ...t, description: `${t.description} Folders: ${folders.join("; ")}.` } : t));
}

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
  const team = q<{ name: string; title: string | null; bio: string | null; link: string | null }>("SELECT name, title, bio, link FROM team_members ORDER BY position, id");
  // "shares" is what counts today; "shares_granted" is the original grant, which is what propose_changes takes.
  const holders = listHolders().map((h) => ({
    name: h.name, kind: h.kind, share_class: h.share_class, shares: h.shares, shares_granted: h.granted,
    start_date: h.start_date, vest_months: h.vest_months, cliff_months: h.cliff_months, end_date: h.end_date, shares_kept: h.kept_shares, shares_vested: h.vested, notes: h.notes,
  }));
  const rounds = q<Record<string, unknown>>("SELECT name, instrument, status, target_amount, valuation_cap, discount, pre_money, min_check, opened_at, closed_at FROM rounds ORDER BY id")
    .map(({ discount, ...r }) => ({ ...r, discount_percent: typeof discount === "number" ? +(discount * 100).toFixed(4) : null }));
  const safes = q<Record<string, unknown>>("SELECT investor_name AS investor, amount, valuation_cap, discount, kind AS type, mfn, status, signed_on, document_id FROM safes ORDER BY id")
    .map(({ discount, mfn, document_id, ...x }) => ({ ...x, discount_percent: typeof discount === "number" ? +(discount * 100).toFixed(4) : null, mfn: !!mfn, signed_copy_uploaded: document_id != null }));
  const financials = q("SELECT month, revenue, expenses, cash, notes FROM financials ORDER BY month");
  const missing = [
    !company.one_liner && "one-line description",
    !company.overview_markdown && "overview",
    !team.length && "team",
    !holders.length && "cap table",
    !rounds.length && "a round",
  ].filter(Boolean);
  return { company, team, holders, rounds, safes, financials, missing };
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
    if (!answer) return text("Nothing usable was provided. Include at least one of: company, team, holders, round, safes, financials. Dates are YYYY-MM-DD and amounts are plain numbers.", true);
    const pending = q1<{ n: number }>("SELECT COUNT(*) AS n FROM proposals WHERE user_id = ? AND status = 'pending'", user.id)?.n ?? 0;
    if (pending >= 10) return text("There are already 10 suggestions waiting for the founder. Ask them to review or dismiss those in the data room first.", true);
    run("INSERT INTO proposals (user_id, source, payload) VALUES (?, 'assistant', ?)", user.id, JSON.stringify(answer));
    logActivity({ id: user.id, orgId: null }, "proposal.create", undefined, undefined, "from a connected AI assistant");
    const t = tally(answer);
    const made = [t.new && `${t.new} new`, t.update && `${t.update} update${t.update === 1 ? "" : "s"} to existing entries`, t.same && `${t.same} already up to date`, t.invalid && `${t.invalid} that cannot be applied as sent`].filter(Boolean).join(", ");
    const trouble = answer.ignored.length ? ` These values could not be read and were left out; send them again in the right form: ${answer.ignored.join(" ")}` : "";
    return text(`Saved as a suggestion: ${made}. Nothing is live yet. Tell the founder to open the data room, go to The room → From your documents, and review it: ${(process.env.APP_URL || "").replace(/\/$/, "")}/fill.${trouble}`);
  }
  if (name === "file_documents") {
    const hints = cleanHints(args);
    if (hints.length === 0) return text("Nothing usable was provided. Send { documents: [{ filename, title, folder, description }] } with the exact file names.", true);
    // A newer note about the same file replaces the older one; notes are capped so a runaway assistant cannot fill the table.
    const pending = q<{ id: number; filename: string }>("SELECT id, filename FROM doc_hints WHERE user_id = ? AND used = 0", user.id);
    for (const h of hints) for (const old of pending) if (fileKey(old.filename) === fileKey(h.filename)) run("DELETE FROM doc_hints WHERE id = ?", old.id);
    const room = 100 - (q1<{ n: number }>("SELECT COUNT(*) AS n FROM doc_hints WHERE user_id = ? AND used = 0", user.id)?.n ?? 0);
    if (room <= 0) return text("There are already 100 filing notes waiting. Ask the founder to upload those files, or discard the notes, in the data room first.", true);
    for (const h of hints.slice(0, room)) run("INSERT INTO doc_hints (user_id, filename, title, folder, description, safe_investor) VALUES (?,?,?,?,?,?)", user.id, h.filename, h.title, h.folder, h.description, h.safe_investor);
    logActivity({ id: user.id, orgId: null }, "documents.filing_notes", undefined, undefined, `${Math.min(hints.length, room)} from a connected AI assistant`);
    return text(`Noted for ${Math.min(hints.length, room)} file${hints.length === 1 ? "" : "s"}. The files themselves are not in the room yet. Tell the founder to open Documents in the data room and drop those same files into the box at the top; each one will be named and filed as you described: ${(process.env.APP_URL || "").replace(/\/$/, "")}/documents`);
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
      return ok({ tools: toolsFor(user) });
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
