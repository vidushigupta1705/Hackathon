// Demo project "Acme Commerce": four interconnected repositories + five open pull requests.
// Source snippets use `~` for backticks and `#{` for `${` (decoded by fx()).
const fx = (s: string) => s.replace(/#\{/g, "${").replace(/~/g, "`").replace(/^\n/, "");

export interface DemoRepo {
  fullName: string;
  description: string;
  packageName: string;
  files: Record<string, string>;
  authors: string[];
  commits: string[];
}

export interface DemoPR {
  repo: string;
  number: number;
  title: string;
  body: string;
  author: string;
  headBranch: string;
  hoursAgo: number;
  files: { path: string; status: "added" | "modified" | "removed"; content: string | null }[];
}

// ------------------------------------------------------------------ user-service
const userTypes = fx(`
export interface User {
  id: number;
  email: string;
  name: string;
  role: "admin" | "member";
  createdAt: string;
}

export interface CreateUserInput {
  email: string;
  name: string;
}
`);

const userUsers = fx(`
import { User, CreateUserInput } from "./types";

const store = new Map<number, User>();
let nextId = 1;

export async function getUser(id: number): Promise<User> {
  const user = store.get(id);
  if (!user) throw new Error("User not found: " + id);
  return user;
}

export async function listUsers(limit: number = 50): Promise<User[]> {
  return Array.from(store.values()).slice(0, limit);
}

export async function createUser(input: CreateUserInput): Promise<User> {
  const user: User = { id: nextId++, email: input.email, name: input.name, role: "member", createdAt: new Date().toISOString() };
  store.set(user.id, user);
  return user;
}

export async function deleteUser(id: number): Promise<void> {
  store.delete(id);
}

export function isAdmin(user: User): boolean {
  return user.role === "admin";
}
`);

const userIndex = fx(`
export * from "./users";
export * from "./types";
`);

const userServer = fx(`
import express from "express";
import { getUser, listUsers, createUser, deleteUser } from "./users";

const app = express();
app.use(express.json());

app.get("/users/:id", async (req, res) => {
  const user = await getUser(Number(req.params.id));
  res.json(user);
});

app.get("/users", async (_req, res) => {
  res.json(await listUsers());
});

app.post("/users", async (req, res) => {
  res.status(201).json(await createUser(req.body));
});

app.delete("/users/:id", async (req, res) => {
  await deleteUser(Number(req.params.id));
  res.sendStatus(204);
});

app.listen(3001);
`);

const userTest = fx(`
import { describe, it, expect } from "vitest";
import { getUser, createUser, isAdmin } from "../src/users";

describe("users", () => {
  it("creates and fetches a user", async () => {
    const created = await createUser({ email: "ada@acme.dev", name: "Ada" });
    const fetched = await getUser(created.id);
    expect(fetched.email).toBe("ada@acme.dev");
  });

  it("detects admins", () => {
    expect(isAdmin({ id: 1, email: "x@acme.dev", name: "X", role: "admin", createdAt: "" })).toBe(true);
  });
});
`);

const userPkg = (zod: string) =>
  JSON.stringify({ name: "@acme/user-service", version: "1.4.2", dependencies: { express: "^4.19.2", zod }, devDependencies: { typescript: "^5.4.0", vitest: "^1.6.0" } }, null, 2);

// ------------------------------------------------------------------ order-service
const orderOrders = fx(`
import { getUser, User } from "@acme/user-service";

const BILLING_URL = process.env.BILLING_URL ?? "http://billing:3003";

export interface OrderItem {
  sku: string;
  qty: number;
  price: number;
}

export interface Order {
  id: string;
  userId: number;
  items: OrderItem[];
  total: number;
  status: "pending" | "paid" | "failed";
}

const orders = new Map<string, Order>();

export async function createOrder(userId: number, items: OrderItem[]): Promise<Order> {
  const user: User = await getUser(userId);
  const total = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const order: Order = { id: "ord_" + orders.size, userId: user.id, items, total, status: "pending" };
  const res = await fetch(~#{BILLING_URL}/billing/charge~, {
    method: "POST",
    body: JSON.stringify({ userId, amount: total }),
  });
  order.status = res.ok ? "paid" : "failed";
  orders.set(order.id, order);
  console.log("Order placed for " + user.email);
  return order;
}

export async function getOrder(id: string): Promise<Order | undefined> {
  return orders.get(id);
}

export async function getOrderStatus(id: string): Promise<string> {
  return orders.get(id)?.status ?? "unknown";
}

export function orderSummary(order: Order): string {
  return order.id + ": " + order.items.length + " items, total " + order.total;
}
`);

const orderServer = fx(`
import express from "express";
import { createOrder, getOrder, getOrderStatus } from "./orders";

const app = express();
app.use(express.json());

app.post("/orders", async (req, res) => {
  const order = await createOrder(req.body.userId, req.body.items);
  res.status(201).json(order);
});

app.get("/orders/:id", async (req, res) => {
  res.json(await getOrder(req.params.id));
});

app.get("/orders/:id/status", async (req, res) => {
  res.json(await getOrderStatus(req.params.id));
});

app.listen(3002);
`);

const orderTest = fx(`
import { describe, it, expect } from "vitest";
import { createOrder, getOrder } from "../src/orders";

describe("orders", () => {
  it("creates an order", async () => {
    const order = await createOrder(1, [{ sku: "sku-1", qty: 2, price: 10 }]);
    expect(order.total).toBe(20);
    expect(await getOrder(order.id)).toBeDefined();
  });
});
`);

const orderPkg = JSON.stringify(
  { name: "@acme/order-service", version: "2.1.0", dependencies: { "@acme/user-service": "^1.4.0", express: "^4.19.2", zod: "^3.22.4" }, devDependencies: { vitest: "^1.6.0" } },
  null,
  2,
);

// ------------------------------------------------------------------ billing-service
const billingBilling = (formatBody: string, extra = "") =>
  fx(`
import { getUser, isAdmin, deleteUser } from "@acme/user-service";

const ORDER_URL = process.env.ORDER_URL ?? "http://orders:3002";

export interface Invoice {
  id: string;
  userId: number;
  amount: number;
  currency: string;
  issuedAt: string;
}

const invoices: Invoice[] = [];

export async function chargeCustomer(userId: number, amount: number): Promise<Invoice> {
  const user = await getUser(userId);
  const payable = isAdmin(user) ? 0 : amount;
  const invoice: Invoice = { id: "inv_" + invoices.length, userId, amount: payable, currency: "USD", issuedAt: new Date().toISOString() };
  invoices.push(invoice);
  return invoice;
}

export async function reconcileOrder(orderId: string) {
  const res = await fetch(~#{ORDER_URL}/orders/#{orderId}~);
  return res.json();
}

export function listInvoices(userId: number): Invoice[] {
  return invoices.filter((i) => i.userId === userId);
}

${formatBody}

export async function eraseCustomer(userId: number): Promise<void> {
  await deleteUser(userId);
}
${extra}`);

const billingFormatBase = fx(`
export function formatInvoice(invoice: Invoice): string {
  return "#" + invoice.id + " — " + invoice.amount + " " + invoice.currency;
}`);

const billingServer = fx(`
import express from "express";
import { chargeCustomer, listInvoices, reconcileOrder } from "./billing";

const app = express();
app.use(express.json());

app.post("/billing/charge", async (req, res) => {
  const invoice = await chargeCustomer(req.body.userId, req.body.amount);
  res.json(invoice);
});

app.get("/billing/invoices/:userId", (req, res) => {
  res.json(listInvoices(Number(req.params.userId)));
});

app.post("/billing/reconcile", async (req, res) => {
  res.json(await reconcileOrder(req.body.orderId));
});

app.listen(3003);
`);

const billingTest = fx(`
import { describe, it, expect } from "vitest";
import { chargeCustomer } from "../src/billing";

describe("billing", () => {
  it("charges a customer", async () => {
    const invoice = await chargeCustomer(1, 100);
    expect(invoice.amount).toBe(100);
  });
});
`);

const billingPkg = (stripe: string) =>
  JSON.stringify({ name: "@acme/billing-service", version: "1.2.0", dependencies: { "@acme/user-service": "^1.4.0", express: "^4.19.2", stripe }, devDependencies: { vitest: "^1.6.0" } }, null, 2);

// ------------------------------------------------------------------ web-gateway
const gwOrders = (withRetry: boolean) =>
  fx(`
const ORDER_API = process.env.ORDER_API_URL ?? "http://orders:3002";
${
  withRetry
    ? `
async function withRetry<T>(fn: () => Promise<T>, retries: number): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 0) throw err;
    return withRetry(fn, retries - 1);
  }
}
`
    : ""
}
export async function placeOrder(userId: number, items: unknown[]) {
  const res = await fetch(~#{ORDER_API}/orders~, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId, items }),
  });
  return res.json();
}

export async function getOrder(${withRetry ? "id: string, retries = 2" : "id: string"}) {
  ${withRetry ? "const res = await withRetry(() => fetch(~#{ORDER_API}/orders/#{id}~), retries);" : "const res = await fetch(~#{ORDER_API}/orders/#{id}~);"}
  return res.json();
}

export async function getOrderTracking(id: string) {
  const res = await fetch(~#{ORDER_API}/orders/#{id}/status~);
  return res.text();
}
`);

