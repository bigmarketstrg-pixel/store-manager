import { hash } from "npm:bcryptjs@3.0.2";
import initSqlJs from "npm:sql.js@1.13.0/dist/sql-asm.js";
import { sql } from "../_shared/db.ts";

const { default: app } = await import("./index.ts");
const base = "http://localhost/store-manager-api-v2";

function assert(condition: unknown, detail: string): asserts condition {
  if (!condition) throw new Error(detail);
}

async function expectError(method: string, path: string, token: string, body: unknown, status = 400) {
  const response = await app.request(base + path, { method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body) });
  await response.text();
  assert(response.status === status, `${path} rejects invalid update (${response.status})`);
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
  const multiSummary = await request("GET", "/api/sales/summary?group_by=business", token);
  assert(multiSummary[0].count === 1 && multiSummary[0].line_count === 2, "one transaction with two sale lines");
  const second = lines.find((row: { quantity: number }) => row.quantity === 2);
  await request("DELETE", `/api/sales/${second.id}`, token);
  assert(await stock() === 6, "one sale line restores only its stock");
  const remaining = (await request("GET", "/api/products/history/all", token)).filter(
    (row: { transaction_no: string }) => row.transaction_no === multiline.transaction_no,
  );
  assert(remaining.length === 1 && remaining[0].quantity === 1, "one sale line keeps matching history");
});

Deno.test("revenue drilldown totals, exact groups and complete pagination", async () => {
  const user = (await sql`SELECT id FROM public.users WHERE username = 'test-admin'`)[0];
  const { createToken } = await import("../_shared/auth.ts");
  const token = await createToken({ id: user.id, username: "test-admin", name: "Tester", role: "admin", is_active: 1 });
  await sql`INSERT INTO public.sales (transaction_no, sale_date, product_name, business,
    category, subcategory, brand, cost_price, sale_price, quantity, total, channel, payment, created_by)
    VALUES
      ('GROUP-1', '2026-07-01', 'Exact', '훌라', NULL, NULL, 'Exact', 40, 100, 2, 200, NULL, NULL, ${user.id}),
      ('GROUP-1', '2026-07-01', 'Exact Plus', '훌라', '', '', 'Exact Plus', 100, 300, 1, 300, '', '', ${user.id}),
      ('GROUP-1', '2026-07-01', 'Other', '다담', '악기', '현악기', 'Exact', 200, 500, 1, 500, '매장', '카드', ${user.id}),
      ('GROUP-2', '2026-07-02', 'Exact', '훌라', '악기', '현악기', 'Exact', 100, 400, 1, 400, '매장', '카드', ${user.id}),
      ('', '2026-07-03', 'Blank 1', '훌라', NULL, NULL, NULL, 10, 50, 1, 50, NULL, NULL, ${user.id}),
      ('', '2026-07-03', 'Blank 2', '훌라', '', '', '', 20, 70, 1, 70, '', '', ${user.id}),
      ('GROUP-3', '2026-08-01', 'August', '훌라', '악기', '현악기', 'Exact', 50, 200, 1, 200, '매장', '카드', ${user.id})`;
  const range = "start=2026-07-01&end=2026-07-31";
  const businesses = await request("GET", "/api/sales/summary?group_by=business&" + range, token);
  assert(businesses[0].overall_count === 4, "overall transaction count excludes cross-business duplicates");
  const hula = businesses.find((row: { key: string }) => row.key === "훌라");
  assert(hula.count === 4 && hula.line_count === 5 && hula.total === 1020, "business totals");
  for (const group of ["day", "month", "business", "category", "subcategory", "brand", "product", "channel", "payment"]) {
    const rows = await request("GET", "/api/sales/summary?group_by=" + group + "&" + range, token);
    for (const row of rows) {
      const details = await request("GET", "/api/sales/summary/details?group_by=" + group +
        "&group_key=" + encodeURIComponent(row.key) + "&" + range, token);
      for (const field of ["count", "line_count", "quantity", "total", "cost_total", "profit"]) {
        assert(details.summary[field] === row[field], group + " detail matches summary: " + field);
      }
      assert(details.items.length === row.line_count, "all exact group lines");
      assert(details.items.every((item: { staff_name: string }) => item.staff_name === "Tester"), "staff names included");
    }
  }
  const baseDetails = "/api/sales/summary/details?group_by=business&group_key=" + encodeURIComponent("훌라") +
    "&" + range + "&limit=2";
  const first = await request("GET", baseDetails, token);
  await sql`INSERT INTO public.sales (transaction_no, sale_date, business, sale_price, quantity, total)
    VALUES ('LATER', '2026-07-31', '훌라', 99, 1, 99)`;
  const second = await request("GET", baseDetails + "&snapshot_id=" + first.snapshot_id +
    "&before_id=" + first.next_before_id, token);
  const third = await request("GET", baseDetails + "&snapshot_id=" + first.snapshot_id +
    "&before_id=" + second.next_before_id, token);
  const ids = [...first.items, ...second.items, ...third.items].map((row: { id: number }) => row.id);
  assert(ids.length === 5 && new Set(ids).size === 5 && !third.next_before_id, "stable cursor pages without duplicates");
  assert(second.summary.total === first.summary.total, "new sale excluded from existing snapshot");
  const filtered = await request("GET", "/api/sales/summary?group_by=month&" + range +
    "&business=" + encodeURIComponent("다담"), token);
  assert(filtered.length === 1 && filtered[0].total === 500 && filtered[0].key === "2026-07", "business and date filters");
  await sql`INSERT INTO public.sales (transaction_no, sale_date, business, brand, sale_price, quantity, total)
    SELECT 'PAGE-' || n, '2026-08-10', '다담', 'Pagination', 10, 1, 10 FROM generate_series(1, 1005) n`;
  const exportPath = "/api/sales/summary/details?group_by=brand&group_key=Pagination&limit=1000";
  const exportFirst = await request("GET", exportPath, token);
  const exportSecond = await request("GET", exportPath + "&snapshot_id=" + exportFirst.snapshot_id +
    "&before_id=" + exportFirst.next_before_id, token);
  assert(exportFirst.items.length === 1000 && exportSecond.items.length === 5 && !exportSecond.next_before_id,
    "Excel can retrieve more than the old 1000-row cap");
  assert(exportFirst.summary.count === 1005 && exportFirst.summary.total === 10050, "full export totals");
  const invalid = await app.request(base + "/api/sales/summary/details?group_by=invalid&group_key=test", {
    headers: { Authorization: "Bearer " + token },
  });
  assert(invalid.status === 400, "unknown grouping is rejected");
  await sql`DELETE FROM public.sales WHERE sale_date BETWEEN '2026-07-01' AND '2026-08-31'`;
});

