import type { Hono } from "npm:hono@4.10.0";
import type { AppUser } from "../_shared/auth.ts";
import { sql } from "../_shared/db.ts";
import { asDate, asId, asInt, cleanText, HttpError } from "../_shared/http.ts";

type Api = Hono<{ Variables: { user: AppUser } }>;

function status(total: number, paid: number): string {
  return paid <= 0 ? "미수" : paid >= total ? "완납" : "일부입금";
}

async function outbound(id: number) {
  const row = (await sql`SELECT o.id, o.transaction_no, o.outbound_date::text AS outbound_date,
    o.dealer_name, o.total, o.paid_amount, o.payment_status, o.memo, o.created_by,
    o.created_at, u.name AS staff_name FROM public.wholesale_outbounds o
    LEFT JOIN public.users u ON u.id = o.created_by WHERE o.id = ${id}`)[0];
  if (!row) throw new HttpError(404, "도매 출고 기록을 찾을 수 없습니다.");
  const items = await sql`SELECT id, product_id, product_name, business, category,
    subcategory, brand, cost_price, sale_price, quantity, total
    FROM public.wholesale_outbound_items WHERE outbound_id = ${id} ORDER BY id`;
  return { ...row, balance: Math.max(row.total - row.paid_amount, 0), items };
}

