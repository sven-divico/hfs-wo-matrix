# Component anatomy — how the NXF wrapper fits together

**Audience:** engineer extending the front-end (adding properties, new event types, Path B migration, etc).

This document is the reference for how the six pieces of code under `src/x-2057350-wo-matrix/` interact with each other and with the ServiceNow Now Experience Framework. It also documents the silent failure modes that took most of a session to debug during the original build — every entry here is a real bug somebody hit.

---

## 1. The shape

```
src/x-2057350-wo-matrix/
├── index.js               NXF wrapper — createCustomElement + snabbdom view
├── styles.scss            Polaris (--now-*) ↔ --hfs-* token mapping + layout
├── __tests__/index.js     stub test
└── vendor/                4 original Web Components, patched for shadow-root hosting
    ├── tab-strip.js
    ├── wo-status-matrix.js
    ├── customer-order-detail-tab.js
    ├── rfs-detail-tab.js
    ├── task-detail-tab.js
    └── task-columns.json  17-task registry (reference copy; production sources from a System Property)
```

The wrapper's `createCustomElement('x-2057350-wo-matrix', …)` registers the macroponent. Its snabbdom view returns the shell (topbar / action bar / tab-strip / sidebar / `<wo-status-matrix>`); the five vendor custom elements register themselves via side-effect imports at the top of `index.js` and behave as opaque children of the snabbdom tree.

Two UI Builder properties are exposed (`endpoint`, `baseUrl`); one piece of state lives in the wrapper (`list`, toggled by sidebar clicks via the `HFS#SIDEBAR_LIST_CLICKED` action).

---

## 2. createCustomElement contract

```javascript
createCustomElement('x-2057350-wo-matrix', {
    renderer: {type: snabbdom},
    view,                                  // see §4
    styles,
    initialState: {list: 'legacy'},        // sidebar filter; sidebar click toggles via action
    properties: {
        endpoint: {default: '/api/x_2057350_wo_mat_0/work-orders/matrix', schema: {type: 'string'}},
        baseUrl:  {default: '/api/x_2057350_wo_mat_0',                    schema: {type: 'string'}},
    },
    actionHandlers: {
        'HFS#SIDEBAR_LIST_CLICKED': ({action, updateState}) => {
            updateState({list: action.payload.list});
        },
    },
});
```

The `properties:` block declares the **runtime** shape — what `state.properties.endpoint` resolves to inside the view. UI Builder's Configure panel reads from a **separate** declaration in `now-ui.json`; see §5.

---

## 3. The four vendor patches

The five vendor files came from the original demonstrator project, where they ran in a light-DOM HTML page. Inside an NXF host's shadow root they fail in three silent ways without the following patches.

### 3.1 Dispatch from the element, not from `document`

The demonstrator's `dispatch` helpers fire events on `document`:

```javascript
function dispatch(type, detail) {
    document.dispatchEvent(new CustomEvent(type, {detail, bubbles: true, composed: true}));
}
```

That works in light DOM. Inside our wrapper's shadow root, events fire directly on `document` and never bubble up from inside the shadow tree — tab-strip's listeners on its own root never see them. The vendor files now take a `source` argument and dispatch from `this`:

```javascript
function dispatch(source, type, detail) {
    source.dispatchEvent(new CustomEvent(type, {detail, bubbles: true, composed: true}));
}
```

Call sites pass `this` so events bubble up from the dispatching element to whichever root hosts the components. The `composed: true` flag lets them cross the shadow boundary on the way out (if anything outside ever needs to listen).

### 3.2 `tab-strip` uses its own root, not `document`

`tab-strip` does several lookups on `document`:

```javascript
document.addEventListener('customer-order:open', ...);
document.querySelector('.content').appendChild(pane);
document.querySelectorAll('[data-tab-pane]').forEach(...);
```

All four break inside the NXF shadow root because `.content` and the detail panes live in our shadow tree, not in `document`. The patched version captures `this.getRootNode()` once and uses it throughout:

```javascript
connectedCallback() {
    this._root = this.getRootNode();         // document in demo, shadow root in NXF
    this.attachShadow({mode: 'open'});
    // ...
    this._root.addEventListener('customer-order:open', e => this.openCustomerOrderTab(e.detail));
    // ...
}

openCustomerOrderTab({coUuid, coNumber, baseUrl = ''}) {
    // ...
    this._root.querySelector('.content').appendChild(pane);
    // ...
}

activate(tabId) {
    // ...
    this._root.querySelectorAll('[data-tab-pane]').forEach(pane => {
        pane.hidden = pane.dataset.tabPane !== tabId;
    });
}
```