Deno.test("bidirectional sale/history edits, line identity, stock and atomic rollback", async () => {
  const user = (await sql`SELECT id FROM public.users WHERE username = 'test-admin'`)[0];
  const { createToken } = await import("../_shared/auth.ts");
  const token = await createToken({ id: user.id, username: "test-admin", name: "Tester", role: "admin", is_active: 1 });
  const product = await request("POST", "/api/products", token, {
    name: "Sync product", business: "훌라", category: "악기", brand: "Sync", stock: 20, cost_price: 100, sale_price: 300,
  });
  const stock = async () => (await request("GET", `/api/products/${product.id}`, token)).stock;
  const created = await request("POST", "/api/sales", token, {
    sale_date: "2026-10-01", items: [1, 1].map(quantity => ({ product_id: product.id, quantity, sale_price: 300 })),
  });
  const lines = (await request("GET", "/api/sales", token)).filter(
    (row: { transaction_no: string }) => row.transaction_no === created.transaction_no);
  const a = lines[0], b = lines[1];
  const histories = () => request("GET", "/api/products/history/all", token);
  const historyFor = async (id: number) => (await histories()).find((row: { sale_id: number }) => row.sale_id === id);
  const saleFor = async (id: number) => (await request("GET", "/api/sales", token)).find((row: { id: number }) => row.id === id);
  const ha = await historyFor(a.id), hb = await historyFor(b.id);
  assert(ha.id !== hb.id && await stock() === 18, "identical sale lines have separate stable links");
  await request("PATCH", `/api/products/history/${ha.id}`, token, {
    record_date: "2026-10-02", quantity: 3, cost_price: 150, product_name: "Edited snapshot",
    business: "다담", category: "수정분류", subcategory: "수정중분류", brand: "Edited", memo: "History edit",
  });
  const afterHistory = await saleFor(a.id);
  assert(afterHistory.quantity === 3 && afterHistory.cost_price === 150 && afterHistory.total === 900 &&
    afterHistory.sale_date === "2026-10-02" && afterHistory.business === "다담" && afterHistory.brand === "Edited" &&
    afterHistory.product_name === "Edited snapshot" && afterHistory.memo === "History edit", "history updates matching sale fields and total");
  assert((await saleFor(b.id)).cost_price === 100 && (await historyFor(b.id)).quantity === 1, "duplicate sibling unchanged");
  assert(await stock() === 16, "history edit adjusts inventory only once");
  const aggregate = await request("GET", "/api/sales/summary?group_by=business&start=2026-10-02&end=2026-10-02", token);
  assert(aggregate[0].cost_total === 450 && aggregate[0].profit === 450, "profit uses corrected historical cost");
  const afterSale = await request("PATCH", `/api/sales/${a.id}`, token, {
    sale_date: "2026-10-03", quantity: 2, cost_price: 175, sale_price: 400, channel: "온라인", payment: "계좌", memo: "Sale edit",
  });
  const history = await historyFor(a.id);
  assert(afterSale.total === 800 && afterSale.channel === "온라인" && afterSale.payment === "계좌", "sale recalculates total");
  assert(history.quantity === 2 && history.cost_price === 175 && history.record_date === "2026-10-03" &&
    history.memo === "Sale edit" && await stock() === 17, "sale updates history and inventory once");
  const catalog = await request("GET", `/api/products/${product.id}`, token);
  assert(catalog.cost_price === 100 && catalog.name === "Sync product", "historical corrections do not rewrite catalog snapshots");
  for (const payload of [{ quantity: 1000 }, { quantity: 0 }, { cost_price: -1 }, { sale_price: -1 },
    { quantity: 1.5 }, { sale_price: 2147483647, quantity: 2 }]) {
    await expectError("PATCH", `/api/sales/${a.id}`, token, payload);
  }
  await expectError("PATCH", `/api/products/history/${ha.id}`, token, { io_type: "입고" });
  await expectError("PATCH", `/api/products/history/${ha.id}`, token, { transaction_no: "OTHER" });
  assert(await stock() === 17 && (await saleFor(a.id)).total === 800 && (await historyFor(a.id)).quantity === 2, "failed edits leave all records untouched");
  await expectError("POST", "/api/products/history/batch", token, { items: [
    { id: ha.id, cost_price: 250, quantity: 1 }, { id: hb.id, quantity: 1000 },
  ] });
  assert(await stock() === 17 && (await saleFor(a.id)).cost_price === 175 && (await historyFor(a.id)).quantity === 2, "failed group rolls back earlier lines and inventory");
  const batch = await request("POST", "/api/products/history/batch", token, { items: [
    { id: ha.id, cost_price: 200 }, { id: hb.id, cost_price: 250 },
  ] });
  assert(batch.length === 2 && (await saleFor(a.id)).cost_price === 200 && (await saleFor(b.id)).cost_price === 250, "group updates both matching sales atomically");
  await request("DELETE", `/api/sales/${a.id}`, token);
  assert(await stock() === 19 && !(await historyFor(a.id)) && !!(await historyFor(b.id)), "deletion after metadata edits restores correct quantity and only its history");
  await request("DELETE", `/api/products/${product.id}`, token);
  await request("PATCH", `/api/sales/${b.id}`, token, { cost_price: 80 });
  assert((await historyFor(b.id)).cost_price === 80 && (await saleFor(b.id)).product_id === null, "deleted catalog products retain editable historical linkage");
  await request("DELETE", `/api/sales/${b.id}`, token);
  assert(!(await historyFor(b.id)), "deleted product sale can still be canceled");
  const anonymous = await app.request(base + `/api/sales/${b.id}`, { method: "PATCH", body: "{}" });
  await anonymous.text();
  assert(anonymous.status === 401, "sale edits require employee authentication");
});

