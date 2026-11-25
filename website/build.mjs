// Builds the project website into website/_site. No dependencies:
//   npm run site        (or: node website/build.mjs)
// Hosted on Cloudflare from wrangler.jsonc at the repository root.
// Documentation pages are the markdown files in docs/ plus SECURITY.md, so
// the website and the repository never say different things.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const OUT = path.join(HERE, "_site");
const REPO = "https://github.com/antistud/pretty-good-dataroom";
// Where the site is served from. "/" on its own domain; "/repository-name/" on a GitHub project page.
const BASE = (process.env.SITE_BASE || "/").replace(/\/?$/, "/");

/** The documentation, in reading order. */
const DOCS = [
  { group: "Start", slug: "getting-started", file: "docs/getting-started.md" },
  { group: "Start", slug: "digitalocean", file: "docs/digitalocean.md" },
  { group: "Start", slug: "other-clouds", file: "docs/other-clouds.md" },
  { group: "Start", slug: "email", file: "docs/email.md" },
  { group: "Use", slug: "ai-connector", file: "docs/ai-connector.md" },
  { group: "Use", slug: "using-the-room", file: "docs/using-the-room.md" },
  { group: "Run", slug: "running", file: "docs/running.md" },
  { group: "Run", slug: "locked-out", file: "docs/locked-out.md" },
  { group: "Run", slug: "security", file: "SECURITY.md" },
];
const SLUG_FOR = Object.fromEntries(DOCS.map((d) => [path.basename(d.file).toLowerCase(), d.slug]));

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slugify = (s) => s.toLowerCase().replace(/<[^>]+>/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Links between markdown files become links between pages; other repository files point at GitHub. */
function href(url) {
  if (/^(https?:|mailto:|#)/.test(url)) return url;
  const [file, hash] = url.split("#");
  const known = SLUG_FOR[path.basename(file).toLowerCase()];
  if (known) return `${known}.html${hash ? "#" + hash : ""}`;
  return `${REPO}/blob/main/${file.replace(/^(\.\.\/|\.\/)+/, "")}`;
}

function inline(text) {
  const code = [];
  let s = text.replace(/`([^`]+)`/g, (_, c) => `\u0000${code.push(`<code>${esc(c)}</code>`) - 1}\u0000`);
  s = esc(s)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
      const to = href(url.replace(/&amp;/g, "&"));
      return `<a href="${esc(to)}"${/^https?:/.test(to) ? ' rel="noopener"' : ""}>${label}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,;:]|$)/g, "$1<em>$2</em>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => code[Number(i)]);
}

/** A small markdown renderer: headings, paragraphs, lists (with nested blocks), code fences and tables. */
function blocks(lines, headings) {
  const out = [];
  let i = 0;
  const isItem = (l) => /^(\d+\.|[-*])\s+/.test(l);
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (/^```/.test(line)) {
      const body = [];
      for (i++; i < lines.length && !/^```/.test(lines[i]); i++) body.push(lines[i]);
      i++;
      out.push(`<pre><code>${esc(body.join("\n"))}</code></pre>`);
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const html = inline(h[2]);
      const id = slugify(html);
      if (level === 2 && headings) headings.push({ id, text: html.replace(/<[^>]+>/g, "") });
      out.push(level === 1 ? `<h1>${html}</h1>` : `<h${level} id="${id}">${html}</h${level}>`);
      i++;
      continue;
    }
    if (/^\|/.test(line) && /^\|[\s:|-]+\|\s*$/.test(lines[i + 1] || "")) {
      const cells = (l) => l.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((c) => inline(c.trim()));
      const head = cells(line);
      const rows = [];
      for (i += 2; i < lines.length && /^\|/.test(lines[i]); i++) rows.push(cells(lines[i]));
      out.push(`<div class="table-wrap"><table><thead><tr>${head.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }
    if (isItem(line)) {
      const ordered = /^\d+\./.test(line);
      const items = [];
      while (i < lines.length && isItem(lines[i]) && /^\d+\./.test(lines[i]) === ordered) {
        const own = [lines[i].replace(/^(\d+\.|[-*])\s+/, "")];
        for (i++; i < lines.length && (/^\s{2,}\S/.test(lines[i]) || (!lines[i].trim() && /^\s{2,}\S/.test(lines[i + 1] || ""))); i++) own.push(lines[i].replace(/^\s{2,3}/, ""));
        const html = blocks(own);
        items.push(`<li>${/^<p>[\s\S]*<\/p>$/.test(html) && html.indexOf("<p>", 1) < 0 ? html.slice(3, -4) : html}</li>`);
        while (i < lines.length && !lines[i].trim() && isItem(lines[i + 1] || "")) i++;
      }
      out.push(`<${ordered ? "ol" : "ul"}>${items.join("")}</${ordered ? "ol" : "ul"}>`);
      continue;
    }
    const para = [];
    for (; i < lines.length && lines[i].trim() && !/^(```|#{1,4}\s|\|)/.test(lines[i]) && !isItem(lines[i]); i++) para.push(lines[i].trim());
    out.push(`<p>${inline(para.join(" "))}</p>`);
  }
  return out.join("\n");
}

