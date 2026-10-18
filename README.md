# Kiite site

The website and documentation for [KiiteShell](https://github.com/Kiite-Org/KiiteShell).

The landing page lives here. The docs are generated from KiiteShell's `docs/` folder and some
README sections, so edit those in KiiteShell.

## Working on it

Needs Node 20+ and a KiiteShell checkout at `../KiiteShell` (or set `KIITE_DIR`).

```sh
npm install
npm run dev      # http://localhost:4173, rebuilds when src/ or KiiteShell's docs change
npm run build    # writes dist/
```

## Layout

| Path | What it is |
|------|------------|
| `build.js` | The build: the docs navigation (`NAV`), Markdown rendering, templates, search index |
| `serve.js` | The development server |
| `src/index.html` | The landing page |
| `src/assets/shapes.js` | M3 shapes: clip paths, the `<m3-shape>` element, and spring morphs |
| `src/assets/shape-paths.js` | The 35 shape outlines, exported from `gpui-material` |
| `src/assets/base.css` | Color tokens and shared styles |
| `src/assets/landing.*`, `src/assets/docs.*` | Each half's styles and scripts |
| `tools/export-shapes.rs` | Regenerates `shape-paths.js` from `gpui-material` |
| `tools/og-card.html`, `tools/og-image.sh` | The link preview image (`src/assets/og.png`) and its renderer |

### Adding a docs page

Add the file to KiiteShell's `docs/`, then add it to `NAV` in `build.js` with a slug, an icon
([Material Symbols](https://fonts.google.com/icons) name) and a one-line blurb. Links to other
docs and README sections become site links; other repo links go to GitHub.

### Shapes

The shapes are the shell's own (from `gpui-material`):

- `<m3-shape shape="Cookie9Sided">`: a filled shape in `currentColor`. Add `hover="Flower"`
  to morph on hover, or `morph="Flower,Burst" interval="2400"` to cycle.
- `data-clip="Cookie9Sided"` on any element to clip it, plus `data-clip-hover="Flower"` to
  morph the clip on hover.

## Deploying

`.github/workflows/pages.yml` deploys to GitHub Pages on pushes to `main`, daily, and when
KiiteShell's docs change.

KiiteShell is private, so two deploy keys connect the repos:

- `KIITESHELL_DEPLOY_KEY` (secret here, read-only on KiiteShell): the build reads the docs.
- `SITE_DEPLOY_KEY` (secret on KiiteShell, write access here): KiiteShell's `site-docs`
  workflow force-pushes a `docs-sync` branch here when its docs change, which starts a build.
