# Architecture — what's in this repo

A 10-minute read covering what each top-level directory does and how a request flows from URL parameter to table cell. Keep this open while you read the source.

---

## 1. Repository layout

```
hfs-wo-matrix/
├── README.md                  ← project entry point + quick start
├── docs/                      ← this directory; everything you're reading
├── src/
│   └── x-2057350-wo-matrix/   ← the NXF custom component
│       ├── index.js           ← createCustomElement + snabbdom view
│       ├── styles.scss        ← --hfs-* ↔ --now-* tokens + layout
│       └── vendor/            ← 5 Web Components + the task registry
├── example/                   ← `snc ui-component develop` mount + fetch stub
│   ├── element.js
│   └── stub.js
├── snow/
│   └── scripted-rest/         ← 4 GlideScript stub bodies for the back-end
├── patches/                   ← patch-package payload (Ajv version skew fix)
├── now-ui.json                ← UI Builder property descriptors
├── now-cli.json               ← snc CLI config
├── package.json
└── pom.xml                    ← SNOW packaging metadata
```

The thing that gets deployed to SNOW is the `src/` + `now-ui.json` + `now-cli.json` + `pom.xml` bundle. `example/`, `snow/scripted-rest/`, `patches/`, and `docs/` are repo-only — they don't ship.

---

## 2. The three concentric layers

```
┌─ Layer 3 — Workspace runtime ────────────────────────────────┐
│ Configurable Workspace                                       │
│  └─ UI Builder page                                          │
│       └─ HFS Work Order Matrix (sys_ux_macroponent)          │
│            └─ <x-2057350-wo-matrix>  (NXF custom element)    │
│                 ┌─ Layer 2 — wrapper ──────────────────────┐ │
│                 │ snabbdom view: topbar / action-bar /     │ │
│                 │ tab-strip / sidebar / matrix             │ │
│                 │  ┌─ Layer 1 — vendor Web Components ──┐ │ │
│                 │  │ <wo-status-matrix>                 │ │ │
│                 │  │ <customer-order-detail-tab>        │ │ │
│                 │  │ <rfs-detail-tab>                   │ │ │
│                 │  │ <task-detail-tab>                  │ │ │
│                 │  │ <tab-strip>                        │ │ │
│                 │  └────────────────────────────────────┘ │ │
│                 └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

**Layer 1 — vendor Web Components** are plain self-contained custom elements, each with their own shadow DOM. They came from a Node.js-served HTML demonstrator; they were patched in four places to work inside an NXF shadow root (see [06-component-anatomy.md §3](06-component-anatomy.md#3-the-four-vendor-patches)). They communicate via `CustomEvent`s with `bubbles: true, composed: true`.

**Layer 2 — the wrapper** is a single NXF `createCustomElement` call whose snabbdom view renders the shell and embeds the vendor elements as opaque children. It exposes two UI Builder properties (`endpoint`, `baseUrl`) and one piece of internal state (`list`, the sidebar filter).

**Layer 3 — Workspace runtime** is where SNOW renders the macroponent inside its own App Shell. The wrapper's topbar + the SNOW shell stack visually — see [06-component-anatomy.md §7.2](06-component-anatomy.md#72-register-in-a-configurable-workspace) for what that looks like and [07-roadmap.md](07-roadmap.md) for the Path B migration that removes the duplication.

---

## 3. Request flow — clicking a row → CO detail tab opens

A worked example. User clicks the `WO10001` link in the matrix:

1. **Matrix click handler** in [`vendor/wo-status-matrix.js`](../src/x-2057350-wo-matrix/vendor/wo-status-matrix.js) fires `this.dispatchEvent(new CustomEvent('customer-order:open', {detail: {coUuid, coNumber, baseUrl}, bubbles: true, composed: true}))`.
2. **Event bubbles** up through the wrapper's shadow root to the root shared with `<tab-strip>` (which captured the root via `this.getRootNode()` at connect time).
3. **`<tab-strip>` listener** sees the event and calls `openCustomerOrderTab({coUuid, coNumber, baseUrl})`:
    - Builds a tab button with `data-tabType="co"`, appends it to the slotted `<tab-strip>` children.
    - Creates a `<customer-order-detail-tab>` element with `data-co-uuid`, `data-co-number`, `data-tab-pane`, `data-base-url` attributes.
    - Appends it to `this._root.querySelector('.content')` (`this._root` is our shadow root).
4. **`<customer-order-detail-tab>.connectedCallback`** fires, reads its `data-*` attributes, and calls `fetch(`${baseUrl}/customer-orders/${coUuid}`)`.
5. **The fetch** hits one of:
    - `/stub/wo-matrix/customer-orders/co-000` → intercepted by `example/stub.js` fetch shim, returns canned JSON.
    - `/api/2057350/customer-orders/co-000` → SNOW Scripted REST in `snow/scripted-rest/customer-order.js` (or its production GlideRecord-backed replacement).
6. **Response arrives** wrapped in `{"result": <payload>}` (in SNOW) or flat (in the stub). The detail tab strips the envelope (`raw.result !== undefined ? raw.result : raw`) and renders.

Whole round-trip is one event + one fetch. No global state, no observable subscriptions.

---

## 4. Data flow — endpoint URL configuration

```
UI Builder Configure panel
  Matrix endpoint URL    →    sys_ux_macroponent.props[0].defaultValue
  Detail API base URL    →    sys_ux_macroponent.props[1].defaultValue
              ↓
              ↓ resolved per page-render by NXF
              ↓
