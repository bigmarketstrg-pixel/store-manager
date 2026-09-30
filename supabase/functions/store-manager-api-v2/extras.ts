import type { Hono } from "npm:hono@4.10.0";
import type { AppUser } from "../_shared/auth.ts";
import { sql } from "../_shared/db.ts";
import { asDate, asId, asInt, cleanText, HttpError, pick } from "../_shared/http.ts";

type Api = Hono<{ Variables: { user: AppUser } }>;

function admin(user: AppUser) {
  if (user.role !== "admin") throw new HttpError(403, "관리자 권한이 필요합니다.");
}

export function registerExtraRoutes(app: Api) {
  app.get("/api/deliveries", async (c) => {
    const q = c.req.query();
    let where = sql`TRUE`;
    if (q.business) where = sql`${where} AND business = ${q.business}`;
    if (q.start) where = sql`${where} AND delivery_date >= ${asDate(q.start)}`;
    if (q.end) where = sql`${where} AND delivery_date <= ${asDate(q.end)}`;
    return c.json(await sql`SELECT id, delivery_date::text AS delivery_date, business,
      recipient, shipping_fee, memo FROM public.deliveries WHERE ${where}
      ORDER BY delivery_date DESC, id DESC`);
  });

  app.post("/api/deliveries", async (c) => {
    const body = await c.req.json();
    const rows = await sql`INSERT INTO public.deliveries
      (delivery_date, business, recipient, shipping_fee, memo, created_by)
      VALUES (${asDate(body.delivery_date)}, ${cleanText(body.business)}, ${body.recipient ?? null},
        ${asInt(body.shipping_fee)}, ${body.memo ?? null}, ${c.get("user").id})
      RETURNING id, delivery_date::text AS delivery_date, business, recipient, shipping_fee, memo`;
    return c.json(rows[0]);
  });

  app.patch("/api/deliveries/:id", async (c) => {
    const id = asId(c.req.param("id"));
    const body = await c.req.json();
    const changes = pick(body, ["delivery_date", "business", "recipient", "shipping_fee", "memo"]);
    if (Object.hasOwn(changes, "delivery_date")) changes.delivery_date = asDate(changes.delivery_date);
    if (Object.hasOwn(changes, "shipping_fee")) changes.shipping_fee = asInt(changes.shipping_fee);
    if (Object.keys(changes).length) {
      await sql`UPDATE public.deliveries SET ${sql(changes)} WHERE id = ${id}`;
    }
    const rows = await sql`SELECT id, delivery_date::text AS delivery_date, business,
      recipient, shipping_fee, memo FROM public.deliveries WHERE id = ${id}`;
    if (!rows.length) throw new HttpError(404, "배송 기록을 찾을 수 없습니다.");
    return c.json(rows[0]);
  });

  app.delete("/api/deliveries/:id", async (c) => {
    const rows = await sql`DELETE FROM public.deliveries WHERE id = ${asId(c.req.param("id"))} RETURNING id`;
    if (!rows.length) throw new HttpError(404, "배송 기록을 찾을 수 없습니다.");
    return c.json({ ok: true });
  });

  app.get("/api/handover-notes", async (c) => c.json(await sql`
    SELECT h.id, h.note_date::text AS note_date, h.business, h.memo, h.is_done,
      u.name AS staff_name FROM public.handover_notes h
    LEFT JOIN public.users u ON u.id = h.created_by
    ORDER BY h.is_done ASC, h.note_date DESC, h.created_at DESC, h.id DESC
  `));

  app.post("/api/handover-notes", async (c) => {
    const body = await c.req.json();
    const memo = cleanText(body.memo);
    if (!memo) throw new HttpError(400, "메모를 입력해주세요.");
    const rows = await sql`INSERT INTO public.handover_notes
      (note_date, business, memo, created_by)
      VALUES (${asDate(body.note_date)}, ${cleanText(body.business)}, ${memo}, ${c.get("user").id})
      RETURNING id, note_date::text AS note_date, business, memo, is_done`;
    return c.json({ ...rows[0], staff_name: c.get("user").name });
  });

  app.patch("/api/handover-notes/:id", async (c) => {
    const id = asId(c.req.param("id"));
    const body = await c.req.json();
    const changes = pick(body, ["note_date", "business", "memo", "is_done"]);
    if (Object.hasOwn(changes, "note_date")) changes.note_date = asDate(changes.note_date);
    if (Object.hasOwn(changes, "memo")) {
      changes.memo = cleanText(changes.memo);
      if (!changes.memo) throw new HttpError(400, "메모를 입력해주세요.");
    }
    if (Object.hasOwn(changes, "is_done")) changes.is_done = changes.is_done ? 1 : 0;
    if (Object.keys(changes).length) {
      await sql`UPDATE public.handover_notes SET ${sql(changes)} WHERE id = ${id}`;
    }
    const rows = await sql`SELECT h.id, h.note_date::text AS note_date, h.business,
      h.memo, h.is_done, u.name AS staff_name FROM public.handover_notes h
      LEFT JOIN public.users u ON u.id = h.created_by WHERE h.id = ${id}`;
    if (!rows.length) throw new HttpError(404, "인수인계 메모를 찾을 수 없습니다.");
    return c.json(rows[0]);
  });

  app.delete("/api/handover-notes/:id", async (c) => {
    admin(c.get("user"));
    const rows = await sql`DELETE FROM public.handover_notes WHERE id = ${asId(c.req.param("id"))} RETURNING id`;
    if (!rows.length) throw new HttpError(404, "인수인계 메모를 찾을 수 없습니다.");
    return c.json({ ok: true });
  });

  app.get("/api/documents", async (c) => {
    const q = c.req.query();
    let where = sql`TRUE`;
    if (q.doc_type) where = sql`${where} AND d.doc_type = ${q.doc_type}`;
    if (q.business) where = sql`${where} AND d.business = ${q.business}`;
    return c.json(await sql`SELECT d.id, d.doc_type, d.doc_no, d.business,
      d.doc_date::text AS doc_date, d.recipient, d.total, d.memo, d.items_json,
      u.name AS issuer_name FROM public.documents d
      LEFT JOIN public.users u ON u.id = d.created_by
      WHERE ${where} ORDER BY d.created_at DESC, d.id DESC`);
  });

  app.post("/api/documents", async (c) => {
    const body = await c.req.json();
    const docType = cleanText(body.doc_type);
    const prefix = ({ "견적서": "Q", "납품서": "D", "거래명세서": "T" } as Record<string, string>)[docType] ?? "X";
    const items = Array.isArray(body.items) ? body.items : [];
    const user = c.get("user");
    const document = await sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(hashtext('documents_doc_no'))`;
      const last = await tx`SELECT doc_no FROM public.documents WHERE doc_type = ${docType}
        ORDER BY id DESC LIMIT 1`;
      const next = last.length ? Number(String(last[0].doc_no).slice(1)) + 1 : 1;
      const docNo = `${prefix}${String(next).padStart(5, "0")}`;
      const rows = await tx`INSERT INTO public.documents
        (doc_type, doc_no, business, doc_date, recipient, total, memo, items_json, created_by)
        VALUES (${docType}, ${docNo}, ${cleanText(body.business)}, ${asDate(body.doc_date)},
          ${cleanText(body.recipient)}, ${asInt(body.total)}, ${body.memo ?? null},
          ${JSON.stringify(items)}, ${user.id})
        RETURNING id, doc_type, doc_no, business, doc_date::text AS doc_date,
          recipient, total, memo, items_json`;
      return rows[0];
    });
    return c.json({ ...document, issuer_name: user.name });
  });

  app.get("/api/documents/:id", async (c) => {
    const rows = await sql`SELECT d.id, d.doc_type, d.doc_no, d.business,
      d.doc_date::text AS doc_date, d.recipient, d.total, d.memo, d.items_json,
      u.name AS issuer_name FROM public.documents d
      LEFT JOIN public.users u ON u.id = d.created_by WHERE d.id = ${asId(c.req.param("id"))}`;
    if (!rows.length) throw new HttpError(404, "문서를 찾을 수 없습니다.");
    return c.json(rows[0]);
  });

  app.delete("/api/documents/:id", async (c) => {
    admin(c.get("user"));
    const rows = await sql`DELETE FROM public.documents WHERE id = ${asId(c.req.param("id"))} RETURNING id`;
    if (!rows.length) throw new HttpError(404, "문서를 찾을 수 없습니다.");
    return c.json({ ok: true });
  });
}
