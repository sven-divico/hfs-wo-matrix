# Scripted REST stubs for the wo-matrix showcase

Four GlideScript resources that return deterministic synthetic data matching the contract documented in [docs/03-api-contract.md](../../docs/03-api-contract.md). They let the deployed component render end-to-end on a fresh PDI without standing up the three-table data model.

For the production back-end pattern that replaces these stubs, see [docs/04-data-model.md](../../docs/04-data-model.md) + [docs/05-scripted-rest.md](../../docs/05-scripted-rest.md).

## URL layout

The wrapper component is configured with two UI Builder properties:

- `Matrix endpoint URL` → `/api/<namespace>/work-orders/matrix`
- `Detail API base URL`  → `/api/<namespace>`

The detail tabs then derive:

- `/api/<namespace>/customer-orders/{uuid}`
- `/api/<namespace>/customer-orders/{uuid}/tasks/{taskName}`
- `/api/<namespace>/rfs-orders/{rfsId}`

On a PDI `<namespace>` is the bare digits of the scope (e.g. `2057350`). On a real instance with a `x_<companycode>_*` scope, the namespace is whatever your platform team assigns — check the **API namespace** field on each Scripted REST API record after creation.

## Setup steps

For each of the three APIs below:

1. **All → System Web Services → Scripted REST APIs → New**.
2. Set **Name**, **API ID** (override the auto-derived snake_case to the kebab-case shown), **Application** = your wo-matrix scope.
3. Save the API record.
4. Scroll to **Resources** related list → **New**.
5. Set **HTTP method** = `GET`, **Relative path** = as shown, paste the script below.
6. On the Resource's **Security** tab — for the showcase, leave ACLs empty so any authenticated user can hit it. For production, gate with a dispatcher role.

| API name | API ID (override) | Resources |
|---|---|---|
| Work Orders | `work-orders` | `/matrix` |
| Customer Orders | `customer-orders` | `/{uuid}`, `/{uuid}/tasks/{taskName}` |
| RFS Orders | `rfs-orders` | `/{rfsId}` |

## Files in this directory

- `matrix.js` — paste into the `/matrix` resource of the `work-orders` API.
- `customer-order.js` — paste into the `/{uuid}` resource of `customer-orders`.
- `task.js` — paste into the `/{uuid}/tasks/{taskName}` resource of `customer-orders`.
- `rfs-order.js` — paste into the `/{rfsId}` resource of `rfs-orders`.

Each script is self-contained (no Script Includes required). Lots of duplication between them — that's intentional for showcase clarity. A production port would extract the shared `COLUMNS` / `CITIES` arrays into a `HFSStubData` Script Include and call into it from each resource.

## Why the response envelope works

ServiceNow's Scripted REST framework wraps every `response.setBody({...})` payload in a top-level `{"result": ...}` envelope. The vendor components in this repo already strip that envelope before consuming, so the GlideScripts can return their natural shape without any plumbing.
