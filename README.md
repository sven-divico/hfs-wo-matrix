# wo-matrix — HFS Work Order status matrix (showcase port)

This repo is the **reference Path A port** of the HFS Demonstrator's four Web Components into a ServiceNow Now Experience Framework (NXF) component, deployed as a macroponent into a Configurable Workspace. It exists so porters wiring the real `x_<companycode>_hfs_matrix` component have a known-good starting point and a documented list of pitfalls.

The behaviour and visuals match the standalone demonstrator at [github.com/sven-divico/hfs-demonstrator](https://github.com/sven-divico/hfs-demonstrator). The data layer is stubbed — four Scripted REST scripts in [`snow/scripted-rest/`](snow/scripted-rest/) return synthetic but contract-correct payloads.

## What's in here

```
src/x-2057350-wo-matrix/
├── index.js              — NXF wrapper (createCustomElement + snabbdom view)
├── styles.scss           — full demonstrator CSS + Polaris token mapping
├── vendor/               — the 4 demonstrator Web Components, patched for
│                            shadow-root hosting (see "What changed in vendor")
│   ├── tab-strip.js
│   ├── wo-status-matrix.js
│   ├── customer-order-detail-tab.js
│   ├── rfs-detail-tab.js
│   ├── task-detail-tab.js
│   └── task-columns.json
└── __tests__/

example/
├── element.js            — mount point for `snc ui-component develop`
└── stub.js               — fetch interceptor + canned data for local preview

snow/scripted-rest/       — GlideScript bodies for the four backend resources
├── README.md             — setup instructions for the 3 Scripted REST APIs
├── matrix.js
├── customer-order.js
├── task.js
└── rfs-order.js

patches/                  — patch-package payload, see "Local dev gotcha #1"
now-ui.json               — UI Builder property descriptors (endpoint, baseUrl)
```

## Quick start

### Prerequisites

- ServiceNow CLI installed as a `.pkg` from the developer portal (NOT the npm `@servicenow/cli` — see [docs/dev-guide/06 §2.1](https://github.com/sven-divico/hfs-demonstrator/blob/main/dev-guide/06-porting-to-snow-workspace.md))
- A profile configured against your instance: `snc configure profile set`
- `ui-component` extension added: `snc extension add ui-component`

### Clone and install

```bash
git clone https://github.com/sven-divico/hfs-wo-matrix.git
cd hfs-wo-matrix
npm install
```

The `npm install` step runs `patch-package` automatically (via the `postinstall` script) which patches the bundled `@servicenow/ui-core` to work around an Ajv version skew that otherwise blocks `snc ui-component develop`. See the "Local dev gotcha #1" section below for what the patch does.

### Run the local preview

```bash
snc ui-component develop
```

Open <http://127.0.0.1:8081/>. You should see the full shell render with 27 stub rows pulled from `example/stub.js`. No backend required.

### Deploy to your instance

```bash
snc ui-component deploy
```

Then build a UI Builder page hosting the component, register it in a Workspace, and stand up the four Scripted REST resources from [`snow/scripted-rest/`](snow/scripted-rest/). The dev-guide's [§7](https://github.com/sven-divico/hfs-demonstrator/blob/main/dev-guide/06-porting-to-snow-workspace.md) walks the UI Builder click path; the README in `snow/scripted-rest/` walks the Scripted REST setup.

## UI Builder configuration

The component exposes two bindable properties:

| Property | Default | What to set |
|---|---|---|
| `Matrix endpoint URL` | `/api/x_2057350_wo_mat_0/work-orders/matrix` | The full Scripted REST URL of the `matrix` resource for your instance. PDI namespaces are bare digits (e.g. `/api/2057350/work-orders/matrix`); production scoped apps use `x_<companycode>_hfs`. |
| `Detail API base URL` | `/api/x_2057350_wo_mat_0` | The namespace base used by the three detail-tab fetches. The component appends `/customer-orders/{uuid}`, `/customer-orders/{uuid}/tasks/{taskName}`, and `/rfs-orders/{rfsId}` to this. |

Both are bindable in UI Builder — you can wire them to URL parameters or Data Resources rather than hard-coding. See dev-guide §3.5 for the binding syntax.

## What changed in vendor (vs. the demonstrator)

The four demonstrator components run unmodified inside a regular HTML page. To work inside an NXF host's shadow root they needed three minimal patches, all preserving demonstrator behaviour:

1. **Dispatch from the element, not from `document`** — events with `composed: true, bubbles: true` now reach whichever root (document in the demo, the NXF shadow root in this port) hosts the components.
2. **`tab-strip` uses `this.getRootNode()`** for `querySelector('.content')` and `[data-tab-pane]` lookups, and for its event listeners. The demonstrator's `document.querySelector` call would otherwise miss our content pane because it lives in our shadow root.
3. **Detail tabs read `data-base-url`** and prepend it to their fetch URLs (default `/api` matches the demonstrator). The wrapper plumbs `baseUrl` through `customer-order:open` / `rfs:open` / `task:open` event detail.

There's also one small data-shape patch in all four consumers: SNOW's Scripted REST framework wraps every payload in a top-level `{"result": ...}` envelope. The vendor files strip the envelope before consuming so the components keep working with both shapes:

```js
const raw  = await res.json();
const data = raw && raw.result !== undefined ? raw.result : raw;
```

## Local dev gotchas — read before debugging

### #1 `snc ui-component develop` throws "Keyword deprecated is already defined"

Ajv 8.x ships `deprecated` as a built-in JSON-Schema keyword. `@servicenow/ui-core@24.1.1` calls `ajv.addKeyword('deprecated', …)` at module init, which throws on Ajv 8 and aborts the entire bundle before any custom element registers. Page is blank.

The fix is a 6-line `try/catch` wrap, captured in [`patches/@servicenow+ui-core+24.1.1.patch`](patches/) and reapplied automatically on every `npm install` via `patch-package`. No action needed when cloning fresh — just don't drop the postinstall script or the patches directory.

### #2 snabbdom JSX quirks

The dev-guide's view examples need three tweaks for `@servicenow/ui-renderer-snabbdom`:

- **Inline `style="…"` strings crash** with `TypeError: Indexed property setter is not supported`. Use `style={{padding: '8px'}}` objects, or do everything via `className` + `styles.scss` (what this port does).
- **Kebab-case after `data-` crashes** with `Failed to set a named property 'tab-id' on 'DOMStringMap'`. Write `data-tabId` / `data-tabPane` / `data-baseUrl` in JSX; the DOM still ends up with `data-tab-id="…"` and `this.dataset.tabId` reads it back correctly.
- **SVG attributes need the `attr-` prefix**: `<svg attr-width="14" attr-height="14" attr-viewBox="0 0 24 24">` and `<path attr-d="…"/>`. Without it snabbdom tries to set the JS property (`svg.width = "14"`) which is a read-only `SVGAnimatedLength` and throws.

All three failures share the same surface symptom: shadow root attached but empty, host element renders blank, no error in the browser console from your code. The actual error lives under the `@servicenow/ui-renderer-snabbdom` `origin: 'onStateChange'` log — check there first when debugging.

### #3 View signature

NXF in this runtime invokes `view(state, dispatch)` — two positional args. `state` carries `{componentId, list, properties: {endpoint, baseUrl, …}, context}`. `dispatch` is a bare function, NOT a helpers object. The dev-guide's `({state, dispatch}) => …` single-arg destructure throws and leaves the shadow root empty.

### #4 UI Builder property panel only shows "Component visibility"

The `properties:` block in `createCustomElement` is for runtime only. UI Builder reads bindable inputs from a separate `properties` array at the **component root** of `now-ui.json` (alongside, not inside, `uiBuilder`). See this repo's [`now-ui.json`](now-ui.json) for the working shape.

## Going to production

This is a Path A port — wrap-as-is, behaviour identical to the demonstrator. For the production port:

1. Replace the auto-generated PDI scope (`x_2057350_wo_mat_0`) with the real `x_<companycode>_hfs` scope.
2. Replace the showcase Scripted REST stubs with GlideRecord-backed implementations against `wm_customer_order` / `wm_rfs_order` / `wm_task`. See [dev-guide/03](https://github.com/sven-divico/hfs-demonstrator/blob/main/dev-guide/03-snow-recipe.md) for the recipe.
3. Set the matrix endpoint + base URL properties to the live URLs in UI Builder.
4. Lock down ACLs on the Scripted REST resources to the dispatcher role.
5. Migrate to Path B (NXF idiom) when UI Builder admins start asking to wire the matrix's events from the no-code interface. See [dev-guide/06 §8](https://github.com/sven-divico/hfs-demonstrator/blob/main/dev-guide/06-porting-to-snow-workspace.md) for the migration shape.

## Reference docs

- [hfs-demonstrator/dev-guide/01-api-specification.md](https://github.com/sven-divico/hfs-demonstrator/blob/main/dev-guide/01-api-specification.md) — full data contract
- [dev-guide/02-developer-onboarding.md](https://github.com/sven-divico/hfs-demonstrator/blob/main/dev-guide/02-developer-onboarding.md) — pre-port reading
- [dev-guide/03-snow-recipe.md](https://github.com/sven-divico/hfs-demonstrator/blob/main/dev-guide/03-snow-recipe.md) — Scripted REST GlideScript patterns
- [dev-guide/06-porting-to-snow-workspace.md](https://github.com/sven-divico/hfs-demonstrator/blob/main/dev-guide/06-porting-to-snow-workspace.md) — the full porting walkthrough this repo implements
