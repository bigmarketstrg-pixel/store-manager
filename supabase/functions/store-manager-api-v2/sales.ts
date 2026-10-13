import type { Hono } from "npm:hono@4.10.0";
import type { AppUser } from "../_shared/auth.ts";
import { sql } from "../_shared/db.ts";
import { asDate, asId, asInt, cleanText, HttpError } from "../_shared/http.ts";
import { lockSale, saleNumbers, updateSale } from "../_shared/sale-sync.ts";

type Api = Hono<{ Variables: { user: AppUser } }>;
const groups = new Set(["day", "month", "business", "category", "subcategory", "brand", "product", "channel", "payment"]);

function groupExpression(group: string) {
  if (group === "day") return sql`sale_date::text`;
  if (group === "month") return sql`to_char(sale_date, 'YYYY-MM')`;
  const field = group === "product" ? "product_name" : group;
  const fallback = ["business", "channel", "payment"].includes(group) ? "기타" : "미분류";
  return sql`COALESCE(NULLIF(${sql(field)}, ''), ${fallback})`;
}

function summaryWhere(q: Record<string, string>) {
  let where = sql`TRUE`;
  if (q.start) where = sql`${where} AND sale_date >= ${asDate(q.start)}`;
  if (q.end) where = sql`${where} AND sale_date <= ${asDate(q.end)}`;
  if (q.start && q.end && q.start > q.end) throw new HttpError(400, "조회 기간을 확인해주세요.");
  if (q.business) where = sql`${where} AND business = ${q.business}`;
  return where;
}

const transactionCount = sql`COUNT(DISTINCT (NULLIF(transaction_no, ''),
  CASE WHEN COALESCE(transaction_no, '') = '' THEN id END))::int`;
const percent = (part: number, whole: number) => whole ? Math.round(part / whole * 1000) / 10 : 0;

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
        const amounts = saleNumbers(quantity, product.cost_price, price);
        const sale = (await tx`INSERT INTO public.sales (transaction_no, sale_date, product_id,
          product_name, business, category, subcategory, brand, cost_price, sale_price,
          quantity, total, channel, payment, memo, created_by)
          VALUES (${no}, ${date}, ${id}, ${product.name}, ${product.business},
          ${product.category}, ${product.subcategory}, ${product.brand}, ${product.cost_price},
          ${price}, ${quantity}, ${amounts.total}, ${cleanText(item.channel)},
          ${cleanText(item.payment)}, ${memo}, ${c.get("user").id}) RETURNING id`)[0];
        await tx`INSERT INTO public.stock_history (transaction_no, record_date,
          product_id, product_name, business, category, subcategory, brand, io_type,
          quantity, cost_price, memo, created_by, sale_id)
          VALUES (${no}, ${date}, ${id}, ${product.name}, ${product.business},
          ${product.category}, ${product.subcategory}, ${product.brand}, '출고',
          ${quantity}, ${product.cost_price}, ${memo}, ${c.get("user").id}, ${sale.id})`;
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

  app.patch("/api/sales/:id", async (c) => {
    const id = asId(c.req.param("id"));
    const body = await c.req.json();
    return c.json(await sql.begin(tx => updateSale(tx, id, body)));
  });

  app.delete("/api/sales/:id", async (c) => {
    const id = asId(c.req.param("id"));
    await sql.begin(async (tx) => {
      const { sale, history } = await lockSale(tx, id);
      if (sale.product_id) await tx`UPDATE public.products SET stock = stock + ${history.quantity},
        updated_at = now() WHERE id = ${sale.product_id}`;
      await tx`DELETE FROM public.stock_history WHERE sale_id = ${id}`;
      await tx`DELETE FROM public.sales WHERE id = ${id}`;
    });
    return c.json({ ok: true });
  });

  app.get("/api/sales/summary", async (c) => {
    const q = c.req.query();
    const group = groups.has(q.group_by) ? q.group_by : "day";
    const grouped = await sql`WITH filtered AS (
      SELECT * FROM public.sales WHERE ${summaryWhere(q)}
    ), grouped AS (
      SELECT ${groupExpression(group)} AS key, SUM(total) AS total,
        SUM(COALESCE(cost_price, 0)::bigint * quantity) AS cost_total,
        ${transactionCount} AS count, COUNT(*)::int AS line_count,
        SUM(quantity) AS quantity FROM filtered GROUP BY 1
    ) SELECT grouped.*, (SELECT ${transactionCount} FROM filtered) AS overall_count
      FROM grouped`;
    const rows = grouped.map((row) => ({
      key: String(row.key), total: Number(row.total), cost_total: Number(row.cost_total),
      profit: Number(row.total) - Number(row.cost_total), count: Number(row.count),
      line_count: Number(row.line_count), quantity: Number(row.quantity),
      overall_count: Number(row.overall_count),
    }));
    const revenue = rows.reduce((sum, row) => sum + row.total, 0);
    const profit = rows.reduce((sum, row) => sum + row.profit, 0);
    const quantity = rows.reduce((sum, row) => sum + row.quantity, 0);
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

  app.get("/api/sales/summary/details", async (c) => {
    const q = c.req.query();
    if (!groups.has(q.group_by) || q.group_key === undefined) {
      throw new HttpError(400, "집계 항목을 확인해주세요.");
    }
    let where = sql`${summaryWhere(q)} AND ${groupExpression(q.group_by)} = ${q.group_key}`;
    if (q.snapshot_id) where = sql`${where} AND id <= ${asId(q.snapshot_id)}`;
    const limit = Math.max(1, Math.min(asInt(q.limit, 100), 1000));
    const before = q.before_id ? asId(q.before_id) : null;
    return c.json(await sql.begin("isolation level repeatable read read only", async (tx) => {
      const aggregate = (await tx`SELECT ${transactionCount} AS count, COUNT(*)::int AS line_count,
        COALESCE(SUM(quantity), 0) AS quantity, COALESCE(SUM(total), 0) AS total,
        COALESCE(SUM(COALESCE(cost_price, 0)::bigint * quantity), 0) AS cost_total,
        MAX(id) AS max_id FROM public.sales WHERE ${where}`)[0];
      const total = Number(aggregate.total);
      const cost = Number(aggregate.cost_total);
      const rows = await tx`WITH filtered AS (SELECT * FROM public.sales WHERE ${where})
        SELECT filtered.id, transaction_no, sale_date::text AS sale_date, product_name,
          business, category, subcategory, brand, cost_price, sale_price, quantity,
          total, channel, payment, memo, COALESCE(u.name, '') AS staff_name
        FROM filtered LEFT JOIN public.users u ON u.id = filtered.created_by
        WHERE ${before === null ? sql`TRUE` : sql`filtered.id < ${before}`}
        ORDER BY filtered.id DESC LIMIT ${limit + 1}`;
      const hasMore = rows.length > limit;
      const items = rows.slice(0, limit);
      return {
        items,
        summary: { count: Number(aggregate.count), line_count: Number(aggregate.line_count),
          quantity: Number(aggregate.quantity), total, cost_total: cost, profit: total - cost,
          margin_rate: percent(total - cost, total) },
        snapshot_id: aggregate.max_id,
        next_before_id: hasMore ? items[items.length - 1].id : null,
      };
    }));
  });
}
