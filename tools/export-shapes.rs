// Prints every gpui-material shape as an SVG path in a 0..100 box, as JSON. Source of
// src/assets/shape-paths.js. To run, copy it into KiiteShell/crates/gpui-material/examples/:
//
//   cargo run -q --example export-shapes > shapes.json
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
