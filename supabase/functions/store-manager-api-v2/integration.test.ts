import { hash } from "npm:bcryptjs@3.0.2";
import initSqlJs from "npm:sql.js@1.13.0/dist/sql-asm.js";
import { sql } from "../_shared/db.ts";

const { default: app } = await import("./index.ts");
const base = "http://localhost/store-manager-api-v2";

function assert(condition: unknown, detail: string): asserts condition {
  if (!condition) throw new Error(detail);
}

async function request(method: string, path: string, token?: string, body?: unknown) {
  const response = await app.request(base + path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (response.status >= 400) throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(data)}`);
  return data;
}

Deno.test("local PostgreSQL stock, sales and wholesale flow", async () => {
  const password = await hash("test-password", 4);
  await sql`INSERT INTO public.users (username, hashed_password, name, role)
    VALUES ('test-admin', ${password}, 'Tester', 'admin')`;
  const login = await app.request(base + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "username=test-admin&password=test-password",
  });
  if (login.status !== 200) throw new Error(`login: ${login.status} ${await login.text()}`);
  const token = (await login.json()).access_token as string;
  const product = await request("POST", "/api/products", token, {
    name: "Test product", business: "훌라", category: "악기", brand: "Test",
    cost_price: 500, sale_price: 1000, stock: 10,
  });
  assert(product.stock === 10, "initial stock");
  const id = product.id as number;
  const stock = async () => (await request("GET", `/api/products/${id}`, token)).stock;

  const inbound = await request("POST", "/api/products/inbound-bulk", token, {
    record_date: "2026-09-30", supplier_name: "Supplier", business: "훌라",
    items: [{ product_name: "Test product", brand: "Test", quantity: 5,
      cost_price: 600, sale_price: 1200 }],
  });
  assert(inbound.updated === 1 && await stock() === 15, "inbound stock");
  const sale = await request("POST", "/api/sales", token, {
    sale_date: "2026-09-30", items: [{ product_id: id, quantity: 2,
      sale_price: 1200, channel: "매장", payment: "카드" }],
  });
  assert(await stock() === 13, "sale stock");
  const sales = await request("GET", "/api/sales", token);
  assert(sales.length === 1 && sales[0].transaction_no === sale.transaction_no, "sale list");
  const summary = await request("GET", "/api/sales/summary?group_by=brand", token);
  assert(summary[0].total === 2400 && summary[0].profit === 1200, "profit summary");

  const wholesale = await request("POST", "/api/wholesale-outbounds", token, {
    outbound_date: "2026-09-30", dealer_name: "Dealer", paid_amount: 500,
    items: [{ product_id: id, quantity: 3, sale_price: 1000 }],
  });
  assert(wholesale.payment_status === "일부입금" && wholesale.balance === 2500, "wholesale amount");
  assert(await stock() === 10, "wholesale stock");
  const wholesaleList = await request("GET", "/api/wholesale-outbounds", token);
  assert(wholesaleList.length === 1 && wholesaleList[0].items.length === 1, "wholesale list");
  const paid = await request("PATCH", `/api/wholesale-outbounds/${wholesale.id}`, token, { paid_amount: 3000 });
  assert(paid.payment_status === "완납" && paid.balance === 0, "wholesale payment");
  await request("DELETE", `/api/wholesale-outbounds/${wholesale.id}`, token);
  assert(await stock() === 13, "wholesale delete restores stock");
  await request("DELETE", `/api/sales/${sales[0].id}`, token);
  assert(await stock() === 15, "sale delete restores stock");
  const histories = await request("GET", "/api/products/history/all", token);
  assert(histories.length === 1 && histories[0].io_type === "입고", "history deletion isolation");

  const delivery = await request("POST", "/api/deliveries", token, {
    delivery_date: "2026-09-30", business: "훌라", recipient: "Customer", shipping_fee: 3000,
  });
  assert((await request("GET", "/api/deliveries", token)).length === 1, "delivery list");
  const changedDelivery = await request("PATCH", `/api/deliveries/${delivery.id}`, token, { shipping_fee: 4000 });
  assert(changedDelivery.shipping_fee === 4000, "delivery update");
  await request("DELETE", `/api/deliveries/${delivery.id}`, token);

  const note = await request("POST", "/api/handover-notes", token, {
    note_date: "2026-09-30", business: "훌라", memo: "Test handover",
  });
  const done = await request("PATCH", `/api/handover-notes/${note.id}`, token, { is_done: 1 });
  assert(done.is_done === 1 && done.staff_name === "Tester", "handover completion");
  assert((await request("GET", "/api/handover-notes", token)).length === 1, "handover list");
  await request("DELETE", `/api/handover-notes/${note.id}`, token);

  const document = await request("POST", "/api/documents", token, {
    doc_type: "견적서", business: "훌라", doc_date: "2026-09-30",
    recipient: "Customer", total: 2400, items: [{ name: "Test product", quantity: 2 }],
  });
  assert(document.doc_no === "Q00001" && document.issuer_name === "Tester", "document number and issuer");
  assert((await request("GET", `/api/documents/${document.id}`, token)).doc_no === document.doc_no, "document detail");
  assert((await request("GET", "/api/documents", token)).length === 1, "document list");
  await request("DELETE", `/api/documents/${document.id}`, token);

  const staff = await request("POST", "/api/auth/users", token, {
    username: "test-staff", password: "initial", name: "Staff", role: "staff",
  });
  assert((await request("GET", "/api/auth/users", token)).length === 2, "user list");
  await request("PATCH", `/api/auth/users/${staff.id}`, token, { name: "Changed Staff" });
  await request("DELETE", `/api/auth/users/${staff.id}`, token);

  const SQLite = await initSqlJs();
  const source = new SQLite.Database();
  source.run(`CREATE TABLE inventory ("상품명" TEXT, "사업자" TEXT, "대분류" TEXT,
    "중분류" TEXT, "브랜드" TEXT, "단가" INTEGER, "판매가" INTEGER, "수량" INTEGER)`);
  source.run(`INSERT INTO inventory VALUES
    ('Test product', '훌라', '악기', '현악기', 'Test', 700, 1400, 7),
    ('New product', '다담', '악기', '타악기', 'New', 800, 1600, 9)`);
  const form = new FormData();
  form.set("file", new File([source.export()], "inventory.db"));
  form.set("update_existing", "true");
  source.close();
  const importResponse = await app.request(base + "/api/products/import-db", {
    method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form,
  });
  const imported = await importResponse.json();
  assert(importResponse.status === 200, `import: ${JSON.stringify(imported)}`);
  assert(imported.created === 1 && imported.updated === 1 && await stock() === 7, "SQLite merge import");

  const replaceForm = new FormData();
  replaceForm.set("file", form.get("file") as File);
  replaceForm.set("replace_all", "true");
  const replaceResponse = await app.request(base + "/api/products/import-db", {
    method: "POST", headers: { Authorization: `Bearer ${token}` }, body: replaceForm,
  });
  assert(replaceResponse.status === 400, "linked history blocks full replacement");
  assert(await stock() === 7, "failed full replacement rolls back");

  const multiline = await request("POST", "/api/sales", token, {
    sale_date: "2026-09-30", items: [
      { product_id: id, quantity: 1, sale_price: 1400, channel: "매장", payment: "카드" },
      { product_id: id, quantity: 2, sale_price: 1400, channel: "매장", payment: "카드" },
    ],
  });
  assert(await stock() === 4, "multi-line sale stock");
  const lines = (await request("GET", "/api/sales", token)).filter(
    (row: { transaction_no: string }) => row.transaction_no === multiline.transaction_no,
  );
  assert(lines.length === 2, "multi-line sale list");
  const second = lines.find((row: { quantity: number }) => row.quantity === 2);
  await request("DELETE", `/api/sales/${second.id}`, token);
  assert(await stock() === 6, "one sale line restores only its stock");
  const remaining = (await request("GET", "/api/products/history/all", token)).filter(
    (row: { transaction_no: string }) => row.transaction_no === multiline.transaction_no,
  );
  assert(remaining.length === 1 && remaining[0].quantity === 1, "one sale line keeps matching history");
});
