# API contract — JSON shapes the component expects

**Audience:** engineer writing or extending the Scripted REST resources behind this component.
**Authority:** if anything in this doc disagrees with the four files in [`src/x-2057350-wo-matrix/vendor/`](../src/x-2057350-wo-matrix/vendor/), the vendor code is correct — it's the consumer. Update this doc.

This is the wire contract. Four endpoints, documented in the order the component hits them. SNOW wraps every response in a `{"result": ...}` envelope automatically; the vendor strips that before consuming. The shapes below describe **the un-wrapped payload** — what your GlideScript passes to `response.setBody(...)`.

---

## 0. Architecture at a glance

```
┌────────────── BROWSER (NXF host) ──────────────┐
│  src/x-2057350-wo-matrix/                      │
│    index.js          wrapper view (snabbdom)   │
│    vendor/                                     │
│      <wo-status-matrix>  pivot view            │
│      <customer-order-detail-tab> merged CO     │
│      <rfs-detail-tab>            RFS pane      │
│      <task-detail-tab>           task pane     │
│      <tab-strip>                 tab manager   │
└────────────────────────────────────────────────┘
                   │
                   │ fetch(JSON)
                   ▼
┌────────────── REST API CONTRACT ───────────────┐
│  GET /api/<ns>/work-orders/matrix              │
│  GET /api/<ns>/customer-orders/{uuid}          │
│  GET /api/<ns>/rfs-orders/{rfsId}              │
│  GET /api/<ns>/customer-orders/{uuid}/         │
│            tasks/{taskName}                    │
└────────────────────────────────────────────────┘
```