const NAV = (base, current) => `
<header class="top">
  <a class="brand" href="${base}index.html">Pretty Good Data Room</a>
  <nav>
    <a href="${base}docs/getting-started.html"${current === "docs" ? ' aria-current="page"' : ""}>Docs</a>
    <a href="${base}docs/security.html">Security</a>
    <a href="${REPO}" rel="noopener">GitHub</a>
  </nav>
</header>`;
const FOOT = (base) => `
<footer class="foot">
  <p>Pretty Good Data Room is open source under the MIT licence. It tracks and guides; it is not legal, tax or securities advice.</p>
  <p><a href="${base}docs/getting-started.html">Docs</a> · <a href="${base}docs/security.html">Security</a> · <a href="${REPO}" rel="noopener">GitHub</a> · <a href="${REPO}/issues" rel="noopener">Report a problem</a></p>
</footer>`;
const page = ({ base, title, description, body, current }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="${base}favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${base}site.css">
</head>
<body>
${NAV(base, current)}
${body}
${FOOT(base)}
<script src="${base}site.js" defer></script>
</body>
</html>
`;

// ---- build ----
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "docs"), { recursive: true });
fs.mkdirSync(path.join(OUT, "fonts"), { recursive: true });
fs.cpSync(path.join(HERE, "img"), path.join(OUT, "img"), { recursive: true });
for (const f of ["site.css", "site.js", "favicon.svg"]) fs.copyFileSync(path.join(HERE, f), path.join(OUT, f));
// The same self-hosted typefaces the app uses; no third-party font requests.
const FONTS = [
  ["@fontsource-variable/inter/files/inter-latin-wght-normal.woff2", "inter.woff2"],
  ["@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2", "instrument-serif.woff2"],
];
for (const [from, to] of FONTS) fs.copyFileSync(path.join(ROOT, "node_modules", from), path.join(OUT, "fonts", to));
fs.writeFileSync(path.join(OUT, ".nojekyll"), "");

const docs = DOCS.map((d) => {
  const md = fs.readFileSync(path.join(ROOT, d.file), "utf8");
  const headings = [];
  const html = blocks(md.split(/\r?\n/), headings);
  const title = (md.match(/^#\s+(.*)$/m) || [, d.slug])[1];
  const firstPara = (md.split(/\n\s*\n/).find((p) => p.trim() && !/^[#|`>-]/.test(p.trim())) || "").replace(/[*`[\]]/g, "").replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
  return { ...d, html, title, headings, description: firstPara.slice(0, 180) };
});
const groups = [...new Set(DOCS.map((d) => d.group))];
docs.forEach((d, n) => {
  const side = groups.map((g) => `<p class="side-group">${g}</p><ul>${docs.filter((x) => x.group === g).map((x) => `<li><a href="${x.slug}.html"${x.slug === d.slug ? ' aria-current="page"' : ""}>${esc(x.title)}</a></li>`).join("")}</ul>`).join("");
  const prev = docs[n - 1], next = docs[n + 1];
  const body = `
<div class="docs">
  <aside class="side"><details open><summary>Documentation</summary>${side}</details></aside>
  <main class="prose">
    ${d.html}
    <nav class="pager">
      ${prev ? `<a href="${prev.slug}.html"><span>Previous</span>${esc(prev.title)}</a>` : "<span></span>"}
      ${next ? `<a class="next" href="${next.slug}.html"><span>Next</span>${esc(next.title)}</a>` : ""}
    </nav>
    <p class="edit"><a href="${REPO}/blob/main/${d.file}" rel="noopener">Edit this page on GitHub</a></p>
  </main>
</div>`;
  fs.writeFileSync(path.join(OUT, "docs", `${d.slug}.html`), page({ base: "../", title: `${d.title} · Pretty Good Data Room`, description: d.description, body, current: "docs" }));
});
fs.writeFileSync(path.join(OUT, "docs", "index.html"), `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=getting-started.html"><link rel="canonical" href="getting-started.html"><title>Documentation</title><a href="getting-started.html">Documentation</a>`);

const home = fs.readFileSync(path.join(HERE, "home.html"), "utf8");
fs.writeFileSync(path.join(OUT, "index.html"), page({ base: "", title: "Pretty Good Data Room: a free, self-hosted data room for early founders", description: "A free, open-source data room and fundraising workspace for early founders. Runs on your own server: one command to install, one file of data, no passwords.", body: home, current: "home" }));
fs.writeFileSync(path.join(OUT, "404.html"), page({ base: BASE, title: "Page not found · Pretty Good Data Room", description: "That page does not exist.", body: `<main class="prose" style="margin:80px auto;padding:0 28px"><h1>That page does not exist</h1><p>It may have moved. Try the <a href="${BASE}docs/getting-started.html">documentation</a> or the <a href="${BASE}">home page</a>.</p></main>`, current: "" }));

// Every internal link must lead somewhere.
let broken = 0;
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
for (const file of walk(OUT).filter((f) => f.endsWith(".html") && !f.endsWith("404.html"))) {
  for (const m of fs.readFileSync(file, "utf8").matchAll(/(?:href|src)="([^"#]+)(?:#[^"]*)?"/g)) {
    if (/^(https?:|mailto:)/.test(m[1])) continue;
    if (!fs.existsSync(path.resolve(path.dirname(file), m[1]))) { console.error(`Broken link in ${path.relative(OUT, file)}: ${m[1]}`); broken++; }
  }
}
if (broken) process.exit(1);
console.log(`Built ${docs.length} documentation pages and the home page into ${path.relative(ROOT, OUT)}/`);