### 3.3 Detail tabs read `data-base-url`

Each detail tab prepends its `baseUrl` to the constructed URL. The wrapper passes `baseUrl` through the matrix's `data-base-url` attribute, and matrix-dispatched events include `baseUrl` in the detail payload so tab-strip can plumb it onto the new detail-tab element:

```javascript
async _load() {
    const uuid    = this.dataset.coUuid;
    const baseUrl = this.dataset.baseUrl ?? '/api';     // /api default keeps demo working
    const res = await fetch(`${baseUrl}/customer-orders/${encodeURIComponent(uuid)}`);
    // ...
}
```

### 3.4 Unwrap SNOW's `{result: ...}` envelope

ServiceNow's Scripted REST framework wraps every `response.setBody(...)` payload in a `{"result": ...}` envelope. The vendor consumers parse responses expecting `columns` / `rows` / `tasks` at the root; without the unwrap the matrix renders blank with no console error.

All four fetch sites do:

```javascript
const res = await fetch(url);
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const raw  = await res.json();
const data = raw && raw.result !== undefined ? raw.result : raw;
// now data.columns / data.rows / etc. are at the top level
```

Backward compatible — the original demonstrator and the local stub return flat payloads, which pass through unchanged.

---

## 4. The wrapper view — snabbdom JSX rules

snabbdom-flavoured JSX in `@servicenow/ui-renderer-snabbdom` has three rules that the dev-guide examples elsewhere on the web get wrong. All three crash silently — snabbdom's `onStateChange` wrapper catches the throw, dispatches `COMPONENT_ERROR_THROWN`, and the host renders an empty shadow root with no error in your code's console output. **The actual error lives under `@servicenow/ui-renderer-snabbdom For component <x-... /> with origin 'onStateChange'` in the browser console** — look there before suspecting CSS or asset loading.

### 4.1 View signature: `(state, dispatch)`, two positional args

```javascript
const view = (state, dispatch) => {
    const {properties: {endpoint = '', baseUrl = ''} = {}, list = 'legacy'} = state || {};
    // ...
};
```

`state` carries `{componentId, list, properties: {endpoint, baseUrl, defer, hoist, ...}, context}`; `dispatch` is a **bare function**, not a helpers object. Writing `({state, dispatch}) => ...` thinking NXF passes a single coeffects bag throws synchronously.

### 4.2 Inline `style=…` must be an object, never a string

`style="padding: 8px; color: red"` crashes with `TypeError: Indexed property setter is not supported` — snabbdom iterates the string and tries to assign numeric indices to a `CSSStyleDeclaration`. Use object form `style={{padding: '8px', color: 'red'}}` or, recommended, do everything through `className` + `styles.scss`. The wrapper view uses zero inline styles.

### 4.3 `data-*` attributes use camelCase after the prefix

`data-foo-bar` crashes with `Failed to set a named property 'foo-bar' on 'DOMStringMap'`. snabbdom-NXF routes `data-*` through `el.dataset.<rest>`, and `DOMStringMap` requires camelCase keys. Write `data-tabId`, `data-tabPane`, `data-baseUrl` in JSX:

```javascript
<wo-status-matrix
    data-endpoint={endpoint}
    data-baseUrl={baseUrl}
    data-list={list}
    data-tabPane="matrix">
</wo-status-matrix>
```

The DOM still ends up with `data-tab-id="…"` (kebab) and `this.dataset.tabId` reads it back correctly — `DOMStringMap` auto-converts.

### 4.4 SVG attributes use the `attr-` prefix

`<svg width="14">` crashes with `Cannot set property width of #<SVGSVGElement> which has only a getter`. snabbdom defaults unprefixed attrs to JS property setters, and many SVG DOM properties are read-only (`SVGAnimatedLength`). The `attr-` prefix forces `setAttribute` instead:

```javascript
<svg attr-width="14" attr-height="14" attr-viewBox="0 0 24 24"
     attr-fill="none" attr-stroke="currentColor" attr-stroke-width="2"
     attr-stroke-linecap="round" attr-aria-hidden="true">
    <path attr-d="M4 6h16M4 12h16M4 18h16"/>
</svg>
```

---

## 5. UI Builder property metadata in `now-ui.json`

The `properties:` block inside `createCustomElement` is **only read at runtime**. UI Builder's Configure panel reads its bindable inputs from a **separate** `properties` array at the component root of `now-ui.json` — alongside (not inside) `uiBuilder`. Without this declaration the deployed component appears in the toolbox but its Configure panel shows only "Component visibility" — no way to set the matrix URL.