Deno.test("neutral documents keep one identity and legacy documents remain available", async () => {
  const user = (await sql`SELECT id FROM public.users WHERE username = 'test-admin'`)[0];
  const { createToken } = await import("../_shared/auth.ts");
  const token = await createToken({ id: user.id, username: "test-admin", name: "Tester", role: "admin", is_active: 1 });
  const body = { business: "오아시스", doc_date: "2026-10-14", recipient: "Document customer",
    total: 2000, memo: "Shared content", items: [{ name: "Shared product", spec: "Standard", qty: 2, price: 1000 }] };
  const first = await request("POST", "/api/documents", token, body);
  const second = await request("POST", "/api/documents", token, { ...body, doc_type: "" });
  assert(first.doc_type === "문서" && first.doc_no === "M00001" && first.issuer_name === "Tester", "untyped content gets neutral number and issuer");
  assert(second.doc_no === "M00002" && first.id !== second.id, "neutral numbers increment independently");
  const legacy = await request("POST", "/api/documents", token, { ...body, doc_type: "납품서" });
  assert(legacy.doc_no === "D00001" && legacy.doc_type === "납품서", "legacy client contract remains supported");
  const list = await request("GET", "/api/documents?business=" + encodeURIComponent("오아시스"), token);
  assert(list.length === 3 && list.some((doc: { id: number }) => doc.id === legacy.id), "neutral and legacy documents are listed together");
  const detail = await request("GET", `/api/documents/${first.id}`, token);
  assert(detail.doc_no === first.doc_no && detail.recipient === body.recipient && detail.total === body.total &&
    detail.issuer_name === "Tester" && JSON.stringify(JSON.parse(detail.items_json)) === JSON.stringify(body.items), "stored identity and shared content remain stable");
  await expectError("POST", "/api/documents", token, { ...body, doc_type: "constructor" });
  assert((await request("GET", "/api/documents", token)).length === 3, "invalid document kind cannot create a record");
  const staff = await request("POST", "/api/auth/users", token, {
    username: "document-staff", password: "test-only", name: "Document Staff", role: "staff",
  });
  const staffToken = await createToken({ id: staff.id, username: "document-staff", name: "Document Staff", role: "staff", is_active: 1 });
  await expectError("DELETE", `/api/documents/${first.id}`, staffToken, {}, 403);
  assert((await request("GET", `/api/documents/${first.id}`, token)).doc_no === first.doc_no, "only administrators can delete documents");
  for (const doc of [first, second, legacy]) await request("DELETE", `/api/documents/${doc.id}`, token);
  await request("DELETE", `/api/auth/users/${staff.id}`, token);
});
