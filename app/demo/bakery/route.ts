// A sample customer site ("Maya's Bakery") that the demo seller speeds up.
// slow  = 4.5 s server delay (the problem)       partial = 2.2 s (half-done fix)
// fast  = the honest fix
// gamed = fast, but most content deleted (cheat)  broken = fast homepage, checkout returns 500
import { getDemoMode } from "@/lib/store";

export const dynamic = "force-dynamic";

const PRODUCTS = [
  ["Sourdough loaf", "Naturally leavened over 36 hours with stone-ground flour, baked dark for a deep, crackling crust and an open, tangy crumb."],
  ["Butter croissant", "Laminated by hand with cultured butter across three days, giving dozens of crisp, honeycombed layers in every bite."],
  ["Cardamom bun", "Soft enriched dough twisted with freshly ground cardamom and brown sugar, finished with a light pearl sugar glaze."],
  ["Seeded rye", "A dense, nutty rye packed with sunflower, flax and pumpkin seeds that keeps fresh for a week and toasts beautifully."],
  ["Lemon tart", "Short almond pastry filled with a sharp, silky lemon curd and topped with torched Italian meringue."],
  ["Chocolate babka", "Rich brioche rolled with dark chocolate and cocoa, braided, baked and brushed with syrup for a glossy finish."],
];

function page(full: boolean) {
  const items = (full ? PRODUCTS : PRODUCTS.slice(0, 1))
    .map(([name, desc]) => `<article><h2>${name}</h2>${full ? `<p>${desc}</p>` : ""}<a href="/demo/bakery/checkout">Order</a></article>`)
    .join("");
  const intro = full
    ? `<p>Maya's Bakery has baked by hand in the same small kitchen since 2014. Everything is made in small batches each morning from organic flour, local butter and seasonal fruit. Order before noon for same-day pickup, or choose next-day delivery anywhere in the city. We bake for birthdays, weddings and office breakfasts, and our wholesale bread is served in twelve neighbourhood cafes.</p>
       <p>Every loaf is shaped by hand and proved slowly, because time is the most important ingredient in good bread. If you have allergies, ask us: we label every product clearly and keep a separate area for nut-free baking.</p>`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Maya's Bakery</title>
<style>body{font-family:Georgia,serif;margin:0;background:#fdf8f0;color:#3b2a1a}header{background:#7a4b22;color:#fff;padding:28px 20px}
h1{margin:0;font-size:30px}main{max-width:760px;margin:auto;padding:20px}article{background:#fff;border:1px solid #ecdcc4;border-radius:10px;padding:14px 16px;margin:12px 0}
h2{margin:0 0 6px;font-size:20px}a{color:#7a4b22;font-weight:bold}</style></head>
<body><header><h1>Maya's Bakery</h1><p>Fresh bread, baked every morning.</p></header><main>${intro}${items}</main></body></html>`;
}

export async function GET() {
  const mode = await getDemoMode();
  if (mode === "slow") await new Promise((r) => setTimeout(r, 4500));
  if (mode === "partial") await new Promise((r) => setTimeout(r, 2200));
  return new Response(page(mode !== "gamed"), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
