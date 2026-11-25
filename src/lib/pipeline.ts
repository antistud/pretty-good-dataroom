import { q, q1 } from "./db";
import { visibleDocuments, visibleFolders } from "./docs";
import { parseDate } from "./format";

export type StageKey = "lead" | "contacted" | "interested" | "meeting" | "diligence" | "committed" | "signed" | "wired" | "passed";

export type Stage = {
  key: StageKey;
  label: string;
  /** Plain instruction for the founder: what to do while a lead sits in this stage. */
  todo: string;
  /** Label of the one primary button. */
  action: string;
  /** Access this stage implies: 0 none, 1 lowest tier, 2 middle tier, 3 highest tier. */
  tierRank: 0 | 1 | 2 | 3;
};

export const STAGES: Stage[] = [
  { key: "lead", label: "Lead", tierRank: 0, action: "Mark as contacted",
    todo: "You have not reached out yet. Send a short, personal note (or ask for a warm intro) with one line on what you do and why them. Then mark them as contacted." },
  { key: "contacted", label: "Contacted", tierRank: 0, action: "They're interested: invite to the room",
    todo: "You reached out and are waiting to hear back. Follow up once after about five days. As soon as they show interest, invite them: they get teaser access (deck and overview) and a guided welcome page." },
  { key: "interested", label: "Interested", tierRank: 1, action: "Log the meeting",
    todo: "They are in the room with teaser access. Get a first call on the calendar. When you have met, log the meeting with a line on how it went." },
  { key: "meeting", label: "Meeting", tierRank: 1, action: "Open diligence",
    todo: "You have met. If they want to dig in, open diligence: this unlocks the cap table, financials and company documents for their whole firm. If they went quiet, set a follow-up date." },
  { key: "diligence", label: "Diligence", tierRank: 2, action: "Record commitment",
    todo: "They are reviewing the room. Answer their requests fast and watch the tracker below for what they have and have not opened. When they say yes, record the amount." },
  { key: "committed", label: "Committed", tierRank: 3, action: "Mark SAFE signed",
    todo: "They said yes. Send the SAFE for signature using your usual e-signature tool, then upload the signed copy to the Closing folder and mark it signed here." },
  { key: "signed", label: "Signed", tierRank: 3, action: "Confirm wire received",
    todo: "The paperwork is signed. Send wire instructions and check your bank. Confirm here once the money has landed." },
  { key: "wired", label: "Wired", tierRank: 3, action: "Done",
    todo: "Money is in. Nothing more to do for this investor: they now receive your monthly investor updates. Say thank you." },
  { key: "passed", label: "Passed", tierRank: 0, action: "Decide what happens to their access",
    todo: "They passed for now. Decide whether to keep them close as a supporter (updates only) or remove their access." },
];

export const ACTIVE_STAGES: StageKey[] = ["lead", "contacted", "interested", "meeting", "diligence", "committed", "signed"];

export function stageOf(key: string): Stage {
  return STAGES.find((s) => s.key === key) ?? STAGES[0];
}
export function isStage(key: string): key is StageKey {
  return STAGES.some((s) => s.key === key);
}

/** Maps "lowest / middle / highest" to whatever tier levels this room actually has. */
export function tierLevelForRank(rank: 0 | 1 | 2 | 3): number {
  if (rank === 0) return 0;
  const tiers = q<{ level: number }>("SELECT level FROM tiers ORDER BY level");
  if (!tiers.length) return 1;
  if (rank === 1) return tiers[0].level;
  if (rank === 3) return tiers[tiers.length - 1].level;
  return tiers[Math.floor((tiers.length - 1) / 2)].level;
}

export type Lead = {
  id: number;
  round_id: number | null;
  org_id: number | null;
  org_name: string;
  contact_name: string | null;
  contact_email: string | null;
  stage: StageKey;
  check_size: number | null;
  source: string | null;
  next_action: string | null;
  next_action_due: string | null;
  passed_reason: string | null;
  created_at: string;
  updated_at: string;
};

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
export function daysSince(s: string | null | undefined): number | null {
  if (!s) return null;
  return Math.floor((Date.now() - parseDate(s).getTime()) / 86400_000);
}

