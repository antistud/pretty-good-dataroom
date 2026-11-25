import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

-- Access levels. 0 = supporters, 1..3 = investor tiers, 100 = founders/team only.
CREATE TABLE IF NOT EXISTS tiers (
  level INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  can_download INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orgs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('investor','supporter')),
  tier INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  title TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('founder','team','investor','supporter')),
  org_id INTEGER REFERENCES orgs(id) ON DELETE SET NULL,
  totp_secret TEXT,
  totp_enabled INTEGER NOT NULL DEFAULT 0,
  nda_accepted_at TEXT,
  email_opt_out INTEGER NOT NULL DEFAULT 0,
  disabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  twofa_pending INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL COLLATE NOCASE,
  name TEXT,
  role TEXT NOT NULL CHECK (role IN ('founder','team','investor','supporter')),
  org_id INTEGER REFERENCES orgs(id) ON DELETE CASCADE,
  invited_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  revoked INTEGER NOT NULL DEFAULT 0,
  last_nudged_at TEXT
);

CREATE TABLE IF NOT EXISTS password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  min_level INTEGER NOT NULL DEFAULT 3,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  folder_id INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  min_level INTEGER NOT NULL DEFAULT 3,
  current_version_id INTEGER,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS document_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  storage_key TEXT NOT NULL,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Viewer activity and admin audit log in one append-only table.
CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  org_id INTEGER,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id INTEGER,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS activity_org ON activity(org_id, created_at);
CREATE INDEX IF NOT EXISTS activity_user ON activity(user_id, created_at);

CREATE TABLE IF NOT EXISTS rounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  instrument TEXT NOT NULL DEFAULT 'safe' CHECK (instrument IN ('safe','priced')),
  status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning','open','closing','closed')),
  target_amount REAL NOT NULL DEFAULT 0,
  valuation_cap REAL,
  discount REAL,
  pre_money REAL,
  new_pool_pct REAL,
  min_check REAL,
  terms_md TEXT,
  min_level INTEGER NOT NULL DEFAULT 1,
  opened_at TEXT,
  closed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS holders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('founder','employee','advisor','investor','pool')),
  share_class TEXT NOT NULL DEFAULT 'Common',
  shares REAL NOT NULL DEFAULT 0,
  notes TEXT,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS safes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id INTEGER REFERENCES rounds(id) ON DELETE SET NULL,
  org_id INTEGER REFERENCES orgs(id) ON DELETE SET NULL,
  investor_name TEXT NOT NULL,
  amount REAL NOT NULL,
  kind TEXT NOT NULL DEFAULT 'post' CHECK (kind IN ('post','pre')),
  valuation_cap REAL,
  discount REAL,
  mfn INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'signed' CHECK (status IN ('committed','signed','wired')),
  signed_on TEXT,
  document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS financials (
  month TEXT PRIMARY KEY,
  revenue REAL NOT NULL DEFAULT 0,
  expenses REAL NOT NULL DEFAULT 0,
  cash REAL NOT NULL DEFAULT 0,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS team_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  title TEXT,
  bio TEXT,
  link TEXT,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  body_md TEXT NOT NULL DEFAULT '',
  min_level INTEGER NOT NULL DEFAULT 3,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  published_at TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS update_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  update_id INTEGER NOT NULL REFERENCES updates(id) ON DELETE CASCADE,
  heading TEXT NOT NULL,
  body_md TEXT NOT NULL DEFAULT '',
  min_level INTEGER NOT NULL DEFAULT 3,
  position INTEGER NOT NULL DEFAULT 0
);

