# Developer documentation

Documentation for engineers building, deploying, and extending the wo-matrix component.

This documentation supersedes the earlier `hfs-demonstrator/dev-guide/` — the demonstrator repo is archived. Everything you need lives here.

---

## Reading order

| # | Doc | What it gives you |
|---|---|---|
| 1 | [01-architecture.md](01-architecture.md) | Top-down map of the repo. Where each piece lives, how the layers fit, the data flow from URL parameter → table cell. 10-minute read. |
| 2 | [02-onboarding.md](02-onboarding.md) | Hands-on: clone, install, run the local preview, make a tiny change and see HMR work. ~1 hour to get comfortable. |
| 3 | [03-api-contract.md](03-api-contract.md) | The wire contract — JSON shapes for all four endpoints, custom-element APIs, CSS token mapping. The authority for any consumer/producer. |
| 4 | [04-data-model.md](04-data-model.md) | `wm_customer_order` / `wm_rfs_order` / `wm_task` schema + the GlideRecord patterns for the paginated matrix pivot. Read when standing up production back-end. |
| 5 | [05-scripted-rest.md](05-scripted-rest.md) | Step-by-step Scripted REST recipe — replaces the showcase stubs in [`snow/scripted-rest/`](../snow/scripted-rest/) with GlideRecord-backed implementations. |
| 6 | [06-component-anatomy.md](06-component-anatomy.md) | How `src/x-2057350-wo-matrix/` is structured. The four vendor patches, the snabbdom JSX rules, UI Builder property metadata, the local-dev Ajv workaround. Read when extending the front-end. |
| 7 | [07-roadmap.md](07-roadmap.md) | What's next — Path B migration, write actions, smart filters, role gating, and smaller cleanups. |

If you're brand new, do 1 → 2 → 3 in that order. The rest are reference material; read on demand.

---

## Quick links

- **GitHub:** <https://github.com/sven-divico/hfs-wo-matrix>
- **Issues:** <https://github.com/sven-divico/hfs-wo-matrix/issues>
- **Project lead:** sven.s0042@gmail.com
- **PDI used for the showcase:** `dev202666.service-now.com` (scope `x_2057350_wo_mat_0`)

---

## What you'll be working with

```
4 vendor Web Components  +  1 NXF wrapper  +  4 Scripted REST endpoints  +  3-table data model
```

Front-end is in `src/x-2057350-wo-matrix/`; synthetic-data back-end stubs are in `snow/scripted-rest/`. The production back-end (GlideRecord against `wm_customer_order` / `wm_rfs_order` / `wm_task`) is documented in [04](04-data-model.md) + [05](05-scripted-rest.md) but not yet implemented in this repo — that's the first item on the [roadmap](07-roadmap.md).