const gwBilling = fx(`
const BILLING_API = process.env.BILLING_API_URL ?? "http://billing:3003";

export async function getInvoices(userId: number) {
  const res = await fetch(~#{BILLING_API}/billing/invoices/#{userId}~);
  return res.json();
}
`);

const gwCheckout = fx(`
import { createOrder } from "@acme/order-service";
import type { OrderItem } from "@acme/order-service";

export async function quickCheckout(userId: number, items: OrderItem[]) {
  const order = await createOrder(userId, items);
  return order.id;
}
`);

const gwTracking = fx(`
import { useEffect, useState } from "react";
import { getOrderTracking } from "../api/orders";

export function TrackingWidget({ id }: { id: string }) {
  const [status, setStatus] = useState("loading");
  useEffect(() => {
    getOrderTracking(id).then(setStatus);
  }, [id]);
  return <span className="status">{status}</span>;
}
`);

const gwButton = fx(`
import { quickCheckout } from "../checkout";
import type { OrderItem } from "@acme/order-service";

export function CheckoutButton({ userId, items }: { userId: number; items: OrderItem[] }) {
  return <button onClick={() => quickCheckout(userId, items)}>Buy now</button>;
}
`);

const gwTest = fx(`
import { describe, it, expect } from "vitest";
import { getOrder, placeOrder } from "../src/api/orders";

describe("orders api", () => {
  it("fetches and places orders", async () => {
    expect(typeof getOrder).toBe("function");
    expect(typeof placeOrder).toBe("function");
  });
});
`);