-- De-duplicates scheduled emails: one row per thing already sent.
CREATE TABLE IF NOT EXISTS sent_log (key TEXT PRIMARY KEY, sent_at TEXT NOT NULL DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER REFERENCES orgs(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('question','document','data','call')),
  title TEXT NOT NULL,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','fulfilled','declined')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS request_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS intro_asks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  detail TEXT,
  blurb TEXT,
  min_level INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS intro_offers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ask_id INTEGER REFERENCES intro_asks(id) ON DELETE SET NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  contact_name TEXT NOT NULL,
  contact_detail TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'offered' CHECK (status IN ('offered','intro_made','met','closed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Founder-only CRM. A lead has no login until it is invited (org_id set).
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id INTEGER REFERENCES rounds(id) ON DELETE SET NULL,
  org_id INTEGER REFERENCES orgs(id) ON DELETE SET NULL,
  org_name TEXT NOT NULL,
  contact_name TEXT,
  contact_email TEXT,
  stage TEXT NOT NULL DEFAULT 'lead',
  check_size REAL,
  source TEXT,
  next_action TEXT,
  next_action_due TEXT,
  passed_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lead_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Manually ticked checklist items (onboarding steps, founder checklists).
CREATE TABLE IF NOT EXISTS checks (
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  done_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (scope, key)
);
`;

const DEFAULT_FOLDERS: [string, string, number][] = [
  ["Pitch", "Deck, one-pager and demo. Start here.", 1],
  ["Company & org docs", "Certificate of incorporation, bylaws, board consents, EIN letter.", 2],
  ["Cap table & SAFEs", "Signed SAFEs, stock purchase agreements, 83(b) elections.", 2],
  ["Financials", "Model, bank statements, budget.", 2],
  ["Product & traction", "Roadmap, metrics, customer evidence, pilots and LOIs.", 2],
  ["Team", "Founder agreements, offer letters, advisor agreements.", 3],
  ["IP & legal", "IP assignments, trademarks, material contracts, policies.", 3],
  ["Closing", "Round documents, wire instructions, signature pages.", 3],
];

declare global {
  // eslint-disable-next-line no-var
  var __pgd_db: Database.Database | undefined;
}

function open(): Database.Database {
  fs.mkdirSync(path.join(DATA_DIR, "files"), { recursive: true });
  const d = new Database(path.join(DATA_DIR, "dataroom.sqlite"), { timeout: 10_000 });
  // Several processes can open a brand-new database at once (the build does), so wait for locks instead of failing.
  d.pragma("busy_timeout = 10000");
  d.pragma("journal_mode = WAL");
  d.pragma("foreign_keys = ON");
  d.exec(SCHEMA);
  d.transaction(() => {
    if (d.prepare("SELECT 1 FROM tiers").get()) return;
    const t = d.prepare("INSERT INTO tiers (level, name, can_download) VALUES (?,?,?)");
    t.run(1, "Teaser", 0);
    t.run(2, "Diligence", 0);
    t.run(3, "Closing", 1);
    const f = d.prepare("INSERT INTO folders (name, description, min_level, position) VALUES (?,?,?,?)");
    DEFAULT_FOLDERS.forEach(([n, desc, lvl], i) => f.run(n, desc, lvl, i));
  }).immediate();
  return d;
}

export const db: Database.Database = globalThis.__pgd_db ?? (globalThis.__pgd_db = open());

export function q<T = any>(sql: string, ...params: unknown[]): T[] {
  return db.prepare(sql).all(...params) as T[];
}
export function q1<T = any>(sql: string, ...params: unknown[]): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}
export function run(sql: string, ...params: unknown[]) {
  return db.prepare(sql).run(...params);
}

const SETTING_DEFAULTS: Record<string, string> = {
  company_name: "Your Company",
  tagline: "",
  overview_md: "",
  update_due_day: "5",
  nda_enabled: "0",
  nda_text:
    "By continuing you agree to keep all information in this data room confidential and to use it only to evaluate an investment in the company.",
  // Minimum access level for each built-in section. 999 switches a section off.
  level_overview: "0",
  level_team: "0",
  level_updates: "0",
  level_intros: "0",
  level_round: "1",
  level_documents: "1",
  level_requests: "1",
  level_captable: "2",
  level_financials: "2",
};

export function getSetting(key: string): string {
  const row = q1<{ value: string }>("SELECT value FROM settings WHERE key = ?", key);
  return row?.value ?? SETTING_DEFAULTS[key] ?? "";
}
export function setSetting(key: string, value: string) {
  run("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, value);
}
export function isSetUp(): boolean {
  return !!q1("SELECT 1 FROM users WHERE role = 'founder' LIMIT 1");
}
