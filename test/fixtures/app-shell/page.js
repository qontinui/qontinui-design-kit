// The AppShell browser page: one element tree, built by the same function on
// the server (renderToString, in the test) and in the browser (hydrateRoot, in
// main.js), so the hydrated page is the server-rendered one. No imports: the
// caller passes React's createElement and the AppShell.
//
// Nine permitted entries, one denied entry shown disabled with its reason
// (`users`) and one denied entry hidden (`settings`), under the permissions in
// `held`. The page body is the shell fixture's: a 4000 px page with a focusable
// control and an end-of-page element.
export const SPEC = {
  id: "shell",
  product: "Shop",
  current: "overview",
  held: ["orders.view"],
  account: { name: "Ada Lovelace", role: "Purchasing", items: [{ id: "profile", label: "Profile", href: "#profile" }] },
  cart: { label: "Cart", href: "#cart", count: 2 },
  sections: [
    {
      id: "work",
      label: "Work",
      entries: [
        { id: "overview", label: "Overview", href: "#overview" },
        { id: "orders", label: "Orders", href: "#orders", requires: "orders.view" },
        { id: "products", label: "Products", href: "#products" },
        { id: "customers", label: "Customers", href: "#customers" },
        { id: "invoices", label: "Invoices", href: "#invoices" },
        { id: "reports", label: "Reports", href: "#reports" },
        { id: "reorder", label: "Reorder", href: "#reorder" },
        { id: "help", label: "Help", href: "#help" },
      ],
    },
    {
      id: "admin",
      label: "Admin",
      entries: [
        { id: "company", label: "Company profile", href: "#company" },
        { id: "users", label: "Users", href: "#users", requires: "users.manage", whenDenied: "disable", reason: "Only an owner manages users" },
        { id: "settings", label: "Settings", href: "#settings", requires: "company.manage" },
      ],
    },
  ],
};

/** The entries `held` permits, in navigation order. */
export const PERMITTED = ["overview", "orders", "products", "customers", "invoices", "reports", "reorder", "help", "company"];

export function page(h, AppShell, spec) {
  const { held, ...props } = spec;
  return h(
    AppShell,
    { ...props, can: (p) => held.includes(p) },
    h("p", null, "The first paragraph of a long page."),
    h("div", { style: { height: "1000px" } }),
    h("button", { id: "body-control", type: "button" }, "A control in the body"),
    h("div", { style: { height: "3000px" } }),
    h("a", { id: "page-end", href: "#" }, "The end of the page"),
  );
}
