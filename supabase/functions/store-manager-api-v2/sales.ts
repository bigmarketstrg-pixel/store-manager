import type { Hono } from "npm:hono@4.10.0";
import type { AppUser } from "../_shared/auth.ts";
import { sql } from "../_shared/db.ts";
import { asDate, asId, asInt, cleanText, HttpError } from "../_shared/http.ts";

type Api = Hono<{ Variables: { user: AppUser } }>;
const groups = new Set(["day", "month", "business", "category", "subcategory", "brand", "product", "channel", "payment"]);

function groupKey(sale: Record<string, unknown>, group: string): string {
  if (group === "day") return String(sale.sale_date);
  if (group === "month") return String(sale.sale_date).slice(0, 7);
  if (group === "product") return String(sale.product_name ?? "");
  const field = group === "business" || group === "channel" || group === "payment" ? group : group;
  return String(sale[field] || (field === "business" || field === "channel" || field === "payment" ? "기타" : "미분류"));
}

export function registerSaleRoutes(app: Api) {
  app.post("/api/sales", async (c) => {
    const body = await c.req.json();
    const date = asDate(body.sale_date);
    if (!Array.isArray(body.items) || !body.items.length) throw new HttpError(400, "판매할 상품을 추가해주세요.");
    const result = await sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(42101)`;
      const last = (await tx`SELECT transaction_no FROM public.sales ORDER BY id DESC LIMIT 1`)[0];
      const next = last ? asInt(String(last.transaction_no).slice(1)) + 1 : 1;
      const no = `T${String(next).padStart(6, "0")}`;
      for (const item of body.items) {
        const id = asInt(item.product_id);
        const quantity = asInt(item.quantity);
        const price = asInt(item.sale_price);
        if (quantity <= 0 || price < 0) throw new HttpError(400, "판매 수량과 판매가를 확인해주세요.");
        const product = (await tx`UPDATE public.products SET stock = stock - ${quantity},
          updated_at = now() WHERE id = ${id} AND stock >= ${quantity} RETURNING *`)[0];
        if (!product) {
          const existing = (await tx`SELECT name, stock FROM public.products WHERE id = ${id}`)[0];
          if (!existing) throw new HttpError(404, `상품 ID ${id}를 찾을 수 없습니다.`);
          throw new HttpError(400, `${existing.name} 재고 부족 (현재: ${existing.stock}개)`);
        }
        const memo = item.memo ?? null;
        await tx`INSERT INTO public.sales (transaction_no, sale_date, product_id,
          product_name, business, category, subcategory, brand, cost_price, sale_price,
          quantity, total, channel, payment, memo, created_by)
          VALUES (${no}, ${date}, ${id}, ${product.name}, ${product.business},
          ${product.category}, ${product.subcategory}, ${product.brand}, ${product.cost_price},
          ${price}, ${quantity}, ${price * quantity}, ${cleanText(item.channel)},
          ${cleanText(item.payment)}, ${memo}, ${c.get("user").id})`;
        await tx`INSERT INTO public.stock_history (transaction_no, record_date,
          product_id, product_name, business, category, subcategory, brand, io_type,
          quantity, cost_price, memo, created_by)
          VALUES (${no}, ${date}, ${id}, ${product.name}, ${product.business},
          ${product.category}, ${product.subcategory}, ${product.brand}, '출고',
          ${quantity}, ${product.cost_price}, ${memo}, ${c.get("user").id})`;
      }
      return { ok: true, transaction_no: no, count: body.items.length };
    });
    return c.json(result);
  });

  app.get("/api/sales", async (c) => {
    const q = c.req.query();
    let where = sql`TRUE`;
    if (q.start) where = sql`${where} AND sale_date >= ${asDate(q.start)}`;
    if (q.end) where = sql`${where} AND sale_date <= ${asDate(q.end)}`;
    if (q.business) where = sql`${where} AND business = ${q.business}`;
    if (q.product_name) where = sql`${where} AND product_name ILIKE ${`%${q.product_name}%`}`;
    if (q.channel) where = sql`${where} AND channel = ${q.channel}`;
    if (q.payment) where = sql`${where} AND payment = ${q.payment}`;
    const limit = Math.max(1, Math.min(asInt(q.limit, 200), 1000));
    return c.json(await sql`SELECT id, transaction_no, sale_date::text AS sale_date,
      product_id, product_name, business, category, subcategory, brand, cost_price,
      sale_price, quantity, total, channel, payment, memo, created_by, created_at
      FROM public.sales WHERE ${where} ORDER BY sale_date DESC, id DESC LIMIT ${limit}`);
  });

  app.delete("/api/sales/:id", async (c) => {
    const id = asId(c.req.param("id"));
    await sql.begin(async (tx) => {
      const sale = (await tx`SELECT * FROM public.sales WHERE id = ${id} FOR UPDATE`)[0];
      if (!sale) throw new HttpError(404, "판매 기록을 찾을 수 없습니다.");
      if (sale.product_id) await tx`UPDATE public.products SET stock = stock + ${sale.quantity},
        updated_at = now() WHERE id = ${sale.product_id}`;
      await tx`DELETE FROM public.stock_history WHERE id = (
        SELECT id FROM public.stock_history WHERE transaction_no = ${sale.transaction_no}
          AND product_id = ${sale.product_id} AND io_type = '출고'
          AND quantity = ${sale.quantity} AND cost_price = ${sale.cost_price}
          AND memo IS NOT DISTINCT FROM ${sale.memo}
        ORDER BY id ASC LIMIT 1)`;
      await tx`DELETE FROM public.sales WHERE id = ${id}`;
    });
    return c.json({ ok: true });
  });

  app.get("/api/sales/summary", async (c) => {
    const q = c.req.query();
    const group = groups.has(q.group_by) ? q.group_by : "day";
    let where = sql`TRUE`;
    if (q.start) where = sql`${where} AND sale_date >= ${asDate(q.start)}`;
    if (q.end) where = sql`${where} AND sale_date <= ${asDate(q.end)}`;
    if (q.business) where = sql`${where} AND business = ${q.business}`;
    const sales = await sql`SELECT sale_date::text AS sale_date, product_name, business,
      category, subcategory, brand, channel, payment, cost_price, quantity, total
      FROM public.sales WHERE ${where}`;
    const aggregated = new Map<string, { key: string; total: number; cost_total: number; profit: number; count: number; quantity: number }>();
    for (const sale of sales) {
      const key = groupKey(sale, group);
      const row = aggregated.get(key) ?? { key, total: 0, cost_total: 0, profit: 0, count: 0, quantity: 0 };
      const cost = asInt(sale.cost_price) * asInt(sale.quantity);
      row.total += asInt(sale.total);
      row.cost_total += cost;
      row.profit += asInt(sale.total) - cost;
      row.count++;
      row.quantity += asInt(sale.quantity);
      aggregated.set(key, row);
    }
    const rows = [...aggregated.values()];
    const revenue = rows.reduce((sum, row) => sum + row.total, 0);
    const profit = rows.reduce((sum, row) => sum + row.profit, 0);
    const quantity = rows.reduce((sum, row) => sum + row.quantity, 0);
    const percent = (part: number, whole: number) => whole ? Math.round(part / whole * 1000) / 10 : 0;
    return c.json(rows.map((row) => ({ ...row,
      margin_rate: percent(row.profit, row.total),
      revenue_percent: percent(row.total, revenue),
      profit_percent: percent(row.profit, profit),
      quantity_percent: percent(row.quantity, quantity),
      avg_sale: row.quantity ? Math.round(row.total / row.quantity) : 0,
      avg_profit: row.quantity ? Math.round(row.profit / row.quantity) : 0,
    })).sort((a, b) => group === "day" || group === "month"
      ? b.key.localeCompare(a.key) : a.key.localeCompare(b.key)));
  });
}
