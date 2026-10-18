// Background shapes that drift like caelestia's dashboard media tab, and merge and morph like
// Kiite's lava lamp. Each shape is a signed distance field (computed once, stored in a texture);
// same-color shapes are combined with a smooth minimum, and a morph blends two fields.
import { SHAPES } from "./shape-paths.js";

// Shape pool, from caelestia's media tab.
const POOL = ["Circle", "Cookie4Sided", "Cookie6Sided", "Cookie7Sided", "Cookie9Sided", "Cookie12Sided", "Sunny",
  "VerySunny", "SoftBurst", "Pentagon", "Gem", "Arch", "Arrow", "Pill", "Triangle", "Fan", "Oval"];
// Color and opacity per layer. Shapes only merge with shapes in the same layer.
const LAYERS = [["--primary-container", 0.24], ["--secondary-container", 0.22], ["--tertiary-container", 0.22]];
const MAX_BLOBS = 48;
const CELL = 64;          // field resolution per shape
const DOMAIN = 2;         // a cell covers [-0.5, 1.5] of the shape's unit box, for room to merge
const MERGE = 44;         // fillet radius in CSS px (the lava lamp's smoothing)
const MORPH_SECONDS = 2;

const rand = (a, b) => a + Math.random() * (b - a);
const signed = (a, b) => rand(a, b) * (Math.random() < 0.5 ? -1 : 1);

// Distance fields
function outline(name, n = 220) {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", SHAPES[name]);
  const len = path.getTotalLength();
  const pts = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const p = path.getPointAtLength((i / n) * len);
    pts[i * 2] = p.x / 100;
    pts[i * 2 + 1] = p.y / 100;
  }
  return pts;
}

// Signed distance (negative inside) on a CELL×CELL grid, in units of the shape's box.
function field(pts, out, offset, stride) {
  const n = pts.length / 2;
  for (let gy = 0; gy < CELL; gy++) {
    const y = -0.5 + ((gy + 0.5) / CELL) * DOMAIN;
    for (let gx = 0; gx < CELL; gx++) {
      const x = -0.5 + ((gx + 0.5) / CELL) * DOMAIN;
      let best = Infinity, inside = false;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const ax = pts[j * 2], ay = pts[j * 2 + 1], bx = pts[i * 2], by = pts[i * 2 + 1];
        const ex = bx - ax, ey = by - ay;
        const t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey || 1)));
        const dx = x - ax - ex * t, dy = y - ay - ey * t;
        const d = dx * dx + dy * dy;
        if (d < best) best = d;
        if ((ay > y) !== (by > y) && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
      }
      out[offset + gy * stride + gx] = inside ? -Math.sqrt(best) : Math.sqrt(best);
    }
  }
}

// GL
const VERT = `#version 300 es
in vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
uniform vec2 uSize;          // CSS px
uniform float uScale;        // canvas px per CSS px
uniform sampler2D uAtlas;
uniform float uCols;
uniform int uCount;
uniform vec4 uBlob[${MAX_BLOBS}];   // x, y, size, rotation (radians)
uniform vec4 uMorph[${MAX_BLOBS}];  // shape, next shape, blend, layer
uniform vec4 uColor[4];             // rgb, opacity
uniform float uK;
out vec4 outColor;

float shapeField(float idx, vec2 q) {
  vec2 d = (q + 0.5) / ${DOMAIN.toFixed(1)};
  vec2 c = clamp(d, vec2(0.5 / ${CELL}.0), vec2(1.0 - 0.5 / ${CELL}.0));
  vec2 cell = vec2(mod(idx, uCols), floor(idx / uCols));
  return texture(uAtlas, (cell + c) / uCols).r + length(d - c) * ${DOMAIN.toFixed(1)};
}

// Kiite's circular smooth minimum: a fillet of radius k between two surfaces.
float smin(float a, float b, float k) {
  float ma = max(k - a, 0.0), mb = max(k - b, 0.0);
  return max(k, min(a, b)) - sqrt(ma * ma + mb * mb);
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uSize.y * uScale - gl_FragCoord.y) / uScale;
  vec4 dist = vec4(1e5);
  for (int i = 0; i < ${MAX_BLOBS}; i++) {
    if (i >= uCount) break;
    vec4 b = uBlob[i];
    vec2 r = p - b.xy;
    if (dot(r, r) > pow(b.z * 0.75 + uK, 2.0)) continue;
    float cs = cos(b.w), sn = sin(b.w);
    vec2 q = vec2(cs * r.x + sn * r.y, -sn * r.x + cs * r.y) / b.z + 0.5;
    vec4 m = uMorph[i];
    float f = mix(shapeField(m.x, q), shapeField(m.y, q), m.z) * b.z;
    int l = int(m.w);
    dist[l] = smin(dist[l], f, uK);
  }
  vec4 acc = vec4(0.0);
  for (int l = 0; l < 4; l++) {
    float a = clamp(0.5 - dist[l] * uScale, 0.0, 1.0) * uColor[l].a;
    acc.rgb = uColor[l].rgb * a + acc.rgb * (1.0 - a);
    acc.a = a + acc.a * (1.0 - a);
  }
  outColor = acc;
}`;

