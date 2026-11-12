import { getDemoMode } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const mode = await getDemoMode();
  const ok = mode !== "broken";
  const body = ok
    ? "<!doctype html><title>Checkout</title><h1>Checkout</h1><p>Your basket is ready.</p>"
    : "<!doctype html><title>Error</title><h1>500: checkout unavailable</h1>";
  return new Response(body, {
    status: ok ? 200 : 500,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
