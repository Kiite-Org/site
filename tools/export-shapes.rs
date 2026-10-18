// Prints every Material 3 Expressive shape from gpui-material as an SVG path, in a 0..100 box.
// The site's src/assets/shape-paths.js is this output, so the site draws the shell's shapes.
//
// To regenerate, copy this file into KiiteShell/crates/gpui-material/examples/ and run, from
// that crate:
//
//   cargo run -q --example export-shapes > shapes.json
//
// then turn shapes.json into shape-paths.js (`export const SHAPES = { Name: "path", ... }`).
use gpui_material::shape::MaterialShape;

fn main() {
    let mut out = String::from("{\n");
    for (i, s) in MaterialShape::ALL.iter().enumerate() {
        let c = &s.polygon().cubics;
        let f = |v: f32| format!("{:.2}", v * 100.0);
        let mut d = format!("M{} {}", f(c[0].anchor0.x), f(c[0].anchor0.y));
        for q in c {
            d += &format!(
                "C{} {} {} {} {} {}",
                f(q.control0.x), f(q.control0.y), f(q.control1.x), f(q.control1.y), f(q.anchor1.x), f(q.anchor1.y)
            );
        }
        d += "Z";
        let comma = if i + 1 < MaterialShape::ALL.len() { "," } else { "" };
        out += &format!("  \"{:?}\": \"{}\"{}\n", s, d, comma);
    }
    out += "}\n";
    print!("{out}");
}
