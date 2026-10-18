# Kiite site

The website and documentation for [KiiteShell](https://github.com/Kiite-Org/KiiteShell).

The landing page is hand-written. The docs are generated from KiiteShell itself: every page in
its `docs/` folder, plus the install, running, configuration, keybinding, IPC, Kit and project
structure sections of its README. Edit those in KiiteShell, not here.

## Working on it

You need Node 20 or newer, and a KiiteShell checkout next to this one (`../KiiteShell`), or
anywhere else with `KIITE_DIR` pointing at it.

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
| `src/assets/base.css` | Colour tokens and shared styles |
| `src/assets/landing.*`, `src/assets/docs.*` | Each half's styles and scripts |
| `tools/export-shapes.rs` | Regenerates `shape-paths.js` from `gpui-material` |

### Adding a docs page

Add the Markdown file to KiiteShell's `docs/`, then add an entry for it to `NAV` in
`build.js` with a slug, an icon (a [Material Symbols](https://fonts.google.com/icons) name)
and a one-line blurb. Links between docs files, and to README sections, are rewritten to the
site's pages; links to anything else in the repo go to GitHub.

### Shapes

Every shape on the site is one of the shapes the shell draws. Use them through:

- `<m3-shape shape="Cookie9Sided">`: a filled shape in `currentColor`. Add `hover="Flower"`
  to morph on hover, or `morph="Flower,Burst" interval="2400"` to cycle.
- `data-clip="Cookie9Sided"` on any element to clip it, plus `data-clip-hover="Flower"` to
  morph the clip on hover.

## Deploying

`.github/workflows/pages.yml` builds the site and publishes it to GitHub Pages on every push
to `main`, once a day, and when KiiteShell sends a `docs-updated` repository dispatch. Because
KiiteShell is private, the workflow reads it with a deploy key stored in the
`KIITESHELL_DEPLOY_KEY` secret.
