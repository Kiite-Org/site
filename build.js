// Builds the site into dist/: the landing page, and a docs page for every Markdown file in
// KiiteShell's docs/ plus the install and configuration sections of its README.
//
//   KIITE_DIR=../KiiteShell node build.js
//
// The docs are read from a KiiteShell checkout (../KiiteShell by default), so the site
// always shows what the shell's repo says.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Marked, Lexer, Renderer } from "marked";
import hljs from "highlight.js/lib/common";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KIITE_DIR = path.resolve(process.env.KIITE_DIR || path.join(HERE, "../KiiteShell"));
const SRC = path.join(HERE, "src");
const OUT = path.join(HERE, "dist");
const REPO = "https://github.com/Kiite-Org/KiiteShell";
// Where the site is served from. GitHub Pages serves a project site under /<repo>/.
// Only the 404 page needs it: every other page links relatively.
const BASE = process.env.SITE_BASE || "/";
const BRANCH = "main";

// ---------------------------------------------------------------------------------------------
// The docs, in reading order. `file` is a page in docs/; `readme` takes those `##` sections
// from the README instead.

const NAV = [
  {
    group: "Get started", shape: "Cookie4Sided", rail: "start",
    pages: [
      { slug: "install", title: "Install", readme: ["Requirements", "Building"], icon: "download",
        blurb: "What the shell needs, every optional tool it can use, and how to build it." },
      { slug: "running", title: "Running the shell", readme: ["Running the shell"], icon: "play_circle",
        blurb: "Starting Kiite from Hyprland, and the other commands the binary takes." },
      { slug: "configuration", title: "Configuration", readme: ["Configuration"], icon: "tune",
        blurb: "config.json, the settings app, and what each top-level key covers." },
      { slug: "keybindings", title: "Keybindings", readme: ["Keybindings"], icon: "keyboard",
        blurb: "Binding Hyprland keys to the shell, with a starter set to copy." },
      { slug: "using-ipc", title: "Using IPC", readme: ["IPC"], icon: "terminal",
        blurb: "kiite ipc from a terminal or a script, and the targets it reaches." },
      { slug: "kit", title: "Kit (AI)", readme: ["Kit (AI)"], icon: "smart_toy",
        blurb: "The sidebar assistant's commands, providers and custom models." },
    ],
  },
  {
    group: "The shell", shape: "Flower", rail: "docs",
    pages: [
      { slug: "launcher", file: "launcher.md", icon: "search",
        blurb: "Search prefixes, results, and the > commands." },
      { slug: "desktop", file: "desktop.md", icon: "wallpaper",
        blurb: "The wallpaper, desktop widgets, edit mode and the tile layout." },
      { slug: "lock-screen", file: "lock-screen.md", icon: "lock",
        blurb: "The session lock, its glance and sidebar layouts, and the password field." },
      { slug: "screenshots", file: "screenshots.md", title: "Screenshots", icon: "screenshot_region",
        blurb: "The region selector, markup, Circle to Search and recording." },
      { slug: "arcade", file: "arcade.md", icon: "sports_esports",
        blurb: "Kiite Arcade's games, and how each is checked against its rules." },
    ],
  },
  {
    group: "Devices", shape: "Clover4Leaf", rail: "docs",
    pages: [
      { slug: "kiite-drop", file: "kiite-drop.md", icon: "send_to_mobile",
        blurb: "Quick Share and LocalSend in one dialog, what each needs, and how each works." },
      { slug: "nothing-x", file: "nothing-x.md", icon: "earbuds",
        blurb: "Nothing and CMF earbuds and headphones, the protocol, and how Kiite reaches them." },
    ],
  },
  {
    group: "Develop", shape: "Gem", rail: "develop",
    pages: [
      { slug: "architecture", file: "architecture.md", icon: "architecture",
        blurb: "How the crates combine, how a frame is drawn, and where state lives." },
      { slug: "project-structure", title: "Project structure", readme: ["Project structure"], icon: "account_tree",
        blurb: "What each crate in the workspace is for." },
      { slug: "ipc", file: "ipc.md", title: "IPC protocol", icon: "cable",
        blurb: "The kiite ipc protocol, and adding a target." },
      { slug: "gpui-patches", file: "gpui-patches.md", icon: "build",
        blurb: "What Kiite changes in its vendored copy of GPUI, and why." },
      { slug: "translations", file: "translations.md", icon: "translate",
        blurb: "How the interface text is translated, and how to add a language." },
      { slug: "contributing", file: "CONTRIBUTING.md", title: "Contributing", icon: "volunteer_activism",
        blurb: "Getting set up, the process, and the guidelines a change should follow." },
    ],
  },
];

