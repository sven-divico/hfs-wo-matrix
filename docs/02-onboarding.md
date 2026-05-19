# Engineer onboarding

**Welcome.** You've been added to the wo-matrix project — the ServiceNow Now Experience component that renders the HFS Work Order × Task status matrix inside a Configurable Workspace. This doc gets you from zero to "I can run it locally and I know where to make changes" in about an hour.

If you read only one other thing, read [03-api-contract.md](03-api-contract.md) — it's the JSON shape every endpoint produces and every component consumes.

---

## TL;DR

1. **Clone + install + run the local preview.** Fifteen minutes, no SNOW instance needed.
2. **Read the architecture map** in [01-architecture.md](01-architecture.md). What's where, why.
3. **Pick a small thing to change** and watch HMR. The dev preview reloads inside a second.
4. **Read the contract** ([03-api-contract.md](03-api-contract.md)) once you're ready to extend or replace the data layer.

---

## Step 1 — Run the local preview (15 minutes)

You don't need a SNOW instance for the front-end loop. The local preview bundles synthetic data via a fetch interceptor and exercises the full shell.

### Prerequisites

- Node 22 (the project's `engines.node` is `>=22`; earlier versions may work but aren't tested).
- macOS, Linux, or WSL2.
- A ServiceNow CLI installation if you intend to deploy. **Install the native `.pkg` from the developer portal**, not the npm `@servicenow/cli` package — the npm version ships an older binary with a separate profile store and is the #1 source of "SNC not found" loops. See [01-architecture.md §5](01-architecture.md#5-the-snc-cli) for the install dance.

### Get it running

```bash
git clone https://github.com/sven-divico/hfs-wo-matrix.git
cd hfs-wo-matrix
npm install                       # ~30s; runs patch-package post-install
snc ui-component develop          # dev server at http://127.0.0.1:8081/
```

Open <http://127.0.0.1:8081/>. You should see:

- A dark topbar with `DG` brand and the `HFS Workspace ★` pill.
- An action-bar strip with "Last refreshed just now".
- A tab strip with a single "Legacy Orders" tab.
- A sidebar with "Legacy Orders" / "Needs Attention".
- A table of 25 synthetic Customer Orders with coloured task-state dots.
- A "1–25 of 27" paginator at the bottom.

Click "Needs Attention" → table refetches with the `?list=attention` filter. Click a Customer Order number → a new tab opens with that CO's detail. Click an RFS pill → another tab. Click `×` on any non-matrix tab → it closes.

### What runs where

```
example/
├── element.js     ← snc develop entry. Mounts the component with stub URLs.
└── stub.js        ← fetch interceptor for /stub/wo-matrix/...

src/x-2057350-wo-matrix/
├── index.js       ← NXF wrapper (createCustomElement + snabbdom view)
├── styles.scss    ← --hfs-* ↔ --now-* token mapping + layout
└── vendor/        ← the four originating Web Components, shadow-root-safe
```

`example/` is local-only — production deploys don't bundle it. The wrapper component reads `endpoint` and `baseUrl` properties pointing at real SNOW Scripted REST URLs by default; only the local stub sets them to `/stub/wo-matrix/...`.

### If the page is blank