const gwPkg = JSON.stringify(
  { name: "@acme/web-gateway", version: "0.9.0", dependencies: { "@acme/order-service": "^2.1.0", next: "^14.2.3", react: "^18.3.1" }, devDependencies: { vitest: "^1.6.0" } },
  null,
  2,
);

// ------------------------------------------------------------------ repos
export const DEMO_REPOS: DemoRepo[] = [
  {
    fullName: "acme-commerce/user-service",
    description: "Identity & profile service — owns the User model and /users API",
    packageName: "@acme/user-service",
    authors: ["ada", "grace", "linus"],
    commits: ["feat: add role to user model", "fix: pagination limit on listUsers", "chore: bump express to 4.19", "feat: export isAdmin helper", "refactor: extract types module", "docs: describe public API"],
    files: {
      "package.json": userPkg("^3.22.4"),
      "src/types.ts": userTypes,
      "src/users.ts": userUsers,
      "src/index.ts": userIndex,
      "src/server.ts": userServer,
      "tests/users.test.ts": userTest,
    },
  },
  {
    fullName: "acme-commerce/order-service",
    description: "Order lifecycle: validates users, creates orders, triggers billing",
    packageName: "@acme/order-service",
    authors: ["margaret", "ken", "ada"],
    commits: ["feat: charge customer on order creation", "fix: total rounding", "feat: order status endpoint", "chore: upgrade vitest", "feat: orderSummary helper"],
    files: {
      "package.json": orderPkg,
      "src/orders.ts": orderOrders,
      "src/server.ts": orderServer,
      "src/index.ts": fx(`export * from "./orders";\n`),
      "tests/orders.test.ts": orderTest,
    },
  },
  {
    fullName: "acme-commerce/billing-service",
    description: "Invoices and payments; reconciles against orders",
    packageName: "@acme/billing-service",
    authors: ["dennis", "barbara", "grace"],
    commits: ["feat: invoice listing", "fix: admin accounts are free", "feat: reconcile endpoint", "chore: stripe sdk bump", "feat: GDPR erase customer"],
    files: {
      "package.json": billingPkg("^14.21.0"),
      "src/billing.ts": billingBilling(billingFormatBase),
      "src/server.ts": billingServer,
      "tests/billing.test.ts": billingTest,
    },
  },
  {
    fullName: "acme-commerce/web-gateway",
    description: "Backend-for-frontend + React widgets consuming order & billing APIs",
    packageName: "@acme/web-gateway",
    authors: ["tim", "sheryl", "margaret"],
    commits: ["feat: tracking widget", "feat: quick checkout button", "fix: invoice fetch typing", "chore: next 14.2", "feat: billing api client"],
    files: {
      "package.json": gwPkg,
      "src/api/orders.ts": gwOrders(false),
      "src/api/billing.ts": gwBilling,
      "src/checkout.ts": gwCheckout,
      "src/components/Tracking.tsx": gwTracking,
      "src/components/CheckoutButton.tsx": gwButton,
      "tests/api.test.ts": gwTest,
    },
  },
];

// ------------------------------------------------------------------ pull requests
const userTypesUuid = userTypes.replace("id: number;", "id: string;");

