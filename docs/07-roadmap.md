# Roadmap — what's next

A pointer to the concrete extension points that are on the table now that the showcase port is deployed. Items are roughly ordered by likely sequence; nothing here is committed timing.

---

## 1. Production back-end migration

Swap the four synthetic-data stubs in [`snow/scripted-rest/`](../snow/scripted-rest/) for GlideRecord-backed implementations against the real `wm_customer_order` / `wm_rfs_order` / `wm_task` tables.

- **Scope:** four Scripted REST resources, one Script Include, one System Property.
- **Reference:** [05-scripted-rest.md](05-scripted-rest.md) for the recipe, [04-data-model.md](04-data-model.md) for the schema.
- **Risk:** the `tasks` map key (canonical German `short_description`) is the #1 thing to get exactly right. See [05-scripted-rest.md §2.4](05-scripted-rest.md#24-critical-detail--the-tasks-map-key).
- **Acceptance:** matrix renders against production data, paginator counts match a direct `GlideAggregate` count of `wm_customer_order`, the `attention` filter shrinks the list as expected.

---

## 2. Path B — translate vendor to NXF idiom

Path A (this repo) wraps the four Web Components as-is. Path B rewrites each into a `createCustomElement` block with snabbdom view, declarative `actionHandlers`, and properties. Three pay-offs:

- **No visual clash.** The wrapper currently paints its own topbar + tab-strip + sidebar AND the Workspace App Shell stacks SNOW's own chrome on top. Under Path B the inner shell elements become first-class NXF components that integrate with the Workspace shell, removing the duplication.
- **UI Builder configurability.** Right now the only Builder-bindable thing is the wrapper's `endpoint` / `baseUrl`. Under Path B, the matrix's events (`customer-order:open`, `task:open`) become NXF-namespaced (`HFS#CUSTOMER_ORDER_OPENED`) and admins can wire them to other components on the page.
- **Standard Polaris token cascade.** No more `--hfs-*` shim layer — components read `--now-*` directly.

The migration is largely mechanical:

1. Each `vendor/*.js` file becomes its own `createCustomElement`. Tag names stay the same (`wo-status-matrix`, etc.) so the wrapper's view doesn't change.
2. `innerHTML` template strings become snabbdom views — `<table>` → `<table>`, attributes carry over, only event binding syntax differs.
3. DOM-as-state becomes `initialState` + `updateState`. Today the matrix stores `_limit` / `_offset` as instance fields; tomorrow they're `state.limit` / `state.offset`.
4. The four `document.dispatchEvent` / `this.dispatchEvent` calls become `dispatch('HFS#…', payload)`.

**Trigger:** when business or UI Builder admins start asking "can we expose these events to other components?" or "can I configure the matrix from UI Builder without writing JS?". Until then, Path A is fine.

---

## 3. Write actions

The component is currently read-only — no `POST` / `PATCH` / `DELETE`. Reasonable next steps:

- **Schedule appointment** — the "Schedule Appointment" button in `<customer-order-detail-tab>` currently dispatches a `ui:toast` "demo only" message. Wire it to a Scripted REST `POST /customer-orders/{uuid}/schedule` that writes `wm_customer_order.scheduled_appointment`.
- **Task reassignment** — clicking a task could open an inline editor on `assignment_group`. Needs a `PATCH /tasks/{taskId}` + an ACL gate on the dispatcher role.
- **Bulk close** — multi-select rows in the matrix, then a workspace action button "Close X orders". Cross-cuts the macroponent's action handlers + a new Scripted REST.

Each of these is a discrete project. Specify the contract additions in [03-api-contract.md](03-api-contract.md) before writing code — that's where consumers (and future engineers) look first.

---

## 4. Smart filters

The sidebar has two static entries (`Legacy Orders`, `Needs Attention`). Realistic additions:

- **By city / region** — server-side `addQuery('city', city)`, sidebar dynamically populated from a `GlideAggregate` over `wm_customer_order.city`.
- **By assignment group** — sidebar lists groups, click filters to "orders with ≥ 1 task assigned to this group".
- **By construction status** — group by `construction_status`, click filters.
- **Saved filters per user** — store in `sys_user_preferences`, sync sidebar state.

The matrix endpoint's `list` parameter is currently a string enum (`legacy` | `attention`). Generalising to a JSON filter blob makes the API more expressive at the cost of contract churn — decide before extending.

---

## 5. Real-time refresh

`Last refreshed just now` in the action bar is currently a placeholder string. Two ways forward:

- **Manual refresh button** — adds a `🔄` icon that re-runs the matrix fetch and updates the timestamp. Small change to the wrapper view + a new `state.lastRefreshed`.
- **Auto-refresh on a timer** — every 60s, refetch silently. Risk: load on the Scripted REST endpoint scales with concurrent dispatcher sessions.
- **Server-push via AMB / WebSocket** — `wm_task` state changes push to subscribed clients. SNOW's AMB stack supports this but adds infrastructure. Probably only worth it once dispatcher headcount > 20.

---

## 6. Role gating + ACLs

The showcase Scripted REST stubs accept any authenticated user. Production needs:

- **Read ACLs** on `wm_customer_order` / `wm_rfs_order` / `wm_task` for the dispatcher role.
- **Field-level ACLs** if sensitive fields (`customer_name`, `phone`) shouldn't appear in the merged CO detail tab for non-dispatcher viewers.
- **Workspace role gating** — the Configurable Workspace already supports this; just configure under "Roles" on the workspace record.
- **Per-script "Run as" override** if you want the matrix to bypass row-level ACLs for a global view.

See [05-scripted-rest.md §6](05-scripted-rest.md#6-acls-and-security) for the ACL primer.

---

## 7. Polaris token re-audit

The `--hfs-*` → `--now-*` mapping in [`styles.scss`](../src/x-2057350-wo-matrix/styles.scss) was authored against the Horizon Design System release current at deployment time. SNOW renames tokens occasionally; on a major release bump:

1. Check `sys_ux_lib_style` records for the current token names.
2. Audit each `--hfs-*` line against the actual Polaris release.
3. Update mappings where tokens were renamed; leave literal fallbacks for tokens that disappeared entirely.

This is a maintenance task, ~1 hour per release.

---

## 8. Smaller cleanups

- **Sourcing the task registry from one place.** Currently `task-columns.json` ships in `src/x-2057350-wo-matrix/vendor/` AND is duplicated inside each of the four [`snow/scripted-rest/*.js`](../snow/scripted-rest/) stubs. Production should have a single source — a Script Include `HFSMatrixUtil.getTaskColumns()` reading from the System Property. Already drafted in [05-scripted-rest.md §0.3](05-scripted-rest.md#03-create-a-script-include-for-shared-helpers).
- **`@servicenow/cli` version bumps** — when the upstream Ajv version skew is fixed, drop `patches/@servicenow+ui-core+24.1.1.patch` and the `postinstall` hook. Quick check on each CLI upgrade: rename the patches/ dir, run `npm install` + `snc ui-component develop`; if the bundle initialises cleanly, the patch is no longer needed.
- **Tighten the `uuid` format check** in the customer-order detail script — the showcase uses `/^[\w-]+$/` because the synthetic ids look like `co-001`. Production uuids are 32-char hex; update the regex once you migrate.
- **`gs.error()` log scraping** — set up a saved Filter on `syslog` for `HFS Matrix REST error` so unhandled exceptions in the four endpoints surface in the dispatcher's view.

---

## See also

- [03-api-contract.md §F](03-api-contract.md#f-out-of-scope-intentionally) — features intentionally out of scope for v1
- [06-component-anatomy.md](06-component-anatomy.md) — what the codebase looks like today