export function registerWholesaleRoutes(app: Api) {
  app.post("/api/wholesale-outbounds", async (c) => {
    const body = await c.req.json();
    const dealer = cleanText(body.dealer_name);
    if (!dealer) throw new HttpError(400, "도매처명을 입력해주세요.");
    if (!Array.isArray(body.items) || !body.items.length) throw new HttpError(400, "출고할 상품을 추가해주세요.");
    const date = asDate(body.outbound_date);
    const id = await sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(42102)`;
      const last = (await tx`SELECT transaction_no FROM public.wholesale_outbounds ORDER BY id DESC LIMIT 1`)[0];
      const next = last ? asInt(String(last.transaction_no).slice(1)) + 1 : 1;
      const no = `W${String(next).padStart(6, "0")}`;
      const header = (await tx`INSERT INTO public.wholesale_outbounds
        (transaction_no, outbound_date, dealer_name, total, paid_amount,
        payment_status, memo, created_by)
        VALUES (${no}, ${date}, ${dealer}, 0, 0, '미수', ${body.memo ?? null}, ${c.get("user").id})
        RETURNING id`)[0];
      let total = 0;
      for (const item of body.items) {
        const quantity = asInt(item.quantity);
        if (quantity <= 0) continue;
        const productId = asInt(item.product_id);
        const price = asInt(item.sale_price);
        if (price < 0) throw new HttpError(400, "판매가를 확인해주세요.");
        const product = (await tx`UPDATE public.products SET stock = stock - ${quantity},
          updated_at = now() WHERE id = ${productId} AND stock >= ${quantity} RETURNING *`)[0];
        if (!product) {
          const existing = (await tx`SELECT name, stock FROM public.products WHERE id = ${productId}`)[0];
          if (!existing) throw new HttpError(404, `상품 ID ${productId}를 찾을 수 없습니다.`);
          throw new HttpError(400, `${existing.name} 재고 부족 (현재: ${existing.stock}개)`);
        }
        const lineTotal = price * quantity;
        total += lineTotal;
        await tx`INSERT INTO public.wholesale_outbound_items
          (outbound_id, product_id, product_name, business, category, subcategory,
          brand, cost_price, sale_price, quantity, total)
          VALUES (${header.id}, ${productId}, ${product.name}, ${product.business},
            ${product.category}, ${product.subcategory}, ${product.brand},
            ${product.cost_price}, ${price}, ${quantity}, ${lineTotal})`;
        const memo = `도매처: ${dealer}${body.memo ? ` / ${body.memo}` : ""}`;
        await tx`INSERT INTO public.stock_history
          (transaction_no, record_date, product_id, product_name, business,
           category, subcategory, brand, io_type, quantity, cost_price, memo, created_by)
          VALUES (${no}, ${date}, ${productId}, ${product.name}, ${product.business},
            ${product.category}, ${product.subcategory}, ${product.brand}, '출고',
            ${quantity}, ${product.cost_price}, ${memo}, ${c.get("user").id})`;
      }
      if (total <= 0) throw new HttpError(400, "출고 수량을 입력해주세요.");
      const paid = Math.min(Math.max(asInt(body.paid_amount), 0), total);
      await tx`UPDATE public.wholesale_outbounds SET total = ${total},
        paid_amount = ${paid}, payment_status = ${status(total, paid)} WHERE id = ${header.id}`;
      return header.id as number;
    });
    return c.json(await outbound(id));
  });

  app.get("/api/wholesale-outbounds", async (c) => {
    const q = c.req.query();
    let where = sql`TRUE`;
    if (q.start) where = sql`${where} AND o.outbound_date >= ${asDate(q.start)}`;
    if (q.end) where = sql`${where} AND o.outbound_date <= ${asDate(q.end)}`;
    if (q.dealer_name) where = sql`${where} AND o.dealer_name ILIKE ${`%${q.dealer_name}%`}`;
    if (q.payment_status_filter) where = sql`${where} AND o.payment_status = ${q.payment_status_filter}`;
    const headers = await sql`SELECT o.id, o.transaction_no,
      o.outbound_date::text AS outbound_date, o.dealer_name, o.total, o.paid_amount,
      o.payment_status, o.memo, o.created_by, o.created_at, u.name AS staff_name
      FROM public.wholesale_outbounds o LEFT JOIN public.users u ON u.id = o.created_by
      WHERE ${where} ORDER BY o.outbound_date DESC, o.id DESC LIMIT 300`;
    if (!headers.length) return c.json([]);
    const items = await sql`SELECT id, outbound_id, product_id, product_name,
      business, category, subcategory, brand, cost_price, sale_price, quantity, total
      FROM public.wholesale_outbound_items WHERE outbound_id IN ${sql(headers.map((row) => row.id))}
      ORDER BY id`;
    const byId = new Map<number, Record<string, unknown>[]>();
    for (const item of items) {
      const list = byId.get(item.outbound_id) ?? [];
      list.push(item);
      byId.set(item.outbound_id, list);
    }
    return c.json(headers.map((row) => ({ ...row,
      balance: Math.max(row.total - row.paid_amount, 0),
      items: byId.get(row.id) ?? [],
    })));
  });

  app.patch("/api/wholesale-outbounds/:id", async (c) => {
    const id = asId(c.req.param("id"));
    const body = await c.req.json();
    await sql.begin(async (tx) => {
      const row = (await tx`SELECT total FROM public.wholesale_outbounds WHERE id = ${id} FOR UPDATE`)[0];
      if (!row) throw new HttpError(404, "도매 출고 기록을 찾을 수 없습니다.");
      if (Object.hasOwn(body, "paid_amount")) {
        const paid = Math.min(Math.max(asInt(body.paid_amount), 0), row.total);
        await tx`UPDATE public.wholesale_outbounds SET paid_amount = ${paid},
          payment_status = ${status(row.total, paid)} WHERE id = ${id}`;
      }
      if (Object.hasOwn(body, "memo")) {
        await tx`UPDATE public.wholesale_outbounds SET memo = ${body.memo} WHERE id = ${id}`;
      }
    });
    return c.json(await outbound(id));
  });

  app.delete("/api/wholesale-outbounds/:id", async (c) => {
    if (c.get("user").role !== "admin") throw new HttpError(403, "관리자만 삭제할 수 있습니다.");
    const id = asId(c.req.param("id"));
    await sql.begin(async (tx) => {
      const header = (await tx`SELECT transaction_no FROM public.wholesale_outbounds
        WHERE id = ${id} FOR UPDATE`)[0];
      if (!header) throw new HttpError(404, "도매 출고 기록을 찾을 수 없습니다.");
      const items = await tx`SELECT product_id, quantity FROM public.wholesale_outbound_items
        WHERE outbound_id = ${id}`;
      for (const item of items) {
        if (item.product_id) await tx`UPDATE public.products SET stock = stock + ${item.quantity},
          updated_at = now() WHERE id = ${item.product_id}`;
      }
      await tx`DELETE FROM public.stock_history WHERE transaction_no = ${header.transaction_no}`;
      await tx`DELETE FROM public.wholesale_outbound_items WHERE outbound_id = ${id}`;
      await tx`DELETE FROM public.wholesale_outbounds WHERE id = ${id}`;
    });
    return c.json({ ok: true });
  });
}