```json
{
    "components": {
        "x-2057350-wo-matrix": {
            "innerComponents": [],
            "properties": [
                {
                    "name": "endpoint",
                    "label": "Matrix endpoint URL",
                    "description": "Scripted REST URL the matrix fetches rows from.",
                    "fieldType": "string",
                    "defaultValue": "/api/x_2057350_wo_mat_0/work-orders/matrix"
                },
                {
                    "name": "baseUrl",
                    "label": "Detail API base URL",
                    "description": "URL prefix the detail tabs build their own fetch URLs from.",
                    "fieldType": "string",
                    "defaultValue": "/api/x_2057350_wo_mat_0"
                }
            ],
            "uiBuilder": {
                "associatedTypes": ["global.core", "global.landing-page"],
                "label": "HFS Work Order Matrix",
                "tileIcon": "./tile-icon/generic-tile-icon.svg",
                "description": "HFS Work Order × Task status matrix with drill-down tabs",
                "category": "primitives"
            }
        }
    },
    "scopeName": "x_2057350_wo_mat_0"
}
```

After `snc ui-component deploy`, the CLI creates one `sys_ux_lib_component_attr` record per property declared here and writes the array into the deployed macroponent's `props` column. UI Builder picks them up from there.

> **Cache busting:** if the Configure panel still shows only Component visibility after redeploy, UI Builder is showing a cached macroponent definition on the placed component. Remove the component from the canvas, hard-refresh (or open the page in a private window), and re-add it from the toolbox.

---

## 6. Local dev — `snc ui-component develop`

```bash
npm install                 # postinstall reapplies patches/@servicenow+ui-core+24.1.1.patch
snc ui-component develop    # hot-reload dev server at http://127.0.0.1:8081/
```

Two things you need to know:

### 6.1 Ajv version skew patch

On a fresh project as of `@servicenow/cli` 24.x, the bundle aborts at init with `Uncaught Error: Keyword "deprecated" is already defined`. The CLI bundles Ajv 8.x (built-in `deprecated` keyword); `@servicenow/ui-core@24.1.1` calls `ajv.addKeyword('deprecated', …)` at module init and throws. Page is blank, custom element doesn't register, no errors from your code.

The fix is a 6-line `try/catch` wrap of the `addKeyword` call in both `node_modules/@servicenow/ui-core/{module,lib}/utils/schema/ajv.js`. Captured in [`patches/@servicenow+ui-core+24.1.1.patch`](../patches/) and reapplied automatically by `patch-package` on every `npm install`. Don't drop the `postinstall` script in package.json or the `patches/` directory.

When the next `@servicenow/cli` release lands, try removing the patch — the upstream skew may be resolved.

### 6.2 example/ fetch stub

`snc ui-component develop` doesn't talk to your instance — it just serves the bundle on localhost. [`example/stub.js`](../example/stub.js) installs a `window.fetch` override that intercepts URLs under `/stub/wo-matrix/...` and returns canned fixtures matching the four API contracts. [`example/element.js`](../example/element.js) mounts the component with stub URLs.

The component's property defaults stay pointed at production Scripted REST paths — only `example/` references stub URLs, and `example/` isn't loaded by `snc ui-component deploy`.

### 6.3 What "working preview" looks like

- Matrix renders 25+ rows of synthetic data, paginator shows "1–25 of 27".
- Clicking a Customer Order opens the merged detail tab.
- Switching sidebar → matrix refetches with `?list=attention`.
- DevTools console: no errors. (Some upstream `@babel/polyfill is loaded more than once` and `Should not import the named export 'version'` warnings are harmless.)

---

## 7. UI Builder + Workspace registration

### 7.1 Build a UI Builder page

1. Open **UI Builder** at `https://YOUR-INSTANCE.service-now.com/now/builder/ui/home`.
2. **Create Experience → Page**. Set:
    - **Name**: `HFS Matrix Workspace Page`
    - **URL path**: `hfs-matrix-workspace-page`
    - **App shell UI**: **Workspace App Shell** — this is the shell that backs Configurable Workspaces.
    - **Roles**: `canvas_user` to start.
3. After creating the experience, click **Create new page**:
    - **Page name**: `Matrix Home`.
    - **URL path**: `home`.
    - On the "Review URL parameters" dialog: **remove the empty required-parameter row**. The matrix doesn't need URL params to load.
    - **Template**: Blank page.
