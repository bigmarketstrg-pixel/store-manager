export class HttpError extends Error {
  constructor(public status: number, public detail: string) {
    super(detail);
  }
}

export function asId(value: string): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(404, "항목을 찾을 수 없습니다.");
  return id;
}

export function asInt(value: unknown, fallback = 0): number {
  const number = Number(value ?? fallback);
  if (!Number.isSafeInteger(number)) throw new HttpError(400, "숫자 입력을 확인해주세요.");
  return number;
}

export function asDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpError(400, "날짜를 확인해주세요.");
  }
  return value;
}

export function pick(source: Record<string, unknown>, allowed: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(allowed.filter((key) => Object.hasOwn(source, key)).map((key) => [key, source[key]]));
}

export function cleanText(value: unknown, fallback = ""): string {
  return String(value ?? "").trim() || fallback;
}

export function cleanBusiness(value: unknown): string {
  const business = cleanText(value, "이 외");
  return ["다담", "훌라", "오아시스", "이 외"].includes(business) ? business : "이 외";
}
