import { compare } from "npm:bcryptjs@3.0.2";
import { jwtVerify, SignJWT } from "npm:jose@6.1.0";
import { sql } from "./db.ts";

export type AppUser = {
  id: number;
  username: string;
  name: string;
  role: string;
  is_active: number;
};

type LoginUser = AppUser & { hashed_password: string };
export type LoginResult =
  | { status: "invalid" }
  | { status: "inactive" }
  | { status: "ok"; user: AppUser };

const encoder = new TextEncoder();

function signingKey(): Uint8Array {
  const secret = Deno.env.get("SECRET_KEY");
  if (!secret) throw new Error("SECRET_KEY is not configured");
  return encoder.encode(secret);
}

export async function authenticate(username: string, password: string): Promise<LoginResult> {
  const rows = await sql<LoginUser[]>`
    SELECT id, username, name, role, is_active, hashed_password
    FROM public.users WHERE username = ${username} LIMIT 1
  `;
  const user = rows[0];
  if (!user || !await compare(password, user.hashed_password)) return { status: "invalid" };
  if (!user.is_active) return { status: "inactive" };
  const { hashed_password: _hash, ...publicUser } = user;
  return { status: "ok", user: publicUser };
}

export async function createToken(user: AppUser): Promise<string> {
  return await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.username)
    .setExpirationTime("8h")
    .sign(signingKey());
}

export async function currentUser(header: string | undefined): Promise<AppUser | null> {
  const token = header?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return null;
  let username: string | undefined;
  try {
    const { payload } = await jwtVerify(token, signingKey(), { algorithms: ["HS256"] });
    username = payload.sub;
  } catch {
    return null;
  }
  if (!username) return null;
  const rows = await sql<AppUser[]>`
    SELECT id, username, name, role, is_active
    FROM public.users WHERE username = ${username} LIMIT 1
  `;
  return rows[0]?.is_active ? rows[0] : null;
}
