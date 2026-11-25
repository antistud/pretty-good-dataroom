#!/usr/bin/env node
// Issues a one-time sign-in code for a user directly on the server.
// For when email is broken and a founder needs to get in:
//   docker compose exec dataroom node scripts/login-code.js you@example.com
// (or: /opt/dataroom/install.sh code you@example.com)
// Anyone who can run this already controls the server and its data.
const crypto = require("node:crypto");
const path = require("node:path");
const Database = require("better-sqlite3");

const email = (process.argv[2] || "").trim().toLowerCase();
if (!email) {
  console.error("Usage: node scripts/login-code.js you@example.com");
  process.exit(2);
}
const db = new Database(path.join(process.env.DATA_DIR || path.join(process.cwd(), "data"), "dataroom.sqlite"), { timeout: 10000 });
const user = db.prepare("SELECT id, name, disabled FROM users WHERE email = ? COLLATE NOCASE").get(email);
if (!user) {
  console.error(`Nobody with the email ${email} has access.`);
  process.exit(1);
}
if (user.disabled) {
  console.error(`${email} has had their access removed.`);
  process.exit(1);
}
const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
// Must match hashCode() in src/lib/auth.ts.
const hash = crypto.createHash("sha256").update(`${user.id}:${code}`).digest("hex");
// Issuing a code on the server also lifts any pause caused by wrong guesses.
db.prepare("DELETE FROM login_failures WHERE user_id = ?").run(user.id);
db.prepare("DELETE FROM login_codes WHERE user_id = ?").run(user.id);
db.prepare("INSERT INTO login_codes (user_id, code_hash, expires_at) VALUES (?,?,?)").run(user.id, hash, new Date(Date.now() + 10 * 60000).toISOString());
db.prepare("INSERT INTO activity (user_id, action, detail) VALUES (?, 'login.code_from_server', ?)").run(user.id, "issued on the server");
console.log(`Sign-in code for ${user.name} <${email}>: ${code}`);
console.log("Use it on the \"Check your email\" screen. If you have not got that far yet: enter the email on the sign-in page and press");
console.log("\"Email me a code\" first, then run this command again, because asking for a code replaces any earlier one.");
console.log("It works once and expires in ten minutes.");