export type Engagement = {
  members: number;
  pendingInvites: number;
  oldestPendingInviteDays: number | null;
  lastSeen: string | null;
  docsViewed: number;
  docViews: number;
  downloads: number;
  viewedDeck: boolean;
  captableViews: number;
  financialsViews: number;
  roundViews: number;
  updateViews: number;
  openRequests: number;
};

/** What a firm has actually done in the room, from the activity log. */
export function engagement(orgId: number): Engagement {
  const count = (sql: string, ...p: unknown[]) => q1<{ n: number }>(sql, ...p)?.n ?? 0;
  const section = (name: string) => count("SELECT COUNT(*) AS n FROM activity WHERE org_id = ? AND action = 'section.view' AND detail = ?", orgId, name);
  const invite = q1<{ n: number; oldest: string | null }>(
    "SELECT COUNT(*) AS n, MIN(created_at) AS oldest FROM invites WHERE org_id = ? AND accepted_at IS NULL AND revoked = 0 AND expires_at > ?",
    orgId,
    new Date().toISOString(),
  );
  return {
    members: count("SELECT COUNT(*) AS n FROM users WHERE org_id = ? AND disabled = 0", orgId),
    pendingInvites: invite?.n ?? 0,
    oldestPendingInviteDays: daysSince(invite?.oldest),
    lastSeen: q1<{ t: string | null }>("SELECT MAX(created_at) AS t FROM activity WHERE org_id = ?", orgId)?.t ?? null,
    docsViewed: count("SELECT COUNT(DISTINCT target_id) AS n FROM activity WHERE org_id = ? AND action = 'doc.view'", orgId),
    docViews: count("SELECT COUNT(*) AS n FROM activity WHERE org_id = ? AND action = 'doc.view'", orgId),
    downloads: count("SELECT COUNT(*) AS n FROM activity WHERE org_id = ? AND action = 'doc.download'", orgId),
    viewedDeck:
      count(
        `SELECT COUNT(*) AS n FROM activity a JOIN documents d ON d.id = a.target_id JOIN folders f ON f.id = d.folder_id
          WHERE a.org_id = ? AND a.action = 'doc.view' AND (f.name LIKE 'Pitch%' OR d.name LIKE '%deck%')`,
        orgId,
      ) > 0,
    captableViews: section("captable"),
    financialsViews: section("financials"),
    roundViews: section("round"),
    updateViews: count("SELECT COUNT(*) AS n FROM activity WHERE org_id = ? AND action = 'update.view'", orgId),
    openRequests: count("SELECT COUNT(*) AS n FROM requests WHERE org_id = ? AND status IN ('open','in_progress')", orgId),
  };
}

export type Suggestion = { text: string; href: string; urgent?: boolean };

/** Follow-up nudges for one lead, most pressing first. */
const lowerFirst = (t: string) => (t ? t[0].toLowerCase() + t.slice(1) : t);