// Shown on the landing page, in this order.
const LANDING_DOCS = [
  ["install", "Cookie7Sided", "Flower"], ["configuration", "Gem", "Diamond"], ["launcher", "Puffy", "PuffyDiamond"],
  ["desktop", "Arch", "Fan"], ["lock-screen", "Bun", "Pill"], ["kiite-drop", "Clover4Leaf", "Cookie4Sided"],
  ["nothing-x", "Pill", "Bun"], ["architecture", "Sunny", "VerySunny"],
];

// Each page's hero gets its own trio of shapes, and its h2s cycle through these.
const HERO_SHAPES = [
  ["Cookie12Sided", "Flower", "Clover4Leaf", "Heart", "VerySunny"],
  ["Flower", "Clover8Leaf", "Gem", "Puffy", "Cookie4Sided"],
  ["SoftBurst", "Cookie9Sided", "Sunny", "Bun", "Clover4Leaf"],
  ["Clover8Leaf", "Puffy", "Pill", "Cookie6Sided", "Sunny"],
  ["Cookie9Sided", "SoftBoom", "Heart", "Gem", "Cookie7Sided"],
];
const H2_SHAPES = ["Cookie9Sided", "Clover8Leaf", "Gem", "Sunny", "Flower", "Puffy", "Cookie6Sided", "Clover4Leaf", "SoftBurst", "Heart"];

const PAGES = NAV.flatMap((g) => g.pages.map((p) => ({ ...p, group: g })));
const BY_FILE = Object.fromEntries(PAGES.filter((p) => p.file).map((p) => [p.file.toLowerCase(), p]));

// ---------------------------------------------------------------------------------------------
// Helpers

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const stripTags = (s) => s.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

// GitHub's heading ids, so links like desktop.md#the-tile-layout keep working.
function slugger() {
  const seen = new Map();
  return (text) => {
    let id = stripTags(text).toLowerCase().trim().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s/g, "-");
    const n = seen.get(id) || 0;
    seen.set(id, n + 1);
    return n ? `${id}-${n}` : id;
  };
}

const LANGS = { sh: "bash", shell: "bash", console: "bash", conf: "ini", text: null, "": null };
function highlight(code, lang) {
  const l = lang in LANGS ? LANGS[lang] : lang;
  if (l && hljs.getLanguage(l)) return hljs.highlight(code, { language: l }).value;
  return esc(code);
}

// ---------------------------------------------------------------------------------------------
// Markdown

// Where a README heading id ends up, for README-internal links like #configuration.
const readmeIds = new Map();

// Rewrite a link from a source file to where that file lives on the site.
function resolveLink(href, from) {
  if (/^([a-z]+:|\/\/)/i.test(href)) return { href, external: true };
  const [rawPath, frag] = href.split("#");
  const hash = frag ? `#${frag}` : "";
  if (!rawPath) {
    if (from.readme && frag && readmeIds.has(frag)) {
      const target = readmeIds.get(frag);
      return { href: target === from.slug ? hash : `../${target}/${hash}` };
    }
    return { href: hash };
  }
  const base = from.file ? "docs" : "";
  const repoPath = path.posix.normalize(path.posix.join(base, rawPath));
  if (repoPath.toLowerCase() === "readme.md") {
    if (frag && readmeIds.has(frag)) return { href: `../${readmeIds.get(frag)}/${hash}` };
    return { href: "../" };
  }
  if (repoPath.toLowerCase() === "docs/readme.md") return { href: "../" };
  const m = repoPath.match(/^docs\/([^/]+\.md)$/i);
  if (m && BY_FILE[m[1].toLowerCase()]) {
    const target = BY_FILE[m[1].toLowerCase()];
    return { href: target.slug === from.slug ? hash : `../${target.slug}/${hash}` };
  }
  return { href: `${REPO}/blob/${BRANCH}/${repoPath}${hash}`, external: true };
}