const userUsersUuid = fx(`
import { User, CreateUserInput } from "./types";

const store = new Map<string, User>();

export async function getUser(id: string): Promise<User> {
  const user = store.get(id);
  if (!user) throw new Error("User not found: " + id);
  return user;
}

export async function listUsers(limit: number = 50): Promise<User[]> {
  return Array.from(store.values()).slice(0, limit);
}

export async function createUser(input: CreateUserInput): Promise<User> {
  const user: User = { id: crypto.randomUUID(), email: input.email, name: input.name, role: "member", createdAt: new Date().toISOString() };
  store.set(user.id, user);
  return user;
}

export async function removeUser(id: string): Promise<void> {
  store.delete(id);
}

export function isAdmin(user: User): boolean {
  return user.role === "admin";
}
`);

const userServerUuid = userServer
  .replace("deleteUser }", "removeUser }")
  .replace("getUser(Number(req.params.id))", "getUser(req.params.id)")
  .replace("await deleteUser(Number(req.params.id))", "await removeUser(req.params.id)");

const userUsersNullable = userUsers
  .replace("Promise<User> {\n  const user = store.get(id);\n  if (!user) throw new Error(\"User not found: \" + id);\n  return user;", "Promise<User | null> {\n  return store.get(id) ?? null;")
  .replace('role: "member", createdAt', 'role: "member", avatarUrl: "", createdAt');
const userTypesAvatar = userTypes.replace("  createdAt: string;\n}", "  createdAt: string;\n  avatarUrl: string;\n  locale?: string;\n}");

const orderOrdersCurrency = orderOrders
  .replace("items: OrderItem[]): Promise<Order> {", "items: OrderItem[], currency: string): Promise<Order> {")
  .replace("amount: total }", "amount: total, currency }");
const orderServerTracking = orderServer
  .replace("createOrder(req.body.userId, req.body.items)", "createOrder(req.body.userId, req.body.items, req.body.currency)")
  .replace('"/orders/:id/status"', '"/orders/:id/tracking"');

export const DEMO_PRS: DemoPR[] = [
  {
    repo: "acme-commerce/user-service",
    number: 41,
    title: "Migrate user IDs from integers to UUID strings",
    body: "Switches the primary key of `User` to a UUID string, renames `deleteUser` → `removeUser` and upgrades zod to v4.",
    author: "grace",
    headBranch: "feat/uuid-user-ids",
    hoursAgo: 5,
    files: [
      { path: "src/types.ts", status: "modified", content: userTypesUuid },
      { path: "src/users.ts", status: "modified", content: userUsersUuid },
      { path: "src/server.ts", status: "modified", content: userServerUuid },
      { path: "package.json", status: "modified", content: userPkg("^4.0.0") },
    ],
  },
  {
    repo: "acme-commerce/order-service",
    number: 42,
    title: "Multi-currency orders: require currency, rename status endpoint",
    body: "`createOrder` now needs a `currency`. The status endpoint moves to `/orders/:id/tracking`.",
    author: "margaret",
    headBranch: "feat/multi-currency",
    hoursAgo: 12,
    files: [
      { path: "src/orders.ts", status: "modified", content: orderOrdersCurrency },
      { path: "src/server.ts", status: "modified", content: orderServerTracking },
    ],
  },
  {
    repo: "acme-commerce/user-service",
    number: 45,
    title: "Return null for unknown users and add avatar support",
    body: "`getUser` no longer throws when a user is missing. Adds required `avatarUrl` and optional `locale` to User.",
    author: "linus",
    headBranch: "feat/avatar-nullable-user",
    hoursAgo: 2,
    files: [
      { path: "src/types.ts", status: "modified", content: userTypesAvatar },
      { path: "src/users.ts", status: "modified", content: userUsersNullable },
    ],
  },
  {
    repo: "acme-commerce/billing-service",
    number: 43,
    title: "Locale-aware invoice formatting",
    body: "Adds an optional `locale` to `formatInvoice` and a new `invoiceTotal` helper. Bumps stripe patch version.",
    author: "barbara",
    headBranch: "chore/invoice-format",
    hoursAgo: 26,
    files: [
      {
        path: "src/billing.ts",
        status: "modified",
        content: billingBilling(
          fx(`
export function formatInvoice(invoice: Invoice, locale = "en-US"): string {
  return "#" + invoice.id + " — " + invoice.amount.toLocaleString(locale) + " " + invoice.currency;
}`),
          fx(`
export function invoiceTotal(list: Invoice[]): number {
  return list.reduce((sum, i) => sum + i.amount, 0);
}
`),
        ),
      },
      { path: "package.json", status: "modified", content: billingPkg("^14.25.0") },
    ],
  },
  {
    repo: "acme-commerce/web-gateway",
    number: 44,
    title: "Add retry with backoff to the orders API client",
    body: "Wraps order fetches in a small retry helper.",
    author: "tim",
    headBranch: "fix/api-retry",
    hoursAgo: 30,
    files: [{ path: "src/api/orders.ts", status: "modified", content: gwOrders(true) }],
  },
];
