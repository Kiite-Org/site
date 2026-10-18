// "Meet the contributors": avatars laid out as a constellation, biggest for most commits.
// Size follows rank, not commit count, so a big lead doesn't dwarf everyone else.

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

// Seeded random numbers, so the layout and the specks don't change on every resize.
function rng(seed) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function startConstellation(root) {
  const stars = [...root.querySelectorAll(".star")];
  const sky = root.querySelector(".sky");
  if (!stars.length || !sky) return;
  const NS = "http://www.w3.org/2000/svg";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let nodes = [], links = [], width = 0;

  function layout() {
    width = root.clientWidth;
    if (!width) return;
    const n = stars.length;
    const max = Math.min(Math.max(width * 0.2, 96), 210);
    const gap = 22 + max * 0.08;
    // Spread wide on desktop, tall on phones.
    const wide = width > 700;
    const [sx, sy] = wide ? [1.5, 1] : [0.8, 1.3];
    const [px, py] = wide ? [0.995, 0.97] : [0.97, 0.995];

    // Rank 0 is the largest; sizes ease down the ranking to a third of that.
    nodes = stars.map((el, i) => {
      const t = n > 1 ? i / (n - 1) : 0;
      const size = max * (1 - 0.66 * Math.pow(t, 0.85));
      const r = i ? max * 0.7 * Math.sqrt(i) : 0;
      return { el, size, x: Math.cos(i * GOLDEN) * r * sx, y: Math.sin(i * GOLDEN) * r * sy };
    });

    // Push overlapping stars apart (the smaller one moves more), while pulling the group in.
    for (let it = 0; it < 300; it++) {
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const a = nodes[i], b = nodes[j];
          let dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.hypot(dx, dy) || 0.01;
          const need = (a.size + b.size) / 2 + gap;
          if (d < need) {
            const push = (need - d) / d, wa = b.size / (a.size + b.size), wb = 1 - wa;
            dx *= push; dy *= push;
            if (i) { a.x -= dx * wa; a.y -= dy * wa; }
            b.x += dx * (i ? wb : 1); b.y += dy * (i ? wb : 1);
          }
        }
      }
      for (const p of nodes.slice(1)) { p.x *= px; p.y *= py; }
    }

    // Fit the width, then center.
    const pad = 16;
    let minX = Math.min(...nodes.map((p) => p.x - p.size / 2)), maxX = Math.max(...nodes.map((p) => p.x + p.size / 2));
    const k = Math.min(1, (width - pad * 2) / (maxX - minX));
    for (const p of nodes) { p.x *= k; p.y *= k; p.size *= k; }
    minX *= k; maxX *= k;
    const minY = Math.min(...nodes.map((p) => p.y - p.size / 2)), maxY = Math.max(...nodes.map((p) => p.y + p.size / 2));
    const ox = width / 2 - (minX + maxX) / 2, oy = pad - minY;
    const height = maxY - minY + pad * 2 + 40;
    for (const p of nodes) {
      p.x += ox; p.y += oy;
      Object.assign(p.el.style, { width: `${p.size}px`, height: `${p.size}px`, left: `${p.x - p.size / 2}px`, top: `${p.y - p.size / 2}px` });
    }
    root.style.height = `${height}px`;
    root.classList.add("laid-out");
    drawSky(height);
  }

  // Each star links to the nearest star ranked above it; specks fill the space between.
  function drawSky(height) {
    sky.setAttribute("viewBox", `0 0 ${width} ${height}`);
    sky.replaceChildren();
    const rand = rng(7);
    for (let i = 0; i < Math.round((width * height) / 9000); i++) {
      const c = document.createElementNS(NS, "circle");
      c.setAttribute("cx", (rand() * width).toFixed(1));
      c.setAttribute("cy", (rand() * height).toFixed(1));
      c.setAttribute("r", (0.6 + rand() * 1.2).toFixed(2));
      c.style.animationDelay = `${(-rand() * 4).toFixed(2)}s`;
      sky.append(c);
    }
    links = nodes.slice(1).map((p, i) => {
      const from = nodes.slice(0, i + 1).reduce((a, b) => (Math.hypot(b.x - p.x, b.y - p.y) < Math.hypot(a.x - p.x, a.y - p.y) ? b : a));
      const line = document.createElementNS(NS, "line");
      sky.append(line);
      return { a: from, b: p, line };
    });
    place(0);
  }

  // Stars drift a few pixels; the lines follow.
  function place(time) {
    for (const [i, p] of nodes.entries()) {
      p.dx = reduce ? 0 : Math.sin(time * 0.0006 + i * 1.7) * 5;
      p.dy = reduce ? 0 : Math.cos(time * 0.0005 + i * 2.3) * 5;
      p.el.style.transform = `translate(${p.dx.toFixed(2)}px, ${p.dy.toFixed(2)}px)`;
    }
    for (const { a, b, line } of links) {
      line.setAttribute("x1", (a.x + a.dx).toFixed(1)); line.setAttribute("y1", (a.y + a.dy).toFixed(1));
      line.setAttribute("x2", (b.x + b.dx).toFixed(1)); line.setAttribute("y2", (b.y + b.dy).toFixed(1));
    }
  }

  // Hovering a star lights the lines that touch it.
  for (const el of stars) {
    const lit = (on) => links.forEach((l) => l.line.classList.toggle("lit", on && (l.a.el === el || l.b.el === el)));
    el.addEventListener("pointerenter", () => lit(true));
    el.addEventListener("pointerleave", () => lit(false));
    el.addEventListener("focus", () => lit(true));
    el.addEventListener("blur", () => lit(false));
  }

  let visible = false;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(root);
  new ResizeObserver(() => { if (Math.abs(root.clientWidth - width) > 2) layout(); }).observe(root);
  layout();
  if (!reduce) (function frame(t) { if (visible) place(t); requestAnimationFrame(frame); })(0);
}
