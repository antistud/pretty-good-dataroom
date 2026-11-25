#!/usr/bin/env node
// Server-side help for someone who cannot sign in. Run on the server:
//
//   /opt/dataroom/install.sh unlock    you@example.com   lift a 24-hour pause caused by wrong sign-in codes
//   /opt/dataroom/install.sh code      you@example.com   issue a sign-in code when email is not arriving
//   /opt/dataroom/install.sh reset-2fa you@example.com   turn off the authenticator-app step for a lost phone
//
// (Directly: docker compose exec dataroom node scripts/account.js <command> <email>)
// Anyone who can run this already controls the server and everything on it.
const crypto = require("node:crypto");
const path = require("node:path");
const Database = require("better-sqlite3");

const [command, rawEmail] = process.argv.slice(2);
const email = (rawEmail || "").trim().toLowerCase();
const COMMANDS = ["unlock", "code", "reset-2fa"];
if (!COMMANDS.includes(command) || !email) {
  console.error("Usage: node scripts/account.js <unlock|code|reset-2fa> you@example.com");
  process.exit(2);
}
const db = new Database(path.join(process.env.DATA_DIR || path.join(process.cwd(), "data"), "dataroom.sqlite"), { timeout: 10000 });
const user = db.prepare("SELECT id, name, disabled, totp_enabled FROM users WHERE email = ? COLLATE NOCASE").get(email);
if (!user) {
  console.error(`Nobody with the email ${email} has access.`);
  process.exit(1);
}
if (user.disabled) {
  console.error(`${email} has had their access removed. Restore it under People → Access first.`);
  process.exit(1);
}
const record = (action) => db.prepare("INSERT INTO activity (user_id, action, detail) VALUES (?, ?, 'done on the server')").run(user.id, action);
const cleared = db.prepare("DELETE FROM login_failures WHERE user_id = ?").run(user.id).changes;

if (command === "unlock") {
  record("login.unlocked_on_server");
  console.log(cleared ? `Sign-in for ${user.name} <${email}> is no longer paused. They can ask for a code again now.` : `Sign-in for ${email} was not paused. Nothing needed changing.`);
} else if (command === "reset-2fa") {
  db.prepare("UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE id = ?").run(user.id);
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
  record("account.2fa_reset_on_server");
  console.log(user.totp_enabled ? `The authenticator-app step is off for ${user.name} <${email}>, and they are signed out everywhere.` : `${email} did not have the authenticator-app step turned on.`);
  console.log("They sign in with an emailed code as usual, and should set the authenticator step up again under Account.");
} else {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  // Must match hashCode() in src/lib/auth.ts.
  const hash = crypto.createHash("sha256").update(`${user.id}:${code}`).digest("hex");
  db.prepare("DELETE FROM login_codes WHERE user_id = ?").run(user.id);
  db.prepare("INSERT INTO login_codes (user_id, code_hash, expires_at) VALUES (?,?,?)").run(user.id, hash, new Date(Date.now() + 10 * 60000).toISOString());
  record("login.code_from_server");
  console.log(`Sign-in code for ${user.name} <${email}>: ${code}`);
  console.log('Use it on the "Check your email" screen. If you have not got that far yet: enter the email on the sign-in page and press');
  console.log('"Email me a code" first, then run this command again, because asking for a code replaces any earlier one.');
  console.log("It works once and expires in ten minutes.");
}