`<ns>` is the Scripted REST namespace — on a PDI it's the bare digits of your developer ID (e.g. `2057350`); on a scoped instance it's whatever your platform team assigned. See [05-scripted-rest.md §0.1](05-scripted-rest.md#01-create-the-scripted-rest-service) for namespace setup.

The wrapper component exposes two UI Builder properties:

| Property | Default | Used for |
|---|---|---|
| `Matrix endpoint URL` | `/api/x_2057350_wo_mat_0/work-orders/matrix` | Set on `<wo-status-matrix data-endpoint=…>` |
| `Detail API base URL` | `/api/x_2057350_wo_mat_0` | Prepended by each detail tab to its own resource path |

---

## A. Custom Element API

### A.0 Conventions

- All five vendor elements are defined via `customElements.define()` and attach an **open** Shadow DOM in `connectedCallback`.
- Configuration is via **`data-*` attributes** only. No properties, no methods on instances.
- Cross-component communication is via **`CustomEvent` dispatched on the element itself** with `bubbles: true, composed: true`. Events bubble up to whichever root hosts the components — `document` in light-DOM contexts, the NXF host's shadow root in this repo. See [06-component-anatomy.md §3](06-component-anatomy.md) for why this differs from the original demonstrator's `document.dispatchEvent`.

### A.1 `<wo-status-matrix>`

The pivot view. Reads a paginated list of Customer Orders from the matrix endpoint and renders them as one row per CO × one column per task.

**Attributes** *(read on connect and on change)*:

| Attribute | Type | Default | Description |
|---|---|---|---|
| `data-endpoint` | URL string | `/api/x_2057350_wo_mat_0/work-orders/matrix` | Matrix endpoint URL. The component appends `?list=&limit=&offset=`. |
| `data-base-url` | URL string | `/api` | Prefix the detail tabs use to build their own fetch URLs. Propagated through the event details when a CO / task is clicked. |
| `data-list` | `"legacy" \| "attention"` | `"legacy"` | Filter — `legacy` returns all COs, `attention` returns only COs with ≥ 1 task in state `"Problem"` or `construction_status: "Fallout"`. |
| `data-tab-pane` | string | — | Set by `<tab-strip>` so the strip can show/hide this pane. Honour `[hidden]` to disable. |

**Observed attributes:** `["data-list"]`. Changing `data-list` triggers a refetch and resets to offset 0.

**Events emitted** *(from `this`, bubbling)*:

| Event | `detail` shape | Triggered by |
|---|---|---|
| `customer-order:open` | `{ coUuid, coNumber, baseUrl }` | Click on the `CUSTOMER ORDER` cell of any row. |
| `task:open` | `{ coUuid, coNumber, taskName, baseUrl }` | Click on any task-state dot (except `not applicable`). `taskName` is the **canonical German name** (e.g. `"HV-S"`, `"GIS Planung"`). |

**Layout requirements:** the host must be a flex container or have a definite height; the table is internally scrollable.

---

### A.2 `<customer-order-detail-tab>`

Customer Order detail pane. Renders header info + RFS pills + a flattened list of all 17 tasks for the CO.

**Attributes:**

| Attribute | Type | Required | Description |
|---|---|---|---|
| `data-co-uuid` | string | yes | UUID of the Customer Order. |
| `data-co-number` | string | yes | Human-readable CO number (e.g. `WO10001`). |
| `data-base-url` | string | no | API namespace prefix. Default `/api` keeps the original demonstrator working unchanged. |
| `data-tab-pane` | string | yes | Tab id, used by `<tab-strip>` to show/hide. |

**Events emitted:**

| Event | `detail` | Triggered by |
|---|---|---|
| `rfs:open` | `{ rfsId, rfsNumber, rfsType, baseUrl }` | Click on an RFS pill. |
| `task:open` | `{ coUuid, coNumber, taskName, baseUrl }` | Click on any task row. |
| `tab:close` | `{ tabId }` | Click on the close `×`. |
| `ui:toast` | `{ message }` | Click on "Schedule Appointment" (demo-only stub). |

**On connect** it fetches `GET ${baseUrl}/customer-orders/${coUuid}`.

---

### A.3 `<rfs-detail-tab>`

RFS Work Order detail pane. Shows the parent CO breadcrumb + RFS-scoped task list (LMA RFS owns tasks 1-7, Connectivity RFS owns tasks 8-17).

**Attributes:**

| Attribute | Type | Required | Description |
|---|---|---|---|
| `data-rfs-id` | string | yes | `sys_id` of the RFS Work Order. |
| `data-rfs-number` | string | yes | Human-readable RFS number (e.g. `RFS20001`). |
| `data-base-url` | string | no | API namespace prefix. |
| `data-tab-pane` | string | yes | Tab id. |

**Events emitted:**

| Event | `detail` | Triggered by |
|---|---|---|
| `customer-order:open` | `{ coUuid, coNumber, baseUrl }` | Click on the parent-CO breadcrumb link. |
| `task:open` | `{ coUuid, coNumber, taskName, baseUrl }` | Click on any task row. |
| `tab:close` | `{ tabId }` | Click on the close `×`. |

**On connect** it fetches `GET ${baseUrl}/rfs-orders/${rfsId}`.

---

### A.4 `<task-detail-tab>`

Single-task detail pane. Renders state, assignment group, sys_updated_on, and rfs_type.

**Attributes:**

| Attribute | Type | Required | Description |
|---|---|---|---|
| `data-co-uuid` | string | yes | Parent CO UUID. |
| `data-co-number` | string | yes | Parent CO number for display. |
| `data-task-name` | string | yes | Canonical German task name. |
| `data-base-url` | string | no | API namespace prefix. |
| `data-tab-pane` | string | yes | Tab id. |

**Events emitted:**

| Event | `detail` | Triggered by |
|---|---|---|
| `tab:close` | `{ tabId }` | Click on the close `×`. |

**On connect** it fetches `GET ${baseUrl}/customer-orders/${coUuid}/tasks/${encodeURIComponent(taskName)}`.

---

### A.5 `<tab-strip>`

Workspace tab manager. Renders tab buttons across the top and shows/hides panes inside the `.content` area.

**Children (slotted):** any number of `<button slot="tab">` elements. The first one (typically the matrix tab) is permanent — its close button is hidden via CSS.

**Tab button structure** *(set by `_mkTabButton` for dynamic tabs; authored in JSX for the permanent matrix tab in `src/x-2057350-wo-matrix/index.js`)*:

```html
<button slot="tab" data-tab-id="…" data-tab-type="list|wo|co|task" class="active">
  <svg>…icon…</svg>
  <span class="tab-label">Display label</span>
  <span class="tab-close" role="button" aria-label="Close tab">…✕…</span>
</button>
```

`data-tab-type` drives the per-type accent colour via the CSS custom property `--tab-accent` (see [§C](#c-css-token-contract)).

**Events listened (on `this.getRootNode()`):**

| Event | What it does |
|---|---|
| `customer-order:open` | If a CO tab already exists for that `coUuid`, activate it. Otherwise create `<customer-order-detail-tab>` + tab button (`data-tab-type="co"`) and activate it. |
| `rfs:open` | Same, for `<rfs-detail-tab>` (`data-tab-type="wo"` — RFS reuses the WO accent). |
| `task:open` | Same, for `<task-detail-tab>` (`data-tab-type="task"`). The tab id encodes `coUuid` + sanitised `taskName` so the same task on different COs gets distinct tabs. |
| `tab:close` | Remove the tab button + pane for `tabId`, fall back to the matrix tab. Ignores `tabId === "matrix"`. |

`getRootNode()` returns `document` in light-DOM contexts, the NXF host's shadow root in this repo. See [06-component-anatomy.md §3.2](06-component-anatomy.md).

**Events emitted:** `tab:close` (when the user clicks the close icon on any closeable tab). Tab-strip is a sink for incoming events; it only emits the close event itself.

---

### A.6 Event contract — full picture

```
<wo-status-matrix>     <customer-order-detail-tab>     <rfs-detail-tab>     <task-detail-tab>
       │                          │                          │                       │
       │ click CUSTOMER ORDER     │ click RFS pill           │ click breadcrumb     │ click ×
       │   customer-order:open    │   rfs:open               │   customer-order:    │   tab:close
       │ click task dot           │ click task row           │     open             │
       │   task:open              │   task:open              │ click task row       │
       │                          │ click ×                  │   task:open          │
       │                          │   tab:close              │ click ×              │
       │                          │ click "Schedule"         │   tab:close          │
       │                          │   ui:toast               │                      │
       ▼                          ▼                          ▼                      ▼
─────────────── this.dispatchEvent(…, {bubbles, composed}) ───────────────
                                  │
                                  │ bubbles to shared root
                                  ▼
                          <tab-strip>  (creates/activates/closes tabs)
```

All events use `bubbles: true, composed: true`. The strip is the only thing in the system that holds tab state; everything else is stateless w.r.t. tab management.

---

## B. REST API

### B.0 Conventions

- **Method:** `GET` only. The component is read-only.
- **Content-Type:** `application/json; charset=utf-8`.
- **Envelope:** SNOW wraps the payload in `{"result": <payload>}`. The vendor strips this; the shapes below describe `<payload>`.
- **Auth:** Scripted REST default — authenticated user; ACL'd to read the underlying tables. The four showcase stubs in [`snow/scripted-rest/`](../snow/scripted-rest/) accept any authenticated user.
- **Error shape:** every non-`200` response returns `{ "error": "<short-code>", "message": "<human>" }` *(inside the result envelope)*.

| Status | When |
|---|---|
| `200` | OK |
| `400` | Bad query parameter (e.g. unknown `list`, malformed `uuid` / `rfsId` / `taskName`). |
| `404` | Resource doesn't exist. |
| `500` | Internal error. |

---

### B.1 `GET /api/<ns>/work-orders/matrix`

The pivot endpoint — the one that replaces the developer's manual Excel sheet.

**Query parameters:**

| Param | Type | Default | Allowed |
|---|---|---|---|
| `list` | string | `legacy` | `legacy` (all COs) \| `attention` (COs with ≥ 1 task in state `Problem` or `construction_status: "Fallout"`) |
| `limit` | integer | `25` | `1` – `200` (clamped silently if outside) |
| `offset` | integer | `0` | `≥ 0` (clamped to `0` if negative) |

> **SNOW convention:** use `sysparm_limit` / `sysparm_offset` instead of `limit` / `offset` if you want other tools (REST API Explorer, scripted clients) to recognise the endpoint natively. The matrix component is parameterised via `data-endpoint` — set it to whatever URL your script reads, the rest is just query-string mechanics. Accept both names server-side if you want to keep the demonstrator-style URL working in parallel.

**Response 200:**

```typescript
{
  total:   number,   // total rows for this `list` filter (NOT page size)
  offset:  number,   // echoed back
  limit:   number,   // echoed back (post-clamping)
  columns: TaskColumn[],   // canonical 17-task registry, see §E
  rows: WorkOrderMatrixRow[]
}

interface TaskColumn {
  name:     string;   // canonical German name — the join key
  short:    string;   // column header label
  label:    string;   // long-form English label (tooltips)
  sequence: number;   // 1-17 display order
}

interface WorkOrderMatrixRow {
  uuid:                string;   // 'co-000' on the showcase; will be a sys_id in production
  number:              string;   // 'WO10001'
  status_code:         string;   // 'In Progress' | 'Pending' | 'Open' | 'Done'
  construction_status: string;   // 'Open' | 'in progress' | 'Completed'
                                 //   | 'Cancellation in progress' | 'Fallout'
  city:                string;
  address:             string;
  sys_updated_on:      string;   // optional; ISO-8601 or 'YYYY-MM-DD HH:mm:ss'

  tasks: Record<CanonicalTaskName, TaskState>;
}

type TaskState =
  | "Draft" | "Pending Dispatch" | "Assigned"
  | "Scheduled" | "Work In Progress" | "Done"
  | "Problem" | "not applicable";
```

**Critical detail — lookup key:** the keys of `tasks` are the **canonical German names** (`"HV-S"`, `"GIS Planung"`, `"HÜP"`, …) — not `short`, not `label`. The component uses `columns[i].name` to look up each cell. If the script returns the wrong key shape, the matrix will silently render `not applicable` (em-dash) for every cell. This is the #1 wrong-shape bug.

**Every row should return all 17 task entries.** Tasks that don't apply to the order's status code use `state: "not applicable"`. The component renders these as `—` and treats them as non-clickable.

**Implementation:** see [`snow/scripted-rest/matrix.js`](../snow/scripted-rest/matrix.js) for the showcase stub and [05-scripted-rest.md §2](05-scripted-rest.md#2-resource-matrix-the-pivot) + [04-data-model.md](04-data-model.md) for the GlideRecord production pattern.

---

### B.2 `GET /api/<ns>/customer-orders/{uuid}`

Full detail for one Customer Order. Used by `<customer-order-detail-tab>`.

**Path parameter:** `uuid` — Customer Order identifier (showcase: `co-000`; production: `sys_id` of `wm_customer_order`).

**Response 200:**

```typescript
{
  uuid:                  string;
  number:                string;   // 'WO10001'
  customer_name:         string;
  phone:                 string | null;
  address:               string;
  city:                  string;
  order_date:            string;   // 'YYYY-MM-DD'
  construction_status:   string;
  set_name:              string;   // 'FTTH Standard', etc.
  unit_count:            number;
  scheduled_appointment: string | null;   // ISO-8601 datetime

  lma_order:           RfsSummary | null;
  connectivity_order:  RfsSummary | null;

  tasks: TaskDetail[];   // all 17 tasks, flattened
}

interface RfsSummary {
  sys_id:   string;
  number:   string;     // 'RFS20001'
  rfs_type: 'LMA' | 'Connectivity';
}

interface TaskDetail {
  number:            string;
  short_description: string;     // canonical German name — same key as the matrix `tasks` map
  state:             TaskState;
  assignment_group:  string | null;
  sys_updated_on:    string;
  rfs_type:          'LMA' | 'Connectivity';
}
```

**Errors:** `400` if `uuid` malformed, `404` if not found.

**Implementation:** [`snow/scripted-rest/customer-order.js`](../snow/scripted-rest/customer-order.js) (showcase) + [04-data-model.md §3](04-data-model.md) (production model).

---

### B.3 `GET /api/<ns>/rfs-orders/{rfsId}`

RFS Work Order detail. Used by `<rfs-detail-tab>`.

**Path parameter:** `rfsId` — RFS identifier. Showcase format: `rfs-<idx>-lma` or `rfs-<idx>-con`; production: `sys_id` of `wm_rfs_order`.

**Response 200:**

```typescript
{
  sys_id:   string;
  number:   string;
  rfs_type: 'LMA' | 'Connectivity';

  customer_order: {
    uuid:                string;
    number:              string;
    customer_name:       string;
    address:             string;
    city:                string;
    construction_status: string;
    set_name:            string;
  };

  tasks: RfsTask[];   // tasks scoped to this RFS — LMA covers 1-7, Connectivity covers 8-17
}

interface RfsTask {
  short_description: string;   // canonical German name
  state:             TaskState;
  assignment_group:  string | null;
  sys_updated_on:    string;
}
```

**Errors:** `400` if `rfsId` malformed, `404` if not found.

**Implementation:** [`snow/scripted-rest/rfs-order.js`](../snow/scripted-rest/rfs-order.js).

---

### B.4 `GET /api/<ns>/customer-orders/{uuid}/tasks/{taskName}`

Single task detail. Used by `<task-detail-tab>`.

**Path parameters:**

| Param | Format | Example |
|---|---|---|
| `uuid` | Customer Order identifier | `co-001` |
| `taskName` | canonical German name, **URL-encoded** | `HV-S`, `GIS%20Planung`, `H%C3%9CP` |

**Response 200:** a single `TaskDetail` (same shape as a `tasks[]` element in B.2).

**Errors:** `400` if `uuid` malformed, `404` if no task with that `short_description` exists for that CO.

**Implementation:** [`snow/scripted-rest/task.js`](../snow/scripted-rest/task.js).

> **URL encoding note:** ServiceNow Scripted REST decodes path parameters once. Don't double-decode (`HÜP` is `H%C3%9CP` — a double decode mangles it). The vendor's `encodeURIComponent(taskName)` on the way out is correct; the server reads `request.pathParams.taskName` as the decoded value.

---

## C. CSS token contract

The component's styles read CSS custom properties on `:host` (declared in [`src/x-2057350-wo-matrix/styles.scss`](../src/x-2057350-wo-matrix/styles.scss)). Custom properties pierce shadow DOM, so the vendor components pick them up automatically.

The styles map `--hfs-*` to Polaris `--now-*` tokens so the component picks up Workspace theming (light/dark, accent colours, branding) automatically:

```scss
:host {
  // Surfaces
  --hfs-color-bg:           var(--now-color-background--surface,   #f4f5f7);
  --hfs-color-surface:      var(--now-color-background--primary,   #fff);
  --hfs-color-sidebar:      var(--now-color-background--secondary, #fafbfc);
  --hfs-color-tab-active:   var(--now-color-background--neutral,   #dde3eb);
  --hfs-color-toolbar:      var(--now-color-background--tertiary,  #eef0f3);
  --hfs-color-border:       var(--now-color-border,                #d8dde3);

  // Text
  --hfs-color-text:         var(--now-color-text,            #1b2734);
  --hfs-color-text-muted:   var(--now-color-text--secondary, #5b6770);

  // Brand
  --hfs-color-primary:      var(--now-color-primary,            #1f8476);
  --hfs-color-primary-bg:   var(--now-color-primary-background, #e8f5f1);

  // Status dot fills
  --hfs-status-open:        var(--now-color-text--secondary, #9aa5b1);
  --hfs-status-pending:     var(--now-color-notice,          #f59e0b);
  --hfs-status-scheduled:   var(--now-color-information,     #3b82f6);
  --hfs-status-done:        var(--now-color-positive,        #10b981);
  --hfs-status-problem:     var(--now-color-critical,        #dc2626);

  // …spacing + heights kept literal; see styles.scss for the full list
}
```

The fallback literal values keep the component looking right outside SNOW (in `snc ui-component develop` preview, or if a Polaris token isn't available in your Horizon release).

**Per-tab accent token:** `--tab-accent` is set via attribute selectors:

```scss
tab-strip > button[slot="tab"][data-tab-type="list"] { --tab-accent: var(--hfs-color-primary); }
tab-strip > button[slot="tab"][data-tab-type="co"]   { --tab-accent: var(--hfs-color-primary); }
tab-strip > button[slot="tab"][data-tab-type="wo"]   { --tab-accent: var(--hfs-status-scheduled); }
tab-strip > button[slot="tab"][data-tab-type="task"] { --tab-accent: var(--hfs-status-pending); }
```

The active tab's top accent and the icon colour both read `--tab-accent`. Add more tab types by adding more attribute-selector rows.

> **Polaris token names vary slightly between Horizon Design System releases.** If a token in the mapping is empty in your release, the literal fallback kicks in. Check `sys_ux_lib_style` records in your instance and tweak the mapping if a token's missing.

---

## E. Reference data

### E.1 The 17 canonical tasks (in `sequence` order)

| # | `name` (key) | `short` (header) | `label` (display) | RFS scope |
|---|---|---|---|---|
| 1 | HV-S | HV | Standard House Visit | LMA |
| 2 | UV-S | UV | Standard Unit Visit | LMA |
| 3 | HV-NE4 | HV4 | House Visit NE4 | LMA |
| 4 | UV-NE4 | UV4 | Unit Visit NE4 | LMA |
| 5 | GIS Planung | GP | GIS Planning - NAS | LMA |
| 6 | Fremdleitungsplan | LLD | Utility Lines Plan | LMA |
| 7 | Genehmigungen | PM | Permits (VRAO / Aufbruch) | LMA |
| 8 | Tiefbau | CV | Civil Works | Connectivity |
| 9 | Spleißen | SP | Splicing | Connectivity |
| 10 | Einblasen | BF | Blow-in Fiber | Connectivity |
| 11 | Gartenbohrung | GD | Garden Drilling | Connectivity |
| 12 | Hauseinführung | WB | Wall Breakthrough | Connectivity |
| 13 | HÜP | HÜP | Install HÜP | Connectivity |
| 14 | Leitungsweg NE4 | CW4 | Cable Way NE4 | Connectivity |
| 15 | GFTA | GFTA | Install GFTA | Connectivity |
| 16 | ONT | ONT | Install ONT | Connectivity |
| 17 | Patch | PCH | Patch | Connectivity |

The canonical registry lives at [`src/x-2057350-wo-matrix/vendor/task-columns.json`](../src/x-2057350-wo-matrix/vendor/task-columns.json) for client reference and is duplicated inside each Scripted REST stub in [`snow/scripted-rest/`](../snow/scripted-rest/). Production deploys should source it from a System Property — see [05-scripted-rest.md §0.2](05-scripted-rest.md#02-stash-the-canonical-task-registry).

### E.2 Task lifecycle states

```
Draft → Pending Dispatch → Assigned → Scheduled → Work In Progress → Done
                                                          ↓
                                                       Problem (terminal fallout)
                                              not applicable (never created)
```

These are the **only** values the component accepts for `state`. Any other string falls through to the default `pending` colour with the literal string in the tooltip.

### E.3 Status code → applicability

Construction status codes select a subset of the 17 tasks as applicable. Tasks that don't apply to a given status carry `state: "not applicable"` and render as `—`. The mapping is authoritative in business documentation outside this repo; the showcase stub in [`snow/scripted-rest/matrix.js`](../snow/scripted-rest/matrix.js) synthesises a plausible distribution from row index.

---

## F. Out of scope (intentionally)

The following are deliberately not in this contract; flagged here so engineers don't waste time looking for them:

- **Editing.** No `POST`/`PATCH`/`DELETE`. The component is read-only.
- **Real-time updates.** No WebSocket / polling. The "Last refreshed just now" hint is a placeholder.
- **Rich tooltips.** Matrix dot tooltips use the native `title` attribute.
- **Per-task history.** `<task-detail-tab>` shows current `state` + `sys_updated_on` only. The matrix API does not return per-task `sys_updated_on` (it would require changing the `tasks` map shape from `{name: state}` to `{name: {state, updated}}` — a real spec change).
- **i18n.** All UI strings are English; canonical task names stay German. Use the SNOW translation pipeline if i18n is needed.

See [07-roadmap.md](07-roadmap.md) for which of these are on the enhancement backlog.

---

## See also

- [01-architecture.md](01-architecture.md) — what's in this repo and why
- [04-data-model.md](04-data-model.md) — `wm_customer_order` / `wm_rfs_order` / `wm_task` table model
- [05-scripted-rest.md](05-scripted-rest.md) — GlideScript implementation patterns
- [06-component-anatomy.md](06-component-anatomy.md) — how the four vendor components fit inside the NXF wrapper
