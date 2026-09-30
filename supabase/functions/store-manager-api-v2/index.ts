import { Hono } from "npm:hono@4.10.0";
import { authenticate, createToken, currentUser, type AppUser } from "../_shared/auth.ts";
import { sql } from "../_shared/db.ts";
import { HttpError } from "../_shared/http.ts";
import { registerUserRoutes } from "./users.ts";
import { registerExtraRoutes } from "./extras.ts";
import { registerProductWriteRoutes } from "./products.ts";
import { registerStockRoutes } from "./stock.ts";
import { registerSaleRoutes } from "./sales.ts";
import { registerWholesaleRoutes } from "./wholesale.ts";

type Variables = { user: AppUser };
const app = new Hono<{ Variables: Variables }>().basePath("/store-manager-api-v2");
const allowedOrigins = new Set([
  "https://store-manager-3q1.pages.dev",
  "http://localhost:5173",
]);

app.use("*", async (c, next) => {
  const origin = c.req.header("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    Vary: "Origin",
  };
  if (origin && allowedOrigins.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  if (c.req.method === "OPTIONS") return c.body(null, 204, headers);
  await next();
  for (const [name, value] of Object.entries(headers)) c.res.headers.set(name, value);
});

app.get("/", (c) => c.json({ message: "API 정상 작동 중" }));

app.post("/api/auth/login", async (c) => {
  const form = await c.req.parseBody();
  const result = await authenticate(String(form.username ?? ""), String(form.password ?? ""));
  if (result.status === "invalid") return c.json({ detail: "아이디 또는 비밀번호가 틀렸습니다." }, 401);
  if (result.status === "inactive") return c.json({ detail: "비활성화된 계정입니다." }, 403);
  const user = result.user;
  return c.json({ access_token: await createToken(user), token_type: "bearer", user });
});

app.use("/api/*", async (c, next) => {
  const user = await currentUser(c.req.header("authorization"));
  if (!user) return c.json({ detail: "인증이 필요합니다." }, 401);
  c.set("user", user);
  await next();
});

app.get("/api/auth/me", (c) => c.json(c.get("user")));
registerUserRoutes(app);
registerExtraRoutes(app);
registerProductWriteRoutes(app);
registerStockRoutes(app);
registerSaleRoutes(app);
registerWholesaleRoutes(app);

app.get("/api/products", async (c) => {
  const query = c.req.query();
  let where = sql`TRUE`;
  if (query.q) where = sql`${where} AND name ILIKE ${`%${query.q}%`}`;
  if (query.business) where = sql`${where} AND business = ${query.business}`;
  if (query.category) where = sql`${where} AND category ILIKE ${`%${query.category}%`}`;
  if (query.subcategory) where = sql`${where} AND subcategory ILIKE ${`%${query.subcategory}%`}`;
  if (query.brand) where = sql`${where} AND brand ILIKE ${`%${query.brand}%`}`;
  if (query.cost_min) where = sql`${where} AND cost_price >= ${Number(query.cost_min)}`;
  if (query.cost_max) where = sql`${where} AND cost_price <= ${Number(query.cost_max)}`;
  if (query.sale_min) where = sql`${where} AND sale_price >= ${Number(query.sale_min)}`;
  if (query.sale_max) where = sql`${where} AND sale_price <= ${Number(query.sale_max)}`;
  const rows = await sql`SELECT id, name, business, category, subcategory, brand,
    product_code, cost_price, sale_price, stock, note, memo
    FROM public.products WHERE ${where} ORDER BY name`;
  return c.json(rows);
});

app.get("/api/products/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isSafeInteger(id)) return c.json({ detail: "상품을 찾을 수 없습니다." }, 404);
  const rows = await sql`SELECT id, name, business, category, subcategory, brand,
    product_code, cost_price, sale_price, stock, note, memo
    FROM public.products WHERE id = ${id} LIMIT 1`;
  return rows[0] ? c.json(rows[0]) : c.json({ detail: "상품을 찾을 수 없습니다." }, 404);
});

app.onError((error, c) => {
  if (error instanceof HttpError) return c.json({ detail: error.detail }, error.status as 400);
  console.error(error);
  return c.json({ detail: "서버 오류가 발생했습니다." }, 500);
});

export default app;