function program(gl) {
  const make = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, make(gl.VERTEX_SHADER, VERT));
  gl.attachShader(p, make(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}

function cssColor(name) {
  const hex = getComputedStyle(document.documentElement).getPropertyValue(name).trim().replace("#", "");
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
}

// Simulation
export function startLavaShapes(canvas) {
  const gl = canvas.getContext("webgl2", { premultipliedAlpha: true, antialias: false });
  if (!gl) return;

  const cols = Math.ceil(Math.sqrt(POOL.length));
  const stride = cols * CELL;
  const atlas = new Float32Array(stride * stride);
  POOL.forEach((name, i) => field(outline(name), atlas, (Math.floor(i / cols) * CELL) * stride + (i % cols) * CELL, stride));

  const prog = program(gl);
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aLoc = gl.getAttribLocation(prog, "a");
  gl.enableVertexAttribArray(aLoc);
  gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, stride, stride, 0, gl.RED, gl.FLOAT, atlas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const u = (n) => gl.getUniformLocation(prog, n);
  const U = { size: u("uSize"), scale: u("uScale"), atlas: u("uAtlas"), cols: u("uCols"), count: u("uCount"),
    blob: u("uBlob"), morph: u("uMorph"), color: u("uColor"), k: u("uK") };
  gl.uniform1i(U.atlas, 0);
  gl.uniform1f(U.cols, cols);
  gl.uniform1f(U.k, MERGE);
  // The shader has four layer slots; unused ones stay transparent.
  const colors = new Float32Array(16);
  LAYERS.forEach(([v, a], i) => colors.set([...cssColor(v), a], i * 4));
  gl.uniform4fv(U.color, colors);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  let W = 0, H = 0, scale = 1;
  let blobs = [];

  // Sizes range from small to large; shapes drift and turn slowly.
  function spawn() {
    const vmin = Math.min(W, H);
    const count = Math.max(14, Math.min(MAX_BLOBS, Math.round((W * H) / 52000)));
    blobs = Array.from({ length: count }, (_, i) => {
      const size = vmin * (0.05 + (i / count) * 0.15);
      const vx = signed(6, 24), vy = signed(6, 24);
      const shape = Math.floor(Math.random() * POOL.length);
      return {
        x: rand(0, W), y: rand(0, H), size, vx, vy, bvx: vx, bvy: vy,
        rot: rand(0, Math.PI * 2), vr: rand(-12, 12) * (Math.PI / 180),
        shape, next: shape, t: 0, nextMorph: rand(2, 9), layer: i % LAYERS.length,
      };
    });
  }

  function resize() {
    // The canvas's own size (CSS 100lvh), so a phone's address bar doesn't resize it. Small
    // height changes are ignored too; rotating or resizing the window still re-lays it out.
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (W && w === W && Math.abs(h - H) < 120) return;
    // Render below native resolution: the shapes are soft and translucent.
    scale = Math.min(devicePixelRatio || 1, 2) * 0.6;
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    gl.viewport(0, 0, canvas.width, canvas.height);
    if (!blobs.length || Math.abs(w - W) > 200 || Math.abs(h - H) > 200) { W = w; H = h; spawn(); }
    W = w; H = h;
  }
  resize();
  addEventListener("resize", resize);

  // The cursor pushes shapes away; they ease back to their own velocity.
  let mouse = null;
  addEventListener("pointermove", (e) => { mouse = [e.clientX, e.clientY]; }, { passive: true });
  document.addEventListener("pointerleave", () => { mouse = null; });

  function step(dt) {
    for (const b of blobs) {
      if (mouse) {
        const dx = b.x - mouse[0], dy = b.y - mouse[1];
        const d = Math.hypot(dx, dy) || 1, reach = b.size * 0.5 + 140;
        if (d < reach) {
          const push = (1 - d / reach) * 220 * dt;
          b.vx += (dx / d) * push;
          b.vy += (dy / d) * push;
        }
      }
      b.vx += (b.bvx - b.vx) * Math.min(1, 1.2 * dt);
      b.vy += (b.bvy - b.vy) * Math.min(1, 1.2 * dt);
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rot += b.vr * dt;

      const r = b.size * 0.75;
      if (b.x < -r) b.x = W + r; else if (b.x > W + r) b.x = -r;
      if (b.y < -r) b.y = H + r; else if (b.y > H + r) b.y = -r;

      // Now and then, morph into another shape.
      if (b.next !== b.shape) {
        b.t += dt / MORPH_SECONDS;
        if (b.t >= 1) { b.shape = b.next; b.t = 0; b.nextMorph = rand(4, 10); }
      } else if ((b.nextMorph -= dt) <= 0) {
        let n = b.shape;
        while (n === b.shape) n = Math.floor(Math.random() * POOL.length);
        b.next = n;
      }
    }
  }

  const blobData = new Float32Array(MAX_BLOBS * 4), morphData = new Float32Array(MAX_BLOBS * 4);
  function draw() {
    blobs.forEach((b, i) => {
      blobData.set([b.x, b.y, b.size, b.rot], i * 4);
      const e = b.t * b.t * (3 - 2 * b.t); // smoothstep, so morphs ease in and out
      morphData.set([b.shape, b.next, e, b.layer], i * 4);
    });
    gl.uniform2f(U.size, W, H);
    gl.uniform1f(U.scale, scale);
    gl.uniform1i(U.count, blobs.length);
    gl.uniform4fv(U.blob, blobData);
    gl.uniform4fv(U.morph, morphData);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  canvas.classList.add("ready");
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    draw();
    addEventListener("resize", draw);
    return;
  }
  let last = performance.now();
  (function frame(now) {
    const dt = Math.min(Math.max((now - last) / 1000, 0), 0.05);
    last = now;
    step(dt);
    draw();
    requestAnimationFrame(frame);
  })(last);
}
