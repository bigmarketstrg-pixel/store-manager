import type { Hono } from "npm:hono@4.10.0";
import type { AppUser } from "../_shared/auth.ts";
import { sql } from "../_shared/db.ts";
import { asDate, asId, asInt, cleanBusiness, cleanText, HttpError, pick } from "../_shared/http.ts";

type Api = Hono<{ Variables: { user: AppUser } }>;

function transactionNo(prefix: "IN" | "OUT"): string {
  const now = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const random = crypto.getRandomValues(new Uint16Array(1))[0] % 1000;
  return `${prefix}${now}${String(random).padStart(prefix === "IN" ? 4 : 3, "0")}`;
}

export function registerStockRoutes(app: Api) {
  app.post("/api/products/inbound", async (c) => {
    const body = await c.req.json();
    const id = asInt(body.product_id);
    const quantity = asInt(body.quantity);
    if (quantity <= 0) throw new HttpError(400, "입고 수량을 확인해주세요.");
    const cost = asInt(body.cost_price);
    const date = asDate(body.record_date);
    return c.json(await sql.begin(async (tx) => {
      const rows = await tx`UPDATE public.products SET stock = stock + ${quantity},
        cost_price = CASE WHEN ${cost} <> 0 THEN ${cost} ELSE cost_price END,
        updated_at = now() WHERE id = ${id} RETURNING *`;
      const product = rows[0];
      if (!product) throw new HttpError(404, "상품을 찾을 수 없습니다.");
      const no = cleanText(body.transaction_no, `IN${date.replaceAll("-", "")}${id}`);
      await tx`INSERT INTO public.stock_history
        (transaction_no, record_date, product_id, product_name, business, category,
         subcategory, brand, io_type, quantity, cost_price, memo, created_by)
        VALUES (${no}, ${date}, ${id}, ${product.name}, ${product.business},
          ${product.category}, ${product.subcategory}, ${product.brand}, '입고',
          ${quantity}, ${cost}, ${body.memo ?? null}, ${c.get("user").id})`;
      return { ok: true, new_stock: product.stock };
    }));
  });

  app.post("/api/products/inbound-bulk", async (c) => {
    const body = await c.req.json();
    if (!Array.isArray(body.items) || !body.items.length) throw new HttpError(400, "입고할 품목을 입력해주세요.");
    const recordDate = asDate(body.record_date);
    const business = cleanBusiness(body.business);
    const no = cleanText(body.transaction_no, transactionNo("IN"));
    const supplier = cleanText(body.supplier_name);
    return c.json(await sql.begin(async (tx) => {
      let created = 0;
      let updated = 0;
      let quantityTotal = 0;
      for (const item of body.items) {
        const name = cleanText(item.product_name);
        const quantity = asInt(item.quantity);
        if (!name || quantity <= 0) continue;
        const brand = cleanText(item.brand);
        let where = tx`name = ${name} AND business = ${business}`;
        if (brand) where = tx`${where} AND brand = ${brand}`;
        let product = (await tx`SELECT * FROM public.products WHERE ${where}
          ORDER BY id ASC LIMIT 1 FOR UPDATE`)[0];
        const cost = asInt(item.cost_price);
        const price = asInt(item.sale_price);
        if (!product) {
          product = (await tx`INSERT INTO public.products
            (name, business, category, subcategory, brand, cost_price, sale_price, stock)
            VALUES (${name}, ${business}, ${cleanText(item.category) || null},
              ${cleanText(item.subcategory) || null}, ${brand || null}, ${cost}, ${price}, ${quantity})
            RETURNING *`)[0];
          created++;
        } else {
          const changes: Record<string, unknown> = { stock: product.stock + quantity };
          if (item.category) changes.category = item.category;
          if (item.subcategory) changes.subcategory = item.subcategory;
          if (brand) changes.brand = brand;
          if (cost) changes.cost_price = cost;
          if (price) changes.sale_price = price;
          product = (await tx`UPDATE public.products SET ${tx(changes)}, updated_at = now()
            WHERE id = ${product.id} RETURNING *`)[0];
          updated++;
        }
        const amount = item.amount == null ? quantity * cost : asInt(item.amount);
        const memo = [`상호명: ${supplier}`, `금액: ${amount}`, `총액: ${asInt(body.total_amount)}`];
        if (body.memo) memo.push(String(body.memo));
        await tx`INSERT INTO public.stock_history
          (transaction_no, record_date, product_id, product_name, business, category,
           subcategory, brand, io_type, quantity, cost_price, memo, created_by)
          VALUES (${no}, ${recordDate}, ${product.id}, ${product.name}, ${product.business},
            ${product.category}, ${product.subcategory}, ${product.brand}, '입고',
            ${quantity}, ${cost}, ${memo.join(" / ")}, ${c.get("user").id})`;
        quantityTotal += quantity;
      }
      if (!quantityTotal) throw new HttpError(400, "입고할 수량이 있는 품목을 입력해주세요.");
      return { ok: true, transaction_no: no, created, updated, quantity: quantityTotal };
    }));
  });

  app.post("/api/products/outbound-bulk", async (c) => {
    const body = await c.req.json();
    if (!Array.isArray(body.items) || !body.items.length) throw new HttpError(400, "출고할 품목을 입력해주세요.");
    const reason = cleanText(body.reason);
    if (!reason) throw new HttpError(400, "출고 사유를 입력해주세요.");
    const recordDate = asDate(body.record_date);
    const no = cleanText(body.transaction_no, transactionNo("OUT"));
    return c.json(await sql.begin(async (tx) => {
      let quantityTotal = 0;
      for (const item of body.items) {
        const quantity = asInt(item.quantity);
        if (quantity <= 0) continue;
        const id = asInt(item.product_id);
        const product = (await tx`UPDATE public.products SET stock = stock - ${quantity},
          updated_at = now() WHERE id = ${id} AND stock >= ${quantity} RETURNING *`)[0];
        if (!product) {
          const existing = (await tx`SELECT id, name, stock FROM public.products WHERE id = ${id}`)[0];
          if (!existing) throw new HttpError(404, `상품 ID ${id}를 찾을 수 없습니다.`);
          throw new HttpError(400, `${existing.name} 재고 부족 (현재: ${existing.stock}개)`);
        }
        const memo = [`출고사유: ${reason}`];
        if (body.memo) memo.push(String(body.memo));
        await tx`INSERT INTO public.stock_history
          (transaction_no, record_date, product_id, product_name, business, category,
           subcategory, brand, io_type, quantity, cost_price, memo, created_by)
          VALUES (${no}, ${recordDate}, ${id}, ${product.name}, ${product.business},
            ${product.category}, ${product.subcategory}, ${product.brand}, '출고',
            ${quantity}, ${product.cost_price}, ${memo.join(" / ")}, ${c.get("user").id})`;
        quantityTotal += quantity;
      }
      if (!quantityTotal) throw new HttpError(400, "출고할 수량이 있는 품목을 입력해주세요.");
      return { ok: true, transaction_no: no, quantity: quantityTotal };
    }));
  });

  app.get("/api/products/history/all", async (c) => {
    const q = c.req.query();
    let where = sql`TRUE`;
    if (q.business) where = sql`${where} AND business = ${q.business}`;
    if (q.start) where = sql`${where} AND record_date >= ${asDate(q.start)}`;
    if (q.end) where = sql`${where} AND record_date <= ${asDate(q.end)}`;
    return c.json(await sql`SELECT id, transaction_no, record_date::text AS record_date,
      product_id, product_name, business, category, subcategory, brand, io_type,
      quantity, cost_price, memo, created_by, created_at
      FROM public.stock_history WHERE ${where}
      ORDER BY record_date DESC, created_at DESC, id DESC`);
  });

  app.patch("/api/products/history/:id", async (c) => {
    const id = asId(c.req.param("id"));
    const body = await c.req.json();
    const result = await sql.begin(async (tx) => {
      const history = (await tx`SELECT * FROM public.stock_history WHERE id = ${id} FOR UPDATE`)[0];
      if (!history) throw new HttpError(404, "입출기록을 찾을 수 없습니다.");
      const oldQuantity = asInt(history.quantity);
      const nextQuantity = Object.hasOwn(body, "quantity") ? asInt(body.quantity) : oldQuantity;
      const nextType = String(body.io_type ?? history.io_type);
      if (nextQuantity < 0) throw new HttpError(400, "수량은 0보다 작을 수 없습니다.");
      if (!["입고", "출고"].includes(nextType)) throw new HttpError(400, "구분은 입고 또는 출고만 가능합니다.");
      if (history.product_id && (oldQuantity !== nextQuantity || history.io_type !== nextType)) {
        const product = (await tx`SELECT id, name, stock FROM public.products
          WHERE id = ${history.product_id} FOR UPDATE`)[0];
        if (product) {
          const restored = product.stock + (history.io_type === "입고" ? -oldQuantity : oldQuantity);
          const stock = restored + (nextType === "입고" ? nextQuantity : -nextQuantity);
          if (stock < 0) throw new HttpError(400, `${product.name} 재고가 부족해 수정할 수 없습니다.`);
          await tx`UPDATE public.products SET stock = ${stock}, updated_at = now() WHERE id = ${product.id}`;
        }
      }
      const changes = pick(body, [
        "transaction_no", "record_date", "product_name", "business", "category",
        "subcategory", "brand", "io_type", "quantity", "cost_price", "memo",
      ]);
      if (Object.hasOwn(changes, "record_date")) changes.record_date = asDate(changes.record_date);
      if (Object.hasOwn(changes, "quantity")) changes.quantity = nextQuantity;
      if (Object.hasOwn(changes, "cost_price")) changes.cost_price = asInt(changes.cost_price);
      if (Object.keys(changes).length) await tx`UPDATE public.stock_history SET ${tx(changes)} WHERE id = ${id}`;
      return (await tx`SELECT id, transaction_no, record_date::text AS record_date,
        product_id, product_name, business, category, subcategory, brand, io_type,
        quantity, cost_price, memo, created_by, created_at
        FROM public.stock_history WHERE id = ${id}`)[0];
    });
    return c.json(result);
  });
}
