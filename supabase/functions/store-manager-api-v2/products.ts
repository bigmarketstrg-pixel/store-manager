import type { Hono } from "npm:hono@4.10.0";
import type { AppUser } from "../_shared/auth.ts";
import { sql } from "../_shared/db.ts";
import { asId, asInt, cleanBusiness, cleanText, HttpError, pick } from "../_shared/http.ts";

type Api = Hono<{ Variables: { user: AppUser } }>;
const productFields = [
  "name", "business", "category", "subcategory", "brand", "product_code",
  "cost_price", "sale_price", "stock", "note", "memo",
] as const;
const numericFields = ["cost_price", "sale_price", "stock"] as const;

function importInt(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && Number.isSafeInteger(Math.trunc(number)) ? Math.trunc(number) : 0;
}

function productPayload(body: Record<string, unknown>, creating = false) {
  const data = pick(body, productFields);
  if (creating) {
    data.name = cleanText(data.name);
    data.business = cleanText(data.business);
    if (!data.name || !data.business) throw new HttpError(400, "상품명과 사업자를 입력해주세요.");
    for (const key of numericFields) data[key] = asInt(data[key]);
  } else {
    if (Object.hasOwn(data, "name")) data.name = cleanText(data.name);
    if (Object.hasOwn(data, "business")) data.business = cleanText(data.business);
    for (const key of numericFields) {
      if (Object.hasOwn(data, key)) data[key] = asInt(data[key]);
    }
  }
  return data;
}

export function registerProductWriteRoutes(app: Api) {
  app.post("/api/products/import-db", async (c) => {
    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !/\.(db|sqlite|sqlite3)$/i.test(file.name)) {
      throw new HttpError(400, "SQLite DB 파일만 업로드할 수 있습니다.");
    }
    if (file.size > 20 * 1024 * 1024) throw new HttpError(400, "DB 파일이 너무 큽니다. 최대 20MB입니다.");
    const replace = form.get("replace_all") === "true";
    const update = form.get("update_existing") !== "false";
    if (replace && c.get("user").role !== "admin") throw new HttpError(403, "관리자만 전체교체할 수 있습니다.");

    let sourceRows: Record<string, unknown>[];
    try {
      const { default: initSqlJs } = await import("npm:sql.js@1.13.0/dist/sql-asm.js");
      const SQLite = await initSqlJs();
      const db = new SQLite.Database(new Uint8Array(await file.arrayBuffer()));
      try {
        if (!db.exec("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'inventory'")[0]?.values.length) {
          throw new HttpError(400, "inventory 테이블을 찾을 수 없습니다.");
        }
        const result = db.exec("SELECT * FROM inventory")[0];
        sourceRows = result ? result.values.map((values: unknown[]) =>
          Object.fromEntries(result.columns.map((column: string, index: number) => [column, values[index]]))) : [];
      } finally {
        db.close();
      }
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(400, "DB 파일을 읽을 수 없습니다.");
    }

    const result = await sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(42103)`;
      let deleted = 0;
      if (replace) {
        try {
          const removed = await tx`DELETE FROM public.products RETURNING id`;
          deleted = removed.length;
        } catch (error) {
          if ((error as { code?: string }).code === "23503") {
            throw new HttpError(400, "판매/입출고 기록이 연결된 상품이 있어 전체 교체를 할 수 없습니다. 기존 유지 가져오기를 사용하거나 기록 정리가 필요합니다.");
          }
          throw error;
        }
      }
      const current = replace ? [] : await tx`SELECT id, name, business FROM public.products ORDER BY id`;
      const existing = new Map<string, number>();
      for (const row of current) {
        const key = JSON.stringify([row.name, row.business]);
        if (!existing.has(key)) existing.set(key, row.id);
      }
      let created = 0;
      let updated = 0;
      let skipped = 0;
      for (const row of sourceRows) {
        const name = cleanText(row["상품명"]);
        if (!name) { skipped++; continue; }
        const business = cleanBusiness(row["사업자"]);
        const payload = {
          name, business,
          category: cleanText(row["대분류"]) || null,
          subcategory: cleanText(row["중분류"]) || null,
          brand: cleanText(row["브랜드"]) || null,
          cost_price: importInt(row["단가"]),
          sale_price: importInt(row["판매가"]),
          stock: importInt(row["수량"]),
        };
        const key = JSON.stringify([name, business]);
        const id = existing.get(key);
        if (id) {
          if (update) {
            await tx`UPDATE public.products SET ${tx(payload)}, updated_at = now() WHERE id = ${id}`;
            updated++;
          } else skipped++;
        } else {
          const inserted = (await tx`INSERT INTO public.products ${tx(payload)} RETURNING id`)[0];
          existing.set(key, inserted.id);
          created++;
        }
      }
      return { total: sourceRows.length, created, updated, skipped, deleted };
    });
    return c.json(result);
  });

  app.post("/api/products", async (c) => {
    const data = productPayload(await c.req.json(), true);
    const rows = await sql`INSERT INTO public.products ${sql(data)} RETURNING
      id, name, business, category, subcategory, brand, product_code,
      cost_price, sale_price, stock, note, memo`;
    return c.json(rows[0]);
  });

  app.patch("/api/products/:id", async (c) => {
    const id = asId(c.req.param("id"));
    const changes = productPayload(await c.req.json());
    if (Object.keys(changes).length) {
      await sql`UPDATE public.products SET ${sql(changes)}, updated_at = now() WHERE id = ${id}`;
    }
    const rows = await sql`SELECT id, name, business, category, subcategory, brand,
      product_code, cost_price, sale_price, stock, note, memo
      FROM public.products WHERE id = ${id}`;
    if (!rows.length) throw new HttpError(404, "상품을 찾을 수 없습니다.");
    return c.json(rows[0]);
  });

  app.delete("/api/products/:id", async (c) => {
    if (c.get("user").role !== "admin") throw new HttpError(403, "관리자 권한이 필요합니다.");
    const id = asId(c.req.param("id"));
    await sql.begin(async (tx) => {
      const product = await tx`SELECT id FROM public.products WHERE id = ${id} FOR UPDATE`;
      if (!product.length) throw new HttpError(404, "상품을 찾을 수 없습니다.");
      await tx`UPDATE public.sales SET product_id = NULL WHERE product_id = ${id}`;
      await tx`UPDATE public.stock_history SET product_id = NULL WHERE product_id = ${id}`;
      await tx`UPDATE public.wholesale_outbound_items SET product_id = NULL WHERE product_id = ${id}`;
      await tx`DELETE FROM public.products WHERE id = ${id}`;
    });
    return c.json({ ok: true });
  });
}