const ALERTS = {
  NOTE: ["info", "Cookie9Sided", "note"], TIP: ["lightbulb", "Sunny", "tip"], IMPORTANT: ["priority_high", "Burst", "important"],
  WARNING: ["warning", "Triangle", "warning"], CAUTION: ["report", "SoftBoom", "caution"],
};

function renderMarkdown(tokens, page) {
  const slug = slugger();
  const toc = [];
  const headingIds = [];
  let h2count = 0;

  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      heading({ tokens: inline, depth }) {
        const html = this.parser.parseInline(inline);
        if (depth === 1) return "";
        const id = slug(html);
        if (depth <= 3) {
          toc.push({ id, text: stripTags(html), depth });
          headingIds.push(id);
        }
        const shape = depth === 2 ? `<m3-shape shape="${H2_SHAPES[h2count++ % H2_SHAPES.length]}"></m3-shape>` : "";
        return `<h${depth} id="${id}">${shape}<a class="anchor" href="#${id}">${html}</a></h${depth}>\n`;
      },
      code({ text, lang }) {
        lang = (lang || "").trim().split(/\s/)[0];
        const label = lang && lang !== "text" ? `<span class="lang">${esc(lang)}</span>` : "";
        return `<div class="code">${label}<button class="ibtn copy" aria-label="Copy"><span class="sym" style="font-size:20px">content_copy</span></button><pre><code>${highlight(text, lang)}</code></pre></div>\n`;
      },
      table(token) {
        return `<div class="table-wrap">${Renderer.prototype.table.call(this, token)}</div>\n`;
      },
      blockquote(token) {
        const m = token.text.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*\n?/);
        if (!m) return `<blockquote>${this.parser.parse(token.tokens)}</blockquote>\n`;
        const [icon, shape, cls] = ALERTS[m[1]];
        const inner = this.parser.parse(new Lexer({ gfm: true }).lex(token.text.slice(m[0].length)));
        return `<div class="note ${cls}"><span class="ic"><m3-shape shape="${shape}"></m3-shape><span class="sym">${icon}</span></span><div>${inner}</div></div>\n`;
      },
      link({ href, title, tokens: inline }) {
        const r = resolveLink(href, page);
        const t = title ? ` title="${esc(title)}"` : "";
        const ext = r.external && /^https?:/.test(r.href) ? ` rel="noopener"` : "";
        return `<a href="${esc(r.href)}"${t}${ext}>${this.parser.parseInline(inline)}</a>`;
      },
    },
  });

  const html = marked.parser(tokens);

  // Plain text per section, for search: a new section starts at each h2 and h3.
  const sections = [{ id: "", heading: page.title, text: "" }];
  let k = 0;
  for (const t of tokens) {
    if (t.type === "heading" && t.depth >= 2 && t.depth <= 3) sections.push({ id: headingIds[k++], heading: stripTags(t.text), text: "" });
    else if (t.type !== "heading") sections.at(-1).text += " " + plain(t);
  }
  return { html, toc, sections: sections.map((s) => ({ ...s, text: s.text.replace(/\s+/g, " ").trim() })) };
}

