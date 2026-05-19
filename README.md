# wo-matrix — HFS Work Order status matrix

A ServiceNow Now Experience Framework (NXF) component that renders the HFS Work Order × Task status matrix inside a Configurable Workspace. Deployed as a macroponent backed by four Scripted REST endpoints.

This is the **deployable project** — full developer documentation lives in [`docs/`](docs/), reference Scripted REST stub bodies in [`snow/scripted-rest/`](snow/scripted-rest/), and the front-end source in [`src/x-2057350-wo-matrix/`](src/x-2057350-wo-matrix/).

## Quick start

```bash
git clone https://github.com/sven-divico/hfs-wo-matrix.git
cd hfs-wo-matrix
npm install                       # postinstall reapplies patches/@servicenow+ui-core+24.1.1.patch
snc ui-component develop          # http://127.0.0.1:8081/ — renders 27 synthetic rows from example/stub.js
```

A browser tab opens with the full shell and a 27-row stubbed matrix. No SNOW instance needed for the front-end loop. To deploy:

```bash
snc ui-component deploy           # uses your default `snc configure profile set` profile
```

Then build a UI Builder page hosting the component, register it in a Configurable Workspace, and either paste the four GlideScript stubs from [`snow/scripted-rest/`](snow/scripted-rest/) into your instance (for a showcase) or build real GlideRecord-backed resources per [docs/05-scripted-rest.md](docs/05-scripted-rest.md).

## What's where

```
src/x-2057350-wo-matrix/         the NXF component (wrapper + vendor + styles)
example/                         snc-develop mount + fetch stub for local preview
snow/scripted-rest/              4 GlideScript stub bodies for the back-end
docs/                            full developer documentation
patches/                         patch-package payload (Ajv version skew fix)
now-ui.json                      UI Builder property descriptors
```

## Documentation

| # | Doc | Read when |
|---|---|---|
| 1 | [docs/01-architecture.md](docs/01-architecture.md) | First. Top-down map of the repo. |
| 2 | [docs/02-onboarding.md](docs/02-onboarding.md) | When you start working in the codebase. |
| 3 | [docs/03-api-contract.md](docs/03-api-contract.md) | When extending an endpoint or component. The wire authority. |
| 4 | [docs/04-data-model.md](docs/04-data-model.md) | When replacing the synthetic-data stubs with production GlideRecord queries. |
| 5 | [docs/05-scripted-rest.md](docs/05-scripted-rest.md) | When writing the production Scripted REST resources. |
| 6 | [docs/06-component-anatomy.md](docs/06-component-anatomy.md) | When extending the front-end. Documents the silent failure modes too. |
| 7 | [docs/07-roadmap.md](docs/07-roadmap.md) | When picking the next piece of work. |

If you're brand new: 01 → 02 → 03 in that order.

## UI Builder configuration

The component exposes two bindable properties:

| Property | Default | What to set per environment |
|---|---|---|
| `Matrix endpoint URL` | `/api/x_2057350_wo_mat_0/work_orders/matrix` | The Scripted REST URL of the `matrix` resource. On a PDI it's `/api/<digits>/work_orders/matrix`; on a scoped instance it's `/api/<scope-namespace>/work_orders/matrix`. |
| `Detail API base URL` | `/api/x_2057350_wo_mat_0` | The namespace base. The component appends `/customer_orders/{uuid}` and friends to this when fetching detail tabs. |

Both are bindable to UI Builder Data Resources or URL parameters — see [docs/03-api-contract.md](docs/03-api-contract.md) and [docs/06-component-anatomy.md §5](docs/06-component-anatomy.md#5-ui-builder-property-metadata-in-now-uijson) for the details.

## Caveats you'll hit

Three things bit hard during the original build and have full explanations in [docs/06-component-anatomy.md](docs/06-component-anatomy.md):

1. **`snc ui-component develop` is blocked by an Ajv version skew on the bundled `@servicenow/ui-core` 24.1.1** — captured in [`patches/`](patches/) and reapplied automatically by `patch-package` on `npm install`. Don't drop the postinstall script. Details: [docs/06 §6.1](docs/06-component-anatomy.md#61-ajv-version-skew-patch).
2. **snabbdom JSX has three rules the typical doc gets wrong** — inline `style` strings, kebab-case `data-*`, and unprefixed SVG attrs all crash silently. Details: [docs/06 §4](docs/06-component-anatomy.md#4-the-wrapper-view--snabbdom-jsx-rules).
3. **SNOW wraps every Scripted REST payload in `{"result": ...}`** automatically. The vendor consumers strip the envelope; the scripts return the natural shapes. Details: [docs/05 intro](docs/05-scripted-rest.md).

All three surface as "blank page, no error in your code's console". When debugging, look in the browser console for `@servicenow/ui-renderer-snabbdom For component <x-... /> with origin 'onStateChange'` — that's where snabbdom logs the swallowed errors.

## Contact

- **Issues:** <https://github.com/sven-divico/hfs-wo-matrix/issues>
- **Project lead:** sven.s0042@gmail.com
