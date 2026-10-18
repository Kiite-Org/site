// M3 Expressive shapes for the site: clip paths, a <m3-shape> element, and spring morphs.
// The outlines come from gpui-material, so the site and the shell draw the same shapes.
import { SHAPES } from "./shape-paths.js";

export { SHAPES };
export const SHAPE_NAMES = Object.keys(SHAPES);

const SVG_NS = "http://www.w3.org/2000/svg";
const SAMPLES = 180;

export const kebab = (name) => name.replace(/([a-z])(?=[A-Z0-9])|([0-9])(?=[A-Z])/g, "$1$2-").toLowerCase();

// One hidden <svg> holding a clipPath per shape: `clip-path: url(#m3-cookie-9-sided)`.
export function installClipPaths() {
  if (document.getElementById("m3-clip-defs")) return;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.id = "m3-clip-defs";
  svg.setAttribute("aria-hidden", "true");
  svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
  const defs = document.createElementNS(SVG_NS, "defs");
  for (const [name, d] of Object.entries(SHAPES)) {
    const clip = document.createElementNS(SVG_NS, "clipPath");
    clip.id = `m3-${kebab(name)}`;
    clip.setAttribute("clipPathUnits", "objectBoundingBox");
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    path.setAttribute("transform", "scale(0.01)");
    clip.append(path);
    defs.append(clip);
  }
  svg.append(defs);
  document.body.prepend(svg);
}

// Sample an outline into evenly spaced points, so two shapes can be blended point by point.
const sampleCache = new Map();
let probe;
function samples(name) {
  if (sampleCache.has(name)) return sampleCache.get(name);
  if (!probe) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.style.cssText = "position:absolute;width:0;height:0";
    probe = document.createElementNS(SVG_NS, "path");
    svg.append(probe);
    document.body.append(svg);
  }
  probe.setAttribute("d", SHAPES[name]);
  const len = probe.getTotalLength();
  const pts = [];
  for (let i = 0; i < SAMPLES; i++) {
    const p = probe.getPointAtLength((i / SAMPLES) * len);
    pts.push([p.x, p.y]);
  }
  sampleCache.set(name, pts);
  return pts;
}

// Rotate `to`'s starting point so it lines up with `from`'s, which keeps the morph from twisting.
function aligned(from, to) {
  let best = 0, bestErr = Infinity;
  for (let off = 0; off < SAMPLES; off += 2) {
    let err = 0;
    for (let i = 0; i < SAMPLES; i += 6) {
      const a = from[i], b = to[(i + off) % SAMPLES];
      err += (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
    }
    if (err < bestErr) { bestErr = err; best = off; }
  }
  return to.map((_, i) => to[(i + best) % SAMPLES]);
}

function pointsToPath(pts) {
  let d = `M${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) d += `L${pts[i][0].toFixed(2)} ${pts[i][1].toFixed(2)}`;
  return d + "Z";
}

// The M3 Expressive spatial spring: under-damped, so morphs overshoot a little and settle.
export function spring(t, damping = 0.6, stiffness = 380) {
  const w0 = Math.sqrt(stiffness);
  const zeta = damping;
  const wd = w0 * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
}

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

// Morph a <path> (in the 0..100 box) from its current outline to `name`.
export function morphPath(path, name, { duration = 650, damping = 0.6 } = {}) {
  const from = path._m3pts || samples(path._m3shape || name);
  const to = aligned(from, samples(name));
  path._m3shape = name;
  cancelAnimationFrame(path._m3raf);
  if (reduceMotion.matches) {
    path._m3pts = to;
    path.setAttribute("d", SHAPES[name]);
    return;
  }
  const start = performance.now();
  const step = (now) => {
    // A frame's timestamp can be earlier than performance.now() was when the morph began.
    const t = Math.min(Math.max((now - start) / duration, 0), 1);
    const k = spring(t * (duration / 1000), damping);
    const pts = from.map((a, i) => [a[0] + (to[i][0] - a[0]) * k, a[1] + (to[i][1] - a[1]) * k]);
    path._m3pts = pts;
    if (t < 1) {
      path.setAttribute("d", pointsToPath(pts));
      path._m3raf = requestAnimationFrame(step);
    } else {
      path._m3pts = to;
      path.setAttribute("d", SHAPES[name]);
    }
  };
  path._m3raf = requestAnimationFrame(step);
}

// Give an element its own morphable clip path; returns a function that morphs it.
let clipSeq = 0;
export function morphableClip(el, initial) {
  installClipPaths();
  const defs = document.querySelector("#m3-clip-defs defs");
  const clip = document.createElementNS(SVG_NS, "clipPath");
  clip.id = `m3-own-${++clipSeq}`;
  clip.setAttribute("clipPathUnits", "objectBoundingBox");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("transform", "scale(0.01)");
  path.setAttribute("d", SHAPES[initial]);
  path._m3shape = initial;
  clip.append(path);
  defs.append(clip);
  el.style.clipPath = `url(#${clip.id})`;
  return (name, opts) => morphPath(path, name, opts);
}

// <m3-shape shape="Cookie9Sided">: a filled shape in currentColor.
//   morph="Flower,Burst,Pill"  cycles through the list
//   interval="2200"            ms between morphs
//   hover="Burst"              morphs on hover and back
class M3Shape extends HTMLElement {
  static observedAttributes = ["shape"];
  connectedCallback() {
    if (this._path) return;
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("aria-hidden", "true");
    this._path = document.createElementNS(SVG_NS, "path");
    this._path.setAttribute("fill", "currentColor");
    const base = this.getAttribute("shape") || "Circle";
    this._path.setAttribute("d", SHAPES[base]);
    this._path._m3shape = base;
    svg.append(this._path);
    this.append(svg);

    const list = this.getAttribute("morph");
    if (list) {
      const names = [base, ...list.split(",").map((s) => s.trim())];
      let i = 0;
      const every = +this.getAttribute("interval") || 2200;
      this._timer = setInterval(() => {
        if (document.hidden) return;
        i = (i + 1) % names.length;
        morphPath(this._path, names[i]);
      }, every);
    }
    const hover = this.getAttribute("hover");
    if (hover) {
      const target = this.closest("[data-hover-root]") || this;
      target.addEventListener("pointerenter", () => morphPath(this._path, hover));
      target.addEventListener("pointerleave", () => morphPath(this._path, this.getAttribute("shape")));
    }
  }
  disconnectedCallback() { clearInterval(this._timer); }
  attributeChangedCallback(_, old, next) {
    if (this._path && old !== next && SHAPES[next]) morphPath(this._path, next);
  }
}
customElements.define("m3-shape", M3Shape);

// [data-clip="Cookie9Sided"] clips any element; add data-clip-hover="Flower" to morph on hover.
export function wireClips(root = document) {
  installClipPaths();
  for (const el of root.querySelectorAll("[data-clip]")) {
    const base = el.dataset.clip;
    const hover = el.dataset.clipHover;
    if (!hover) { el.style.clipPath = `url(#m3-${kebab(base)})`; continue; }
    const morph = morphableClip(el, base);
    const target = el.closest("[data-hover-root]") || el;
    target.addEventListener("pointerenter", () => morph(hover));
    target.addEventListener("pointerleave", () => morph(base));
    target.addEventListener("focusin", () => morph(hover));
    target.addEventListener("focusout", () => morph(base));
  }
}
