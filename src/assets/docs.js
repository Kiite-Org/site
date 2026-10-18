// The docs: scroll spy, theme, drawer, copy buttons and search.
import { installClipPaths } from "./shapes.js";

installClipPaths();
const root = document.documentElement;
const siteRoot = document.body.dataset.root || "";

// ---------- On this page: the marker hops between headings and changes shape on the way ----------
const links = [...document.querySelectorAll("#toc a[href^='#']")];
const marker = document.getElementById("marker");
const MARKER_SHAPES = ["Cookie4Sided", "Clover4Leaf", "Sunny", "Flower", "Puffy", "Gem"];
let current = -1;
function spy() {
  if (!links.length) return;
  let idx = 0;
  links.forEach((a, i) => {
    const el = document.getElementById(decodeURIComponent(a.hash.slice(1)));
    if (el && el.getBoundingClientRect().top < 140) idx = i;
  });
  if (idx === current) return;
  current = idx;
  links.forEach((a, i) => a.classList.toggle("on", i === idx));
  const a = links[idx];
  marker.style.top = a.offsetTop + a.offsetHeight / 2 - 7 + "px";
  marker.setAttribute("shape", MARKER_SHAPES[idx % MARKER_SHAPES.length]);
}
if (marker) {
  addEventListener("scroll", spy, { passive: true });
  spy();
}

// ---------- Theme: follows the OS until you pick one ----------
const THEME_KEY = "kiite-docs-theme";
try {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved) root.dataset.theme = saved;
} catch {}
document.getElementById("theme")?.addEventListener("click", () => {
  const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = dark ? "light" : "dark";
  try { localStorage.setItem(THEME_KEY, root.dataset.theme); } catch {}
});

// ---------- Drawer on narrow screens ----------
const drawer = document.getElementById("drawer");
document.getElementById("menu")?.addEventListener("click", (e) => { e.stopPropagation(); drawer.classList.toggle("open"); });
document.addEventListener("click", (e) => { if (!drawer.contains(e.target)) drawer.classList.remove("open"); });
document.getElementById("search-fab")?.addEventListener("click", (e) => { e.stopPropagation(); openSearch(); });

// ---------- Copy buttons on code blocks ----------
for (const b of document.querySelectorAll(".code .copy")) {
  b.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(b.parentElement.querySelector("pre").innerText);
      const s = b.querySelector(".sym");
      s.textContent = "check";
      setTimeout(() => (s.textContent = "content_copy"), 1400);
    } catch {}
  });
}

// ---------- Search ----------
const input = document.getElementById("search");
const results = document.getElementById("results");
let index = null;
let selected = 0;

function openSearch() {
  drawer.classList.add("open");
  input.focus();
}
document.addEventListener("keydown", (e) => {
  if (e.key === "/" && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); openSearch(); }
});

async function loadIndex() {
  if (!index) index = fetch(siteRoot + "search.json").then((r) => r.json()).catch(() => []);
  return index;
}
input.addEventListener("focus", loadIndex, { once: true });

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
function highlight(text, terms) {
  let out = esc(text);
  for (const t of terms) out = out.replace(new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"), "<mark>$1</mark>");
  return out;
}
function snippet(text, terms) {
  const lower = text.toLowerCase();
  const at = Math.max(0, Math.min(...terms.map((t) => { const i = lower.indexOf(t); return i < 0 ? Infinity : i; })) - 40);
  const cut = isFinite(at) ? text.slice(at, at + 140) : text.slice(0, 140);
  return (at > 0 ? "…" : "") + cut + (cut.length === 140 ? "…" : "");
}

// Each section scores by where the terms appear: page title, then heading, then body.
function search(entries, q) {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = [];
  for (const e of entries) {
    const title = e.page.toLowerCase(), heading = e.heading.toLowerCase(), text = e.text.toLowerCase();
    let score = 0, all = true;
    for (const t of terms) {
      const s = (title.includes(t) ? 6 : 0) + (heading.includes(t) ? 4 : 0) + (text.includes(t) ? 1 : 0);
      if (!s) { all = false; break; }
      score += s;
    }
    if (all) hits.push({ e, score, terms });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, 12);
}

function render(hits) {
  selected = 0;
  if (!hits.length) { results.innerHTML = `<p class="empty">Nothing matches.</p>`; return; }
  results.innerHTML = hits.map(({ e, terms }, i) => `
    <a href="${siteRoot}${e.url}" class="${i === 0 ? "sel" : ""}">
      <b>${highlight(e.heading === e.page ? e.page : `${e.page} › ${e.heading}`, terms)}</b>
      <small>${highlight(snippet(e.text, terms), terms)}</small>
    </a>`).join("");
}

input.addEventListener("input", async () => {
  const q = input.value.trim();
  drawer.classList.toggle("searching", q.length > 0);
  if (!q) return;
  render(search(await loadIndex(), q));
});
input.addEventListener("keydown", (e) => {
  const items = [...results.querySelectorAll("a")];
  if (e.key === "Escape") { input.value = ""; drawer.classList.remove("searching", "open"); input.blur(); return; }
  if (!items.length) return;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    selected = (selected + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length;
    items.forEach((a, i) => a.classList.toggle("sel", i === selected));
    items[selected].scrollIntoView({ block: "nearest" });
  }
  if (e.key === "Enter") { e.preventDefault(); location.href = items[selected].href; }
});
