Deno.env.set("SUPABASE_DB_URL", "postgresql://test:test@localhost/test");
const { default: app } = await import("./index.ts");

function equal(actual: unknown, expected: unknown) {
  if (actual !== expected) throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
}

Deno.test("health endpoint keeps its function prefix", async () => {
  const response = await app.request("http://localhost/store-manager-api-v2");
  equal(response.status, 200);
});

Deno.test("product data requires the existing app token", async () => {
  const response = await app.request("http://localhost/store-manager-api-v2/api/products");
  equal(response.status, 401);
  equal((await response.json()).detail, "인증이 필요합니다.");
});

Deno.test("preflight permits the deployed Cloudflare Pages origin", async () => {
  const response = await app.request("http://localhost/store-manager-api-v2/api/products", {
    method: "OPTIONS",
    headers: { origin: "https://store-manager-3q1.pages.dev" },
  });
  equal(response.status, 204);
  equal(response.headers.get("access-control-allow-origin"), "https://store-manager-3q1.pages.dev");
});

Deno.test("preflight does not allow unrelated origins", async () => {
  const response = await app.request("http://localhost/store-manager-api-v2/api/products", {
    method: "OPTIONS",
    headers: { origin: "https://example.com" },
  });
  equal(response.status, 204);
  equal(response.headers.get("access-control-allow-origin"), null);
});