function plain(token) {
  if (token.type === "code") return token.text.split("\n").slice(0, 6).join(" ");
  return stripTags((token.raw || "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[`*_>#|]+/g, " ").replace(/-{3,}/g, " "));
}

// ---------------------------------------------------------------------------------------------
// Sources

function readmeSections() {
  const src = fs.readFileSync(path.join(KIITE_DIR, "README.md"), "utf8");
  const tokens = new Lexer({ gfm: true }).lex(src);
  const groups = new Map();
  let name = null;
  for (const t of tokens) {
    if (t.type === "heading" && t.depth === 2) { name = t.text; groups.set(name, []); continue; }
    if (name) groups.get(name).push(t);
  }
  // Drop the rules that separate README sections; they mean nothing on their own page.
  for (const list of groups.values()) while (list.length && /^(hr|space)$/.test(list.at(-1).type)) list.pop();
  return { groups, links: tokens.links };
}

function loadPages() {
  const readme = readmeSections();
  for (const page of PAGES) {
    let tokens;
    if (page.readme) {
      tokens = [];
      for (const name of page.readme) {
        const part = readme.groups.get(name);
        if (!part) throw new Error(`README has no "## ${name}" section (for ${page.slug})`);
        // Several sections on one page keep their titles as h2s.
        if (page.readme.length > 1) tokens.push(...new Lexer({ gfm: true }).lex(`## ${name}\n`));
        tokens.push(...part);
      }
      tokens.links = readme.links;
      page.edit = `${REPO}/edit/${BRANCH}/README.md`;
      page.sourceLabel = "README.md";
    } else {
      const src = fs.readFileSync(path.join(KIITE_DIR, "docs", page.file), "utf8");
      tokens = new Lexer({ gfm: true }).lex(src);
      const h1 = tokens.find((t) => t.type === "heading" && t.depth === 1);
      page.title ||= h1 ? h1.text : page.slug;
      page.edit = `${REPO}/edit/${BRANCH}/docs/${page.file}`;
      page.sourceLabel = `docs/${page.file}`;
    }
    page.tokens = tokens;
    page.words = tokens.reduce((n, t) => n + (t.raw || "").split(/\s+/).length, 0);
  }
  // README heading ids, so README-internal anchors can be pointed at the right page.
  for (const page of PAGES.filter((p) => p.readme)) {
    const slug = slugger();
    for (const name of page.readme) readmeIds.set(slug(name), page.slug);
    for (const t of page.tokens) if (t.type === "heading") readmeIds.set(slugger()(t.text), page.slug);
  }
}

// ---------------------------------------------------------------------------------------------
// Templates

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Roboto+Flex:opsz,wdth,wght@8..144,25..151,100..1000&family=Roboto+Mono:wght@400;500;600&family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,500,1,0&display=swap" rel="stylesheet">`;

function shell({ root, title, description, rail, current, content, toc = "" }) {
  const railLink = (key, href, icon, label) =>
    `<a href="${href}"${rail === key ? ' aria-current="page"' : ""}><span class="ind"><span class="sym">${icon}</span></span>${label}</a>`;
  const drawer = NAV.map((g) => `
    <h4>${esc(g.group)}</h4>
    ${PAGES.filter((p) => p.group === g).map((p) => `<a href="${root}docs/${p.slug}/"${p === current ? ' aria-current="page"' : ""}><m3-shape shape="${g.shape}"></m3-shape>${esc(p.title)}</a>`).join("\n    ")}`).join("\n");
  const crumbs = current
    ? `<a href="${root}docs/">Docs</a><span class="sym">chevron_right</span><span>${esc(current.group.group)}</span><span class="sym">chevron_right</span><b>${esc(current.title)}</b>`
    : `<a href="${root}">Kiite</a><span class="sym">chevron_right</span><b>Docs</b>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<script>try{const t=localStorage.getItem("kiite-docs-theme");if(t)document.documentElement.dataset.theme=t}catch{}</script>
${FONTS}
<link rel="icon" href="${root}assets/favicon.svg">
<link rel="stylesheet" href="${root}assets/base.css">
<link rel="stylesheet" href="${root}assets/shape-masks.css">
<link rel="stylesheet" href="${root}assets/docs.css">
</head>
<body data-root="${root}">
<a class="skip" href="#main">Skip to content</a>
<div class="app">
  <nav class="rail" aria-label="Site">
    <a href="${root}" aria-label="KiiteShell home" style="padding:0;margin-bottom:12px"><m3-shape class="logo" shape="Cookie9Sided" hover="Flower" data-hover-root style="margin:0"></m3-shape></a>
    <button class="fab" id="search-fab" aria-label="Search the docs" data-hover-root><m3-shape shape="Cookie4Sided" hover="Clover4Leaf"></m3-shape><span class="sym">search</span></button>
    <div style="height:16px"></div>
    ${railLink("home", root, "home", "Home")}
    ${railLink("start", `${root}docs/install/`, "rocket_launch", "Start")}
    ${railLink("docs", `${root}docs/`, "menu_book", "Docs")}
    ${railLink("develop", `${root}docs/architecture/`, "code_blocks", "Develop")}
    <span class="spacer"></span>
    <a href="${REPO}"><span class="ind"><span class="sym">code</span></span>Source</a>
  </nav>

  <aside class="drawer" id="drawer" aria-label="Documentation">
    <label class="search"><span class="sym">search</span><input id="search" placeholder="Search docs" aria-label="Search docs" autocomplete="off"><kbd>/</kbd></label>
    <div class="results" id="results" role="listbox"></div>
    <div class="nav-groups">${drawer}
    </div>
  </aside>

  <div class="sheet">
    <div class="topbar">
      <button class="ibtn menu-btn" id="menu" aria-label="Open navigation"><span class="sym">menu</span></button>
      <nav class="crumbs" aria-label="Breadcrumb">${crumbs}</nav>
      <div class="right">
        <button class="ibtn" id="theme" aria-label="Toggle light and dark"><span class="sym">contrast</span></button>
        <a class="ibtn" href="${REPO}" aria-label="KiiteShell on GitHub"><span class="sym">code</span></a>
      </div>
    </div>
    <div class="content-grid">
      <article id="main">
${content}
      </article>
${toc}
    </div>
  </div>
</div>
<script type="module" src="${root}assets/docs.js"></script>
</body>
</html>
`;
}

function hero({ eyebrowIcon, eyebrow, title, lede, shapes, cls = "" }) {
  const [a, b, c, d, e] = shapes;
  return `<header class="page-hero ${cls}">
          <div class="cluster" aria-hidden="true">
            <m3-shape class="c1" shape="${a}" morph="${b},${d}" interval="3200"></m3-shape>
            <m3-shape class="c2" shape="${c}" morph="${e}" interval="2600"></m3-shape>
            <m3-shape class="c3" shape="${e === "VerySunny" ? "Sunny" : "VerySunny"}"></m3-shape>
          </div>
          <span class="eyebrow"><span class="sym" style="font-size:18px">${eyebrowIcon}</span>${esc(eyebrow)}</span>
          <h1>${esc(title)}</h1>
          <p>${esc(lede)}</p>
        </header>`;
}

function docPage(page, i) {
  const { html, toc, sections } = renderMarkdown(page.tokens, page);
  page.sections = sections;
  const root = "../../";
  const prev = PAGES[i - 1], next = PAGES[i + 1];
  const minutes = Math.max(1, Math.round(page.words / 220));
  const content = `        ${hero({ eyebrowIcon: page.icon, eyebrow: page.group.group, title: page.title, lede: page.blurb, shapes: HERO_SHAPES[i % HERO_SHAPES.length] })}
        <div class="meta">
          <a class="chip" href="${REPO}/blob/${BRANCH}/${page.sourceLabel}"><span class="sym">description</span>${esc(page.sourceLabel)}</a>
          <span class="chip"><span class="sym">schedule</span>${minutes} min read</span>
        </div>
        <div class="prose">
${html}
        </div>
        <nav class="pager" aria-label="Previous and next">
          ${prev ? `<a href="../${prev.slug}/" data-hover-root><span class="s"><m3-shape shape="Arch" hover="Cookie4Sided"></m3-shape><span class="sym">arrow_back</span></span><span><small>Previous</small><b>${esc(prev.title)}</b></span></a>` : "<span></span>"}
          ${next ? `<a href="../${next.slug}/" class="next" data-hover-root><span><small>Next</small><b>${esc(next.title)}</b></span><span class="s"><m3-shape shape="Fan" hover="Cookie4Sided"></m3-shape><span class="sym">arrow_forward</span></span></a>` : ""}
        </nav>`;
  const tocHtml = `      <aside class="toc" aria-label="On this page">
        ${toc.length ? `<h5>On this page</h5>
        <ol id="toc">
          <m3-shape class="marker" id="marker" shape="Cookie4Sided"></m3-shape>
          ${toc.map((t) => `<li${t.depth === 3 ? ' class="sub"' : ""}><a href="#${t.id}">${esc(t.text)}</a></li>`).join("\n          ")}
        </ol>` : ""}
        <a class="edit" href="${page.edit}"><span class="sym" style="font-size:18px">edit</span>Edit this page</a>
      </aside>`;
  return shell({
    root, title: `${page.title} · Kiite Docs`, description: page.blurb, rail: page.group.rail, current: page,
    content, toc: tocHtml,
  });
}

// A docs home card rests in one shape and morphs into its group's shape on hover. When the
// two would be the same, it morphs into a burst instead, so every card visibly changes.
const cardShape = (g, i) => H2_SHAPES[(i + g.group.length) % H2_SHAPES.length];
const cardHover = (g, i) => (cardShape(g, i) === g.shape ? "SoftBurst" : g.shape);

function docsHome() {
  const root = "../";
  const content = `        ${hero({ eyebrowIcon: "menu_book", eyebrow: "Documentation", title: "Kiite Docs", cls: "home-hero",
    lede: "Installing and configuring KiiteShell, how each part of it works, and how it's put together.",
    shapes: ["Cookie12Sided", "Flower", "Clover4Leaf", "Heart", "VerySunny"] })}
        <div class="groups">
          ${NAV.map((g) => `<section class="group">
            <h2><m3-shape shape="${g.shape}"></m3-shape>${esc(g.group)}</h2>
            <div class="cards">
              ${PAGES.filter((p) => p.group === g).map((p, i) => `<a class="doc-card" href="${p.slug}/" data-hover-root>
                <span class="shaped"><m3-shape shape="${cardShape(g, i)}" hover="${cardHover(g, i)}" style="color:var(--secondary-container)"></m3-shape><span class="sym" style="color:var(--on-secondary-container)">${p.icon}</span></span>
                <b>${esc(p.title)}</b><p>${esc(p.blurb)}</p></a>`).join("\n              ")}
            </div>
          </section>`).join("\n          ")}
        </div>`;
  return shell({ root, title: "Kiite Docs", description: "KiiteShell documentation.", rail: "docs", content });
}

function landing() {
  const tpl = fs.readFileSync(path.join(SRC, "index.html"), "utf8");
  const bySlug = Object.fromEntries(PAGES.map((p) => [p.slug, p]));
  const cards = LANDING_DOCS.map(([slug, shape, hover]) => {
    const p = bySlug[slug];
    return `      <a class="doc" href="docs/${slug}/" data-hover-root><span class="ic"><m3-shape shape="${shape}" hover="${hover}"></m3-shape><span class="sym">${p.icon}</span></span><span><b>${esc(p.title)}</b><small>${esc(p.blurb)}</small></span></a>`;
  }).join("\n");
  return tpl.replace("<!-- @docs-cards -->", cards);
}

function notFound() {
  return shell({
    root: BASE, title: "Not found · Kiite", description: "Page not found.", rail: "",
    content: `        ${hero({ eyebrowIcon: "explore_off", eyebrow: "404", title: "Lost the shape", lede: "That page isn't here. It may have moved when the docs were reorganised.", shapes: ["Ghostish", "Puffy", "Bun", "Heart", "Sunny"] })}
        <p class="prose" style="font-size:18px"><a href="${BASE}docs/">Go to the docs</a> or <a href="${BASE}">back home</a>.</p>`,
  });
}

// ---------------------------------------------------------------------------------------------
// Build

function favicon() {
  const d = fs.readFileSync(path.join(SRC, "assets/shape-paths.js"), "utf8").match(/Cookie9Sided: "([^"]+)"/)[1];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="#b2d17f" d="${d}"/></svg>\n`;
}

// Shapes used from CSS (list bullets, step numbers) as mask images. A url(#id) clip path in a
// stylesheet resolves against the stylesheet's URL, so these are data URIs instead.
const CSS_SHAPES = ["Cookie4Sided", "Sunny", "Circle"];
function shapeMasks() {
  const src = fs.readFileSync(path.join(SRC, "assets/shape-paths.js"), "utf8");
  const vars = CSS_SHAPES.map((name) => {
    const d = src.match(new RegExp(`${name}: "([^"]+)"`))[1];
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><path d='${d}'/></svg>`;
    const kebab = name.replace(/([a-z])(?=[A-Z0-9])|([0-9])(?=[A-Z])/g, "$1$2-").toLowerCase();
    return `  --mask-${kebab}: url("data:image/svg+xml,${encodeURIComponent(svg)}");`;
  });
  return `/* Generated by build.js. */\n:root {\n${vars.join("\n")}\n}\n`;
}

function write(rel, content) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

// Cache busting. Pages lets browsers keep files for ten minutes, which after a deploy left
// visitors with new HTML on old CSS and JS. Every reference to a file in assets/ gets
// ?v=<hash of its contents>, so a changed file is a new URL. Scripts and stylesheets are
// rewritten before they're hashed, so a change to shape-paths.js also changes the URLs of
// shapes.js and of the scripts that import it.
const ASSET_REF = {
  ".js": /(\bfrom\s*["'])(\.\/[^"'?#]+)(["'])/g,
  ".css": /(url\(\s*["']?)(?!data:|#)([^"')?#]+)(["']?\s*\))/g,
  ".html": /(\b(?:href|src|poster)=")([^"?#:]*assets\/[^"?#]+)(")/g,
};
function fingerprint() {
  const hashes = new Map();
  const hashOf = (file) => {
    if (!hashes.has(file)) {
      const ext = path.extname(file);
      if (ext === ".js" || ext === ".css") rewriteRefs(file);
      hashes.set(file, crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").slice(0, 10));
    }
    return hashes.get(file);
  };
  const rewriteRefs = (file) => {
    const re = ASSET_REF[path.extname(file)];
    const src = fs.readFileSync(file, "utf8");
    const out = src.replace(re, (all, pre, ref, post) => {
      // The 404 page links from the site's base path, since it's served at any URL.
      const target = ref.startsWith("/") ? path.join(OUT, ref.slice(BASE.length)) : path.resolve(path.dirname(file), ref);
      return fs.existsSync(target) ? `${pre}${ref}?v=${hashOf(target)}${post}` : all;
    });
    if (out !== src) fs.writeFileSync(file, out);
  };
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
  for (const file of walk(OUT).filter((f) => f.endsWith(".html"))) rewriteRefs(file);
}

export function build() {
  const started = Date.now();
  if (!fs.existsSync(path.join(KIITE_DIR, "docs"))) {
    throw new Error(`No KiiteShell checkout at ${KIITE_DIR}. Set KIITE_DIR to one.`);
  }
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.cpSync(path.join(SRC, "assets"), path.join(OUT, "assets"), { recursive: true });
  write("assets/favicon.svg", favicon());
  write("assets/shape-masks.css", shapeMasks());
  write(".nojekyll", "");

  loadPages();
  PAGES.forEach((p, i) => write(`docs/${p.slug}/index.html`, docPage(p, i)));
  write("docs/index.html", docsHome());
  write("index.html", landing());
  write("404.html", notFound());

  const index = PAGES.flatMap((p) => p.sections.filter((s) => s.text || s.id).map((s) => ({
    page: p.title, heading: s.heading, url: `docs/${p.slug}/${s.id ? `#${s.id}` : ""}`, text: s.text.slice(0, 1200),
  })));
  write("search.json", JSON.stringify(index));
  fingerprint();

  console.log(`Built ${PAGES.length} docs pages from ${KIITE_DIR} in ${Date.now() - started} ms`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) build();