/** "yesterday", "on Friday", "on 30 Nov": dates the way a person says them. */
export function humanDay(day: string | null | undefined): string {
  if (!day) return "";
  const [y, m, d] = day.slice(0, 10).split("-").map(Number);
  const then = Date.UTC(y, m - 1, d);
  const [ty, tm, td] = today().split("-").map(Number);
  const diff = Math.round((then - Date.UTC(ty, tm - 1, td)) / 86400_000);
  if (diff === 0) return "today";
  if (diff === -1) return "yesterday";
  if (diff === 1) return "tomorrow";
  const date = new Date(then);
  if (diff > 1 && diff < 7) return "on " + date.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  if (diff < -1 && diff > -7) return "last " + date.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  return "on " + date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function suggestions(lead: Lead): Suggestion[] {
  const out: Suggestion[] = [];
  const href = `/pipeline/${lead.id}`;
  if (lead.stage === "wired") return out;
  if (lead.stage === "passed") return out;
  const who = lead.org_name;

  if (lead.next_action_due && lead.next_action_due < today()) {
    out.push({ text: `${who}: you meant to ${lowerFirst(lead.next_action || "follow up")} ${humanDay(lead.next_action_due)}. Still worth doing today.`, href, urgent: true });
  } else if (lead.next_action_due === today()) {
    out.push({ text: `${who}: ${lowerFirst(lead.next_action || "follow up")}. You set this for today.`, href, urgent: true });
  }

  const lastNote = q1<{ t: string | null }>("SELECT MAX(created_at) AS t FROM lead_notes WHERE lead_id = ?", lead.id)?.t ?? null;
  const lastTouch = [lastNote, lead.updated_at].filter(Boolean).sort().pop() as string;
  const quietDays = daysSince(lastTouch) ?? 0;

  if (lead.org_id) {
    const e = engagement(lead.org_id);
    if (e.openRequests > 0) out.push({ text: `${who} has ${e.openRequests} open request${e.openRequests === 1 ? "" : "s"} waiting on you.`, href: "/requests", urgent: true });
    if (e.members === 0 && e.pendingInvites > 0 && (e.oldestPendingInviteDays ?? 0) >= 5) {
      out.push({ text: `${who} was invited ${e.oldestPendingInviteDays} days ago and hasn't signed in. Nudge them, or re-send the link.`, href });
    }
    if (e.financialsViews >= 2 && quietDays >= 5) {
      out.push({ text: `${who} viewed financials ${e.financialsViews} times, and you haven't logged contact in ${quietDays} days. Good moment to follow up.`, href });
    } else if (e.captableViews >= 2 && quietDays >= 5) {
      out.push({ text: `${who} viewed the cap table ${e.captableViews} times, and you haven't logged contact in ${quietDays} days.`, href });
    }
    const idle = daysSince(e.lastSeen);
    if (lead.stage === "diligence" && e.members > 0 && idle != null && idle >= 7) {
      out.push({ text: `${who} is in diligence but hasn't opened the room in ${idle} days. Ask if anything is missing.`, href });
    }
    if ((lead.stage === "interested" || lead.stage === "meeting") && e.members > 0 && !e.viewedDeck && quietDays >= 3) {
      out.push({ text: `${who} joined but hasn't opened the deck yet.`, href });
    }
  } else if (lead.stage === "interested" || lead.stage === "meeting" || lead.stage === "diligence") {
    out.push({ text: `${who} ${lead.stage === "diligence" ? "is in diligence" : lead.stage === "meeting" ? "has met you" : "is interested"} but cannot get into the room yet. Send them an invitation.`, href });
  }

  if (lead.stage === "committed" && quietDays >= 7) out.push({ text: `${who} committed ${quietDays} days ago and the SAFE is not marked signed. Chase the signature.`, href, urgent: true });
  if (lead.stage === "signed" && quietDays >= 5) out.push({ text: `${who} signed ${quietDays} days ago. Check whether the wire has arrived.`, href, urgent: true });
  if (lead.stage === "contacted" && quietDays >= 5 && !lead.next_action_due) out.push({ text: `No reply from ${who} in ${quietDays} days. Send one follow-up.`, href });
  if (!lead.next_action && !lead.next_action_due && out.length === 0 && quietDays >= 10) {
    out.push({ text: `${who} has had no activity for ${quietDays} days and no next action. Set one, or mark them as passed.`, href });
  }
  return out;
}

export type DiligenceDoc = { id: number; name: string; viewedAt: string | null; views: number };
export type DiligenceFolder = { id: number; name: string; docs: DiligenceDoc[] };
export type DiligenceRequest = { id: number; kind: string; title: string; status: string; created_at: string };

/** For one firm: every document they are allowed to see, whether they opened it, and their requests. */
export function diligence(orgId: number): { level: number; folders: DiligenceFolder[]; viewed: number; total: number; requests: DiligenceRequest[] } {
  const org = q1<{ kind: string; tier: number }>("SELECT kind, tier FROM orgs WHERE id = ?", orgId);
  const level = !org || org.kind === "supporter" ? 0 : Math.max(1, org.tier);
  const views = new Map<number, { t: string; n: number }>();
  for (const r of q<{ target_id: number; t: string; n: number }>(
    "SELECT target_id, MAX(created_at) AS t, COUNT(*) AS n FROM activity WHERE org_id = ? AND action IN ('doc.view','doc.download') AND target_id IS NOT NULL GROUP BY target_id",
    orgId,
  )) {
    views.set(r.target_id, { t: r.t, n: r.n });
  }
  const docs = visibleDocuments(level);
  const folders: DiligenceFolder[] = visibleFolders(level)
    .map((f) => ({
      id: f.id,
      name: f.name,
      docs: docs
        .filter((d) => d.folder_id === f.id)
        .map((d) => ({ id: d.id, name: d.name, viewedAt: views.get(d.id)?.t ?? null, views: views.get(d.id)?.n ?? 0 })),
    }));
  const requests = q<DiligenceRequest>("SELECT id, kind, title, status, created_at FROM requests WHERE org_id = ? ORDER BY created_at DESC", orgId);
  return { level, folders, viewed: docs.filter((d) => views.has(d.id)).length, total: docs.length, requests };
}

export type ActivityLine = { id: number; who: string; org: string | null; what: string; created_at: string };

const SECTION_NAMES: Record<string, string> = {
  overview: "the overview", team: "the team page", round: "the round terms", captable: "the cap table",
  financials: "the financials", documents: "the document list", intros: "Set Me Up",
};

function describe(action: string, detail: string | null, docName: string | null): string {
  switch (action) {
    case "login": return "signed in";
    case "invite.accept": return "accepted their invitation";
    case "nda.accept": return "accepted the confidentiality terms";
    case "doc.view": return `viewed ${docName ?? "a document"}`;
    case "doc.download": return `downloaded ${docName ?? "a document"}`;
    case "section.view": return `looked at ${SECTION_NAMES[detail ?? ""] ?? detail ?? "a section"}`;
    case "update.view": return "read an investor update";
    case "page.view": return `read a page${detail ? ` (${detail})` : ""}`;
    case "invite.create": return `invited a colleague${detail ? ` (${detail.split(" ")[0]})` : ""}`;
    case "request.create": return `asked: ${(detail ?? "").replace(/^[a-z]+: /, "")}`;
    case "request.reply": return "replied on a request";
    case "proposal.create": return `sent suggestions for the room (${detail ?? ""})`;
    case "proposal.apply": return `applied suggestions: ${detail ?? ""}`;
    case "lead.import": return `imported ${detail ?? "contacts"} into the pipeline`;
    case "export.csv": return `downloaded the ${detail ?? "data"} as a spreadsheet`;
    case "export.zip": return `downloaded all documents (${detail ?? "zip"})`;
    case "intro.offer": return `offered an introduction to ${detail ?? "someone"}`;
    default: return action.replace(/[._]/g, " ") + (detail ? `: ${detail}` : "");
  }
}

/** Recent things investors and supporters did, in plain words. Pass an org to limit to one firm. */
export function recentExternalActivity(limit = 10, orgId?: number): ActivityLine[] {
  const rows = q<{ id: number; who: string | null; org: string | null; action: string; detail: string | null; doc: string | null; created_at: string }>(
    `SELECT a.id, u.name AS who, o.name AS org, a.action, a.detail, d.name AS doc, a.created_at
       FROM activity a JOIN users u ON u.id = a.user_id LEFT JOIN orgs o ON o.id = a.org_id
       LEFT JOIN documents d ON a.target_type = 'document' AND d.id = a.target_id
      WHERE u.role IN ('investor','supporter') ${orgId ? "AND a.org_id = ?" : ""}
      ORDER BY a.id DESC LIMIT ?`,
    ...(orgId ? [orgId, limit] : [limit]),
  );
  return rows.map((r) => ({ id: r.id, who: r.who ?? "Someone", org: r.org, what: describe(r.action, r.detail, r.doc), created_at: r.created_at }));
}
