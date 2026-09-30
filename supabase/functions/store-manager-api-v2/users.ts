import { compare, hash } from "npm:bcryptjs@3.0.2";
import type { Hono } from "npm:hono@4.10.0";
import type { AppUser } from "../_shared/auth.ts";
import { sql } from "../_shared/db.ts";
import { asId, cleanText, HttpError } from "../_shared/http.ts";

type Api = Hono<{ Variables: { user: AppUser } }>;

function admin(user: AppUser) {
  if (user.role !== "admin") throw new HttpError(403, "관리자 권한이 필요합니다.");
}

export function registerUserRoutes(app: Api) {
  app.post("/api/auth/change-password", async (c) => {
    const body = await c.req.json();
    const user = c.get("user");
    const rows = await sql`SELECT hashed_password FROM public.users WHERE id = ${user.id} LIMIT 1`;
    if (!rows[0] || !await compare(String(body.current_password ?? ""), rows[0].hashed_password)) {
      throw new HttpError(400, "현재 비밀번호가 맞지 않습니다.");
    }
    const password = String(body.new_password ?? "");
    if (password.length < 4) throw new HttpError(400, "새 비밀번호는 4자 이상으로 입력해주세요.");
    await sql`UPDATE public.users SET hashed_password = ${await hash(password, 12)} WHERE id = ${user.id}`;
    return c.json({ ok: true });
  });

  app.get("/api/auth/users", async (c) => {
    admin(c.get("user"));
    return c.json(await sql`SELECT id, username, name, role, is_active FROM public.users ORDER BY id`);
  });

  app.post("/api/auth/users", async (c) => {
    admin(c.get("user"));
    const body = await c.req.json();
    const username = cleanText(body.username);
    const password = String(body.password ?? "");
    const name = cleanText(body.name);
    if (!username || !password || !name) throw new HttpError(400, "사용자 정보를 확인해주세요.");
    const existing = await sql`SELECT 1 FROM public.users WHERE username = ${username} LIMIT 1`;
    if (existing.length) throw new HttpError(400, "이미 존재하는 아이디입니다.");
    const rows = await sql`INSERT INTO public.users (username, hashed_password, name, role)
      VALUES (${username}, ${await hash(password, 12)}, ${name}, ${body.role ?? "staff"})
      RETURNING id, username, name, role, is_active`;
    return c.json(rows[0]);
  });

  app.patch("/api/auth/users/:id", async (c) => {
    admin(c.get("user"));
    const id = asId(c.req.param("id"));
    const body = await c.req.json();
    const changes: Record<string, unknown> = {};
    if (Object.hasOwn(body, "password")) changes.hashed_password = await hash(String(body.password), 12);
    if (Object.hasOwn(body, "name")) changes.name = body.name;
    if (Object.hasOwn(body, "role")) changes.role = body.role;
    if (Object.hasOwn(body, "is_active")) changes.is_active = body.is_active;
    const rows = changes.hashed_password || changes.name || changes.role || changes.is_active !== undefined
      ? await sql`UPDATE public.users SET ${sql(changes)} WHERE id = ${id} RETURNING id`
      : await sql`SELECT id FROM public.users WHERE id = ${id}`;
    if (!rows.length) throw new HttpError(404, "사용자를 찾을 수 없습니다.");
    return c.json({ ok: true });
  });

  app.delete("/api/auth/users/:id", async (c) => {
    admin(c.get("user"));
    const id = asId(c.req.param("id"));
    const rows = await sql`DELETE FROM public.users WHERE id = ${id} RETURNING id`;
    if (!rows.length) throw new HttpError(404, "사용자를 찾을 수 없습니다.");
    return c.json({ ok: true });
  });
}
