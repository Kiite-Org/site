// The landing page: hero morph, shape ribbon, the media-shape demo, tour video and contributors.
import { SHAPES, SHAPE_NAMES, wireClips, morphableClip, morphPath } from "./shapes.js";
import { startLavaShapes } from "./lava-shapes.js";
import { startConstellation } from "./constellation.js";

wireClips();

// Hero: the wallpaper, clipped into a shape that keeps changing.
const heroSeq = ["Cookie12Sided", "Flower", "Clover8Leaf", "SoftBoom", "Cookie9Sided", "Puffy"];
const morphHero = morphableClip(document.getElementById("hero-art"), heroSeq[0]);
let h = 0;
setInterval(() => { if (!document.hidden) morphHero(heroSeq[++h % heroSeq.length], { duration: 900, damping: 0.5 }); }, 2600);

// Ribbon: every shape, twice, so the loop is seamless.
const colors = ["var(--primary)", "var(--secondary)", "var(--tertiary)", "var(--primary-container)", "var(--secondary-container)", "var(--tertiary-container)"];
const ribbon = document.getElementById("ribbon");
for (const pass of [0, 1]) SHAPE_NAMES.forEach((name, i) => {
  const s = document.createElement("m3-shape");
  s.setAttribute("shape", name);
  s.style.color = colors[i % colors.length];
  s.title = name;
  ribbon.append(s);
});

// Media shape: cover clipped into the picked shape, bars along its outline.
const cover = document.getElementById("cover");
const morphCover = morphableClip(cover, "Cookie9Sided");
const viz = document.getElementById("viz");
const NS = "http://www.w3.org/2000/svg";
const probe = document.createElementNS(NS, "path");
const BARS = 72;
const bars = [];
for (let i = 0; i < BARS; i++) {
  const l = document.createElementNS(NS, "line");
  l.setAttribute("stroke", "var(--secondary)");
  l.setAttribute("stroke-width", "1.3");
  l.setAttribute("stroke-linecap", "round");
  viz.append(l); bars.push(l);
}
let ringPts = [];
function setRing(name) {
  probe.setAttribute("d", SHAPES[name]);
  const len = probe.getTotalLength();
  ringPts = Array.from({ length: BARS }, (_, i) => {
    const p = probe.getPointAtLength((i / BARS) * len);
    const dx = p.x - 50, dy = p.y - 50, m = Math.hypot(dx, dy) || 1;
    return { x: p.x, y: p.y, nx: dx / m, ny: dy / m };
  });
}
setRing("Cookie9Sided");
const picker = document.getElementById("picker");
["Cookie9Sided", "Flower", "Clover4Leaf", "Heart", "Sunny", "Gem", "SoftBurst", "Pill", "Puffy", "Arch", "Ghostish", "Triangle"].forEach((name, i) => {
  const b = document.createElement("button");
  b.title = name; b.setAttribute("aria-label", name); b.setAttribute("aria-pressed", i === 0);
  b.innerHTML = `<m3-shape shape="${name}"></m3-shape>`;
  b.onclick = () => {
    picker.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
    morphCover(name, { duration: 800, damping: 0.5 });
    setRing(name);
  };
  picker.append(b);
});
let playing = true;
const play = document.getElementById("play");
play.onclick = () => { playing = !playing; play.querySelector(".sym").textContent = playing ? "pause" : "play_arrow"; play.setAttribute("aria-label", playing ? "Pause" : "Play"); };
// The ring sits on the cover's outline, scaled to match the cover's inset in the art box.
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
let tick = 0;
(function frame() {
  if (!document.hidden) {
    tick += playing && !reduce ? 1 : 0;
    const scale = 0.64, off = 18;
    ringPts.forEach((p, i) => {
      const beat = playing ? (Math.sin(i * 0.55 + tick * 0.09) * 0.5 + 0.5) * (Math.sin(i * 0.17 - tick * 0.05) * 0.5 + 0.7) : 0.15;
      const x = p.x * scale + off + p.nx * 2.5, y = p.y * scale + off + p.ny * 2.5;
      const len = 1.5 + beat * 8;
      bars[i].setAttribute("x1", x); bars[i].setAttribute("y1", y);
      bars[i].setAttribute("x2", x + p.nx * len); bars[i].setAttribute("y2", y + p.ny * len);
    });
  }
  requestAnimationFrame(frame);
})();


// Tour video: loads only on play, then hands over to the browser's own controls.
const tourFrame = document.getElementById("tour-frame");
const tourVideo = document.getElementById("tour-video");
document.getElementById("tour-play").addEventListener("click", () => {
  tourFrame.classList.add("playing");
  tourVideo.controls = true;
  tourVideo.play().catch(() => {});
});

// Background shapes start after first paint, since computing their fields takes a moment.
const lava = document.getElementById("lava");
const startLava = () => { try { startLavaShapes(lava); } catch (e) { console.warn("Background shapes unavailable:", e); } };
"requestIdleCallback" in window ? requestIdleCallback(startLava, { timeout: 800 }) : setTimeout(startLava, 200);

const stars = document.getElementById("constellation");
if (stars) startConstellation(stars);
