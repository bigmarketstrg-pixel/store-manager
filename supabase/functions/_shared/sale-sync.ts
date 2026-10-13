import type { TransactionSql } from "npm:postgres@3.4.7";
import { asDate, asInt, cleanBusiness, cleanText, HttpError, pick } from "./http.ts";

type Tx = TransactionSql<Record<string, never>>;
const sharedFields = ["product_name", "business", "category", "subcategory", "brand", "quantity", "cost_price", "memo"];

export function saleNumbers(quantity: unknown, cost: unknown, price: unknown) {
  const values = { quantity: asInt(quantity), cost_price: asInt(cost), sale_price: asInt(price) };
  const total = values.quantity * values.sale_price;
  if (values.quantity <= 0 || values.cost_price < 0 || values.sale_price < 0 ||
    Object.values(values).some(value => value > 2147483647) || total > 2147483647) {
    throw new HttpError(400, "수량은 1 이상, 원가와 판매가는 0 이상의 정수로 입력해주세요. 금액이 너무 크지 않은지도 확인해주세요.");
  }
  return { ...values, total };
}

export async function lockSale(tx: Tx, id: number) {
  const initial = (await tx`SELECT product_id FROM public.sales WHERE id = ${id}`)[0];
  if (!initial) throw new HttpError(404, "판매 기록을 찾을 수 없습니다.");
  // Product-first locking agrees with product deletion and serializes stock changes.
  if (initial.product_id) await tx`SELECT id FROM public.products WHERE id = ${initial.product_id} FOR UPDATE`;
  const sale = (await tx`SELECT *, sale_date::text AS sale_date FROM public.sales WHERE id = ${id} FOR UPDATE`)[0];
  if (!sale) throw new HttpError(404, "판매 기록을 찾을 수 없습니다.");
  const history = (await tx`SELECT *, record_date::text AS record_date FROM public.stock_history WHERE sale_id = ${id} FOR UPDATE`)[0];
  if (!history) throw new HttpError(409, "연결된 출고기록을 확인해야 합니다. 관리자에게 문의해주세요.");
  if (history.io_type !== "출고" || history.product_id !== sale.product_id) {
    throw new HttpError(409, "판매와 출고기록의 연결 정보가 일치하지 않습니다.");
  }
  return { sale, history };
}

export async function updateSale(tx: Tx, id: number, body: Record<string, unknown>, fromHistory = false) {
  const { sale, history } = await lockSale(tx, id);
  if (Object.hasOwn(body, "transaction_no") && body.transaction_no !== sale.transaction_no) {
    throw new HttpError(400, "판매 거래번호는 변경할 수 없습니다.");
  }
  if (Object.hasOwn(body, "io_type") && body.io_type !== "출고") {
    throw new HttpError(400, "판매에 연결된 기록은 출고로 유지해야 합니다.");
  }
  const source = fromHistory ? history : sale;
  const common = { ...pick(source, sharedFields), ...pick(body, sharedFields) };
  common.product_name = cleanText(common.product_name);
  if (!common.product_name) throw new HttpError(400, "상품명을 입력해주세요.");
  common.business = cleanBusiness(common.business);
  const numbers = saleNumbers(common.quantity, common.cost_price, body.sale_price ?? sale.sale_price);
  const date = asDate(fromHistory ? body.record_date ?? history.record_date : body.sale_date ?? sale.sale_date);
  const delta = asInt(history.quantity) - numbers.quantity;
  if (sale.product_id && delta) {
    const changed = await tx`UPDATE public.products SET stock = stock + ${delta}, updated_at = now()
      WHERE id = ${sale.product_id} AND stock + ${delta} >= 0 RETURNING id`;
    if (!changed.length) throw new HttpError(400, "재고가 부족해 판매 수량을 늘릴 수 없습니다.");
  }
  await tx`UPDATE public.sales SET ${tx({ ...common, ...numbers, sale_date: date,
    ...pick(body, ["channel", "payment"]) })} WHERE id = ${id}`;
  await tx`UPDATE public.stock_history SET ${tx({ ...common, quantity: numbers.quantity,
    cost_price: numbers.cost_price, record_date: date, transaction_no: sale.transaction_no })}
    WHERE id = ${history.id}`;
  return (await tx`SELECT *, sale_date::text AS sale_date FROM public.sales WHERE id = ${id}`)[0];
}