4. In the canvas, click **+ Add content** → search for `HFS Work Order` → drag the toolbox tile onto Body.
5. Click the placed component → in the right Configure panel set:
    - `Matrix endpoint URL` → `/api/<namespace>/work-orders/matrix`
    - `Detail API base URL` → `/api/<namespace>`
6. **Save** → **Preview**.

> **The canvas is a static design surface, not a runtime.** Web-component children (our topbar, sidebar, matrix) don't execute in the canvas view. Click **Preview** for the live render.

### 7.2 Register in a Configurable Workspace

1. **All → Workspace Experience → Workspaces** → New (or open an existing one).
2. Add a page: the UI Builder page from §7.1.
3. Set the navigation menu item (label `Status Matrix`, icon `grid`).
4. Set role-based access (typically `x_company_hfs_dispatcher` plus admin).

> **Expect two stacked shells.** The wrapper paints its own topbar / action bar / tab strip / sidebar AND the Workspace App Shell adds SNOW's own chrome on top. That's a known consequence of the wrap-as-is approach — see [07-roadmap.md](07-roadmap.md) for the Path B migration that removes the duplication.

### 7.3 Smoke test

1. Log in as a test user with the dispatcher role.
2. Open the Workspace.
3. Click the menu item.
4. Verify: matrix renders, paging works, drill-down opens tabs, close button removes tabs, "Needs Attention" filter shrinks the list.

If any of these fail, the failure is almost always one of:

| Symptom | Most likely cause |
|---|---|
| Page is blank with no error in your code's console | View signature mismatch or a snabbdom JSX gotcha — §4. Look for `@servicenow/ui-renderer-snabbdom For component <x-... /> with origin 'onStateChange'` in the console. |
| Matrix area shows "Failed to load matrix: HTTP 4xx" | Scripted REST URL wrong or API ID kept as snake_case where vendor expects kebab. See [05-scripted-rest.md §0.1](05-scripted-rest.md#01-create-the-scripted-rest-services). |
| Matrix shows `Failed to load matrix: Unexpected token '<', "<!DOCTYPE"...` | URL returns the dev-server's `index.html`. URL doesn't match anything routable; check Network tab. |
| Matrix loads but every dot is `—` | `tasks` map keyed by something other than canonical German name. See [05-scripted-rest.md §2.4](05-scripted-rest.md#24-critical-detail--the-tasks-map-key). |
| Matrix renders shape but `data.columns` is `undefined` | SNOW `{result: ...}` envelope unwrap missing — §3.4. |
| Clicks do nothing | Vendor dispatches still go through `document`. Apply §3.1 + §3.2 patches. |
| Drill-down detail page 404s | `baseUrl` property points at wrong namespace, or API IDs are snake_case mismatching vendor paths — §3.3 + [05-scripted-rest.md §0.1](05-scripted-rest.md#01-create-the-scripted-rest-services). |
| No Polaris theming | `--now-*` token names don't match your release; check `sys_ux_lib_style` for the right names. The literal fallbacks in `styles.scss` keep the visual reasonable but not themed. |
| Configure panel only shows "Component visibility" | `now-ui.json` properties array missing — §5. Redeploy, remove placed component from canvas, hard-refresh, re-add. |

---

## 8. Update set contents

A single update set for promotion should include:

- `sys_app` — the wo-matrix application record.
- `sys_ux_lib_component` — the wrapper component.
- `sys_ux_macroponent` + `sys_ux_lib_component_attr` (×2) — UI Builder metadata.
- `sys_ux_lib_asset` — bundled JS + CSS assets.
- `sys_ux_page` — the UI Builder page from §7.1.
- `sys_ux_screen` + `sys_ux_workspace` — Workspace registration from §7.2.
- Three Scripted REST APIs + their resources — see [05-scripted-rest.md §10](05-scripted-rest.md#10-update-set-hygiene).
- Script Include `HFSMatrixUtil`.
- System Property `x_company.hfs.task_columns_json`.
- ACLs on `wm_customer_order` / `wm_rfs_order` / `wm_task` for the dispatcher role.

`snc ui-component generate-update-set` writes the component bits to `.now-cli/sys_remote_update_set_*.xml`; capture the rest via a manual Update Set.

---

## See also

- [01-architecture.md](01-architecture.md) — top-down repo map
- [03-api-contract.md](03-api-contract.md) — wire shapes
- [05-scripted-rest.md](05-scripted-rest.md) — back-end implementation
- [07-roadmap.md](07-roadmap.md) — what's next (Path B, write actions, role gating)