view function args
  state.properties.endpoint    →    "/api/<ns>/work-orders/matrix"
  state.properties.baseUrl     →    "/api/<ns>"
              ↓
              ↓ passed through JSX
              ↓
<wo-status-matrix
    data-endpoint={endpoint}     ← matrix fetches this URL directly
    data-baseUrl={baseUrl}>      ← matrix puts this into customer-order:open detail
</wo-status-matrix>
              ↓
              ↓ matrix click → event detail
              ↓
{detail: {coUuid, coNumber, baseUrl}}
              ↓
              ↓ tab-strip plumbs onto new detail element
              ↓
<customer-order-detail-tab data-base-url={baseUrl}>
              ↓
              ↓ detail tab reads its dataset
              ↓
fetch(`${baseUrl}/customer-orders/${coUuid}`)
```

Two properties, three URL fragments. Per-environment, only the two property defaults change.

---

## 5. The snc CLI

ServiceNow's `snc` is a two-part install and the two parts trip first-time users up:

1. The **native `snc` binary** — a `.pkg` from <https://developer.servicenow.com/> → Reference → Now Experience → CLI. This is the engine.
2. The **`ui-component` extension** — pulled in via `snc extension add ui-component`. This is what exposes `project` / `develop` / `deploy` / `generate-update-set` subcommands.

> **Don't use the npm package `@servicenow/cli`.** It ships an older `now-cli` binary with a separate profile store. Mixing the two yields hours of "Please configure your profile" / "SNC not found" loops. Stick to the native `.pkg`.

Configure a profile interactively:

```bash
snc configure profile set
#   Host: https://<your-instance>.service-now.com/
#   Login method: Basic
#   Username: admin
#   Password: ********
#   Default output format: JSON
```

A successful run prints `Connection to https://<instance> successful.` and `Profile default has been saved`. After that, `snc ui-component develop` / `deploy` work.

You'll see `This instance does not support dynamic commands. Functionality will be limited.` — that's fine for our purposes. The component scaffolding commands come from the `ui-component` extension, not from dynamic commands.

---

## 6. Where each thing is owned

| Layer | Owned by | Changed when |
|---|---|---|
| Vendor Web Components | This repo | Behaviour change, new event types, shadow-root patches |
| Wrapper view / snabbdom | This repo | Layout change, new sidebar entries, new bindable property |
| `now-ui.json` | This repo | New UI Builder property metadata |
| Local preview stub | This repo | New fixture for testing a new code path |
| Scripted REST scripts | SNOW instance (sourced from `snow/scripted-rest/`) | New endpoint, new filter parameter, production GlideRecord migration |
| UI Builder page | SNOW instance | New page, new layout, new component composition |
| Workspace registration | SNOW instance | New menu entry, role gating |
| Polaris tokens | SNOW platform | Theme version bump (handled centrally) |
| Underlying tables | SNOW platform | Schema migrations — see [04-data-model.md](04-data-model.md) |

The right column is the "where do I look first if X broke" oracle. A blank page → wrapper view or vendor. Drill-down 404s → Scripted REST or `baseUrl` property. Bindings missing in UI Builder → `now-ui.json`. The component appearing in two places → Workspace registration.

---

## 7. Reading order from here

If you came to this doc directly, the recommended order from here is:

1. [02-onboarding.md](02-onboarding.md) — get the local preview running.
2. [03-api-contract.md](03-api-contract.md) — JSON shapes.
3. [06-component-anatomy.md](06-component-anatomy.md) — wrapper view, vendor patches, JSX rules.
4. [04-data-model.md](04-data-model.md) + [05-scripted-rest.md](05-scripted-rest.md) — only when you're swapping the synthetic stubs for production back-end work.
5. [07-roadmap.md](07-roadmap.md) — what's next.