The most common first-time failure: bundle inits, no errors in console, page blank. Causes documented in [06-component-anatomy.md §4](06-component-anatomy.md#4-the-wrapper-view--snabbdom-jsx-rules). First place to look: browser console for `@servicenow/ui-renderer-snabbdom For component <x-... /> with origin 'onStateChange'` — that's where snabbdom logs swallowed view errors.

If snc develop itself fails to compile, check [06-component-anatomy.md §6.1](06-component-anatomy.md#61-ajv-version-skew-patch) — there's a one-time `patch-package` workaround for the bundled Ajv version skew.

---

## Step 2 — Read the architecture map (10 minutes)

[01-architecture.md](01-architecture.md) is a 5-minute read that shows what each top-level directory does and the data flow from URL parameter → matrix endpoint → table cell. Have it open in a tab while you skim the source.

The high-leverage files to know:

| File | What it does | When you'll edit it |
|---|---|---|
| `src/x-2057350-wo-matrix/index.js` | NXF wrapper, view function, properties, action handlers | Adding a property, changing the shell layout, wiring new actions |
| `src/x-2057350-wo-matrix/styles.scss` | Polaris token mapping, layout, status-dot colours | Theming tweaks, new tab types, new dot states |
| `src/x-2057350-wo-matrix/vendor/wo-status-matrix.js` | The pivot table | Adding columns, sorting, new filter params |
| `src/x-2057350-wo-matrix/vendor/tab-strip.js` | Workspace tab manager | New tab types, tab persistence, close confirmation |
| `now-ui.json` | UI Builder property descriptors | Adding bindable properties for UI Builder admins |
| `snow/scripted-rest/*.js` | Synthetic-data stubs for the four endpoints | Production back-end work — see [05-scripted-rest.md](05-scripted-rest.md) |

The four vendor components are nearly the same as their original demonstrator versions; the differences are documented patch-by-patch in [06-component-anatomy.md §3](06-component-anatomy.md#3-the-four-vendor-patches).

---

## Step 3 — Make a tiny change

Pick something small to watch HMR work. Suggestions:

### Easy: change the topbar pill text

In `src/x-2057350-wo-matrix/index.js`, find `HFS Workspace ★` in the view function and change it. Save → the dev server rebuilds → the page reloads → you see the new text. Total round-trip: ~1 second.

### Slightly less easy: add a third sidebar entry

Currently the sidebar has "Legacy Orders" and "Needs Attention". Add a third — say, "Recently Updated". You'll need:

1. A new `<button class="list-item">` in the view (snabbdom JSX, mind the `data-list` casing — see [06-component-anatomy.md §4.3](06-component-anatomy.md#43-data--attributes-use-camelcase-after-the-prefix)).
2. The `HFS#SIDEBAR_LIST_CLICKED` action handler already routes by `payload.list`, so just pass `'recent'` (or whatever) as the value.
3. The matrix's `_fetch` already sends `?list=…` to the endpoint; you'll get a 400 from the showcase stub unless you add a branch for the new filter — [`snow/scripted-rest/matrix.js`](../snow/scripted-rest/matrix.js) is straightforward to extend.

This exercises every layer of the codebase at small scale.

---

## Step 4 — Know the data contract

Once you start making non-trivial changes, [03-api-contract.md](03-api-contract.md) is the authoritative reference for what shape each endpoint must produce and each component must accept. The contract is the same whether the data comes from the synthetic stub, a local in-memory fixture, or production GlideRecord queries.

When you're standing up the real back-end against `wm_customer_order` / `wm_rfs_order` / `wm_task`, read [04-data-model.md](04-data-model.md) for the table model and [05-scripted-rest.md](05-scripted-rest.md) for the GlideScript patterns. The synthetic stubs in `snow/scripted-rest/` serve as working examples of the response shapes you need to produce.

---

## Common recipes

### "How do I do the pivot in GlideScript?"

The structure is:

```
1. Query wm_customer_order for the page → array of CO records.
2. Query wm_task with a dot-walked encoded query
   ('rfs_order.customer_orderIN…') scoped to the page's CO uuids → flat (rfs, task name, state) records.
3. Build a Map<co_uuid, Record<task_name, state>>.
4. For each CO, attach `tasks: theMap.get(co.uuid) ?? {}`.
5. Return { total, offset, limit, columns, rows }.
```

Full reference in [04-data-model.md §4](04-data-model.md#4-glidescript-reference--paginated-matrix).

### "Matrix renders but every cell is `—`"

The #1 wrong-shape bug. Your API is returning the `tasks` map with the wrong key shape. The component looks up `row.tasks[column.name]` where `column.name` is the canonical German name (`"HV-S"`, `"GIS Planung"`, …). If your API returns the keys as `short` codes (`"HV"`) or English labels (`"Standard House Visit"`), every lookup fails.

**Fix:** ensure the GlideRecord uses `wm_task.short_description` (the canonical name) as the map key. See [05-scripted-rest.md §2.4](05-scripted-rest.md#24-critical-detail--the-tasks-map-key).

### "Drill-down doesn't work — clicks do nothing"

The dispatch / shadow-root patches in [06-component-anatomy.md §3.1–§3.2](06-component-anatomy.md#31-dispatch-from-the-element-not-from-document) are not in place. If you've cloned this repo they should already be — verify the vendor files have `dispatch(this, …)` not `dispatch(…)` and `tab-strip` uses `this._root` not `document`.

### "I need a new task type / status state"

- New task: add a row to [`src/x-2057350-wo-matrix/vendor/task-columns.json`](../src/x-2057350-wo-matrix/vendor/task-columns.json) AND to the System Property `x_company.hfs.task_columns_json` in production. Both copies must agree.
- New lifecycle state: extend `stateClass()` in [`vendor/wo-status-matrix.js`](../src/x-2057350-wo-matrix/vendor/wo-status-matrix.js) and add a matching CSS rule for the dot colour in [`styles.scss`](../src/x-2057350-wo-matrix/styles.scss).

### "How do I deploy?"

```bash
snc ui-component deploy         # uses the `default` profile
```

This pushes the component to your SNOW instance. The deploy log lists each `sys_id` created. Detail in [06-component-anatomy.md §7](06-component-anatomy.md#7-ui-builder--workspace-registration).

---

## FAQ

**Q: Can I rewrite the four vendor Web Components in snabbdom-native NXF style?**
Yes — that's the Path B migration in [07-roadmap.md](07-roadmap.md). It's pure refactor; behaviour and visuals stay identical.

**Q: The matrix endpoint takes `limit` / `offset`. SNOW uses `sysparm_limit` / `sysparm_offset`. Which wins?**
The component is parameterised via `data-endpoint` — set it to whatever your Scripted REST URL accepts. Most production deploys read either name server-side; the showcase stubs accept only `limit` / `offset` for clarity. See [05-scripted-rest.md §2](05-scripted-rest.md#2-resource-matrix-the-pivot).

**Q: Do I need WebSocket / real-time updates?**
Not in v1. Users get a fresh view on tab open / list switch. If business asks for live updates, that's a future iteration in [07-roadmap.md](07-roadmap.md).

**Q: Can I evolve the API contract?**
Yes, but coordinate with the project lead first. The shape is documented in [03-api-contract.md](03-api-contract.md). Backward-compatible additions (new optional fields) are fine; renaming or removing fields breaks the component.

**Q: There's no `sys_updated_on` per task in the matrix response. Why?**
Trade-off: the matrix endpoint returns 25 × 17 = 425 task entries per page. Including a full timestamp per cell roughly doubles the payload. The matrix tooltip therefore shows state only; the per-task `<task-detail-tab>` shows full timestamps. If business wants timestamps in the matrix tooltip, change the `tasks` map shape from `{name: state}` to `{name: {state, sys_updated_on}}` and update the component accordingly.

---

## When to ping the project lead

You should be able to do most of this independently. Reach out for:

- A field in the API contract is ambiguous and the showcase stubs don't disambiguate it.
- A SNOW-platform constraint makes a contract impossible to satisfy (e.g. ACL prevents reading `wm_task` for the user account).
- Business asks for a feature outside the [07-roadmap.md](07-roadmap.md) backlog — get it on the roadmap before improvising.
- An `@servicenow/cli` version bump breaks the local preview in a way `patches/` doesn't cover.

**Lead contact:** sven.s0042@gmail.com.
**Repo issues:** <https://github.com/sven-divico/hfs-wo-matrix/issues>.

---

## What "done" looks like for the production deployment

- The component embedded in a Workspace UI Builder page.
- The matrix renders 25+ rows against live `wm_customer_order` / `wm_rfs_order` / `wm_task` data (not the showcase stubs).
- Click → drill-down → close cycle works end-to-end.
- Pagination works against `sysparm_limit` / `sysparm_offset`.
- The visual matches the showcase within a small Polaris-token-mapping delta.
- A handover doc on the platform team's side that lists the four Scripted REST URLs + the project commit hash you deployed from.

The showcase port at this repo's [v0.1 tag](https://github.com/sven-divico/hfs-wo-matrix/releases) is the known-good baseline to diff against.
