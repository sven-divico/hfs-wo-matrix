# Scripted REST recipe — replacing the showcase stubs

**Audience:** engineer writing the production Scripted REST resources that replace the four synthetic-data stubs in [`snow/scripted-rest/`](../snow/scripted-rest/).

**Prereq:** [03-api-contract.md](03-api-contract.md) for the response shapes, [04-data-model.md](04-data-model.md) for the table schema.

The showcase stubs return deterministic synthetic data — enough to demo the visual + interaction contract on a fresh PDI without touching real tables. This doc walks through replacing them with GlideRecord-backed implementations against `wm_customer_order` / `wm_rfs_order` / `wm_task`.

> **Caveat ServiceNow handles for you:** every response goes through SNOW's Scripted REST framework which wraps `response.setBody(payload)` in `{"result": <payload>}` automatically. The component's vendor code strips that envelope before consuming, so your scripts can return the natural shapes documented in [03-api-contract.md](03-api-contract.md) without any wrapper-aware plumbing. There is no way to disable the envelope from inside the script — `response.getStreamWriter().writeString(JSON.stringify(payload))` bypasses it if you ever need raw output, but stick with `setBody` and let the vendor unwrap unless you have a specific reason.

---

## 0. One-time setup

### 0.1 Create the Scripted REST Services

Each resource family becomes its own Scripted REST API record. For the four endpoints documented in [03-api-contract.md §B](03-api-contract.md#b-rest-api):

**All → System Web Services → Scripted REST APIs → New** for each of these:

| Name | API ID *(override to kebab)* | Application scope | Resources |
|---|---|---|---|
| Work Orders | `work_orders` | your wo-matrix scope | `GET /matrix` |
| Customer Orders | `customer_orders` | your wo-matrix scope | `GET /{uuid}`, `GET /{uuid}/tasks/{taskName}` |
| RFS Orders | `rfs_orders` | your wo-matrix scope | `GET /{rfsId}` |

> **API ID gotcha:** SNOW auto-derives the API ID from the Name field as snake_case (`"Work Orders"` → `work_orders`). The vendor code in [`src/x-2057350-wo-matrix/vendor/`](../src/x-2057350-wo-matrix/vendor/) constructs URLs with kebab-case path segments. Override the auto-derived API ID to the kebab form at create time, otherwise the detail-tab fetches will 404. The showcase stubs in [`snow/scripted-rest/README.md`](../snow/scripted-rest/README.md) document the same pattern.

The base URL pattern is `/api/<namespace>/<api_id>/<resource_path>`. On a PDI, `<namespace>` is the bare digits of your developer ID (e.g. `2057350`); on a real scoped instance, it's whatever your platform team assigned — check the **API namespace** field on the API record after save.

### 0.2 Stash the canonical task registry

The 17-task list is the same data shipped at [`src/x-2057350-wo-matrix/vendor/task-columns.json`](../src/x-2057350-wo-matrix/vendor/task-columns.json). For production, store it as a **System Property** so all the matrix-side scripts can read it.

**System Properties → New:**

| Field | Value |
|---|---|
| Name | `x_company.hfs.task_columns_json` |
| Type | `string` |
| Value | (the full JSON below, on one line) |

```json
[{"name":"HV-S","short":"HV","label":"Standard House Visit","sequence":1},{"name":"UV-S","short":"UV","label":"Standard Unit Visit","sequence":2},{"name":"HV-NE4","short":"HV4","label":"House Visit NE4","sequence":3},{"name":"UV-NE4","short":"UV4","label":"Unit Visit NE4","sequence":4},{"name":"GIS Planung","short":"GP","label":"GIS Planning - NAS","sequence":5},{"name":"Fremdleitungsplan","short":"LLD","label":"Utility Lines Plan","sequence":6},{"name":"Genehmigungen","short":"PM","label":"Permits (VRAO / Aufbruch)","sequence":7},{"name":"Tiefbau","short":"CV","label":"Civil Works","sequence":8},{"name":"Spleißen","short":"SP","label":"Splicing","sequence":9},{"name":"Einblasen","short":"BF","label":"Blow-in Fiber","sequence":10},{"name":"Gartenbohrung","short":"GD","label":"Garden Drilling","sequence":11},{"name":"Hauseinführung","short":"WB","label":"Wall Breakthrough","sequence":12},{"name":"HÜP","short":"HÜP","label":"Install HÜP","sequence":13},{"name":"Leitungsweg NE4","short":"CW4","label":"Cable Way NE4","sequence":14},{"name":"GFTA","short":"GFTA","label":"Install GFTA","sequence":15},{"name":"ONT","short":"ONT","label":"Install ONT","sequence":16},{"name":"Patch","short":"PCH","label":"Patch","sequence":17}]
```

### 0.3 Create a Script Include for shared helpers

**Script Includes → New:**

| Field | Value |
|---|---|
| Name | `HFSMatrixUtil` |
| API Name | `x_company.HFSMatrixUtil` |
| Client callable | `false` |
| Application | your wo-matrix scope |

```javascript
var HFSMatrixUtil = Class.create();
HFSMatrixUtil.prototype = {
    initialize: function () {},

    /** Read the canonical 17-task registry. */
    getTaskColumns: function () {
        var raw = gs.getProperty('x_company.hfs.task_columns_json', '[]');
        try { return JSON.parse(raw); }
        catch (e) {
            gs.error('HFSMatrixUtil: task_columns_json is malformed: ' + e);
            return [];
        }
    },

    /** Read & clamp an integer query parameter. */
    clampInt: function (raw, fallback, min, max) {
        var n = parseInt(raw, 10);
        if (isNaN(n)) return fallback;
        return Math.max(min, Math.min(max, n));
    },

    /** Standard error response. Always emit through this helper. */
    sendError: function (response, status, code, message) {
        response.setStatus(status);
        response.setBody({ error: code, message: message });
    },

    /** Serialise a wm_customer_order GlideRecord into the matrix row shape. */
    serialiseCustomerOrder: function (gr) {
        return {
            uuid:                gr.getValue('uuid'),
            number:              gr.getValue('number'),
            status_code:         gr.getDisplayValue('status_code'),
            construction_status: gr.getValue('construction_status'),
            city:                gr.getValue('city'),
            address:             gr.getValue('address'),
            sys_updated_on:      gr.getValue('sys_updated_on')
        };
    },

    /** Serialise a wm_task GlideRecord into the task-detail shape. */
    serialiseTask: function (gr) {
        return {
            number:            gr.getValue('number'),
            short_description: gr.getValue('short_description'),     // canonical German name
            state:             gr.getValue('state'),
            assignment_group:  gr.getDisplayValue('assignment_group') || null,
            sys_updated_on:    gr.getValue('sys_updated_on'),
            rfs_type:          gr.getValue('rfs_type')                // denormalised, see 04-data-model §3.1
        };
    },

    type: 'HFSMatrixUtil'
};
```

> **Field name caveat.** This Script Include assumes `wm_customer_order.status_code`, `wm_customer_order.construction_status`, `wm_task.short_description`, `wm_task.state` exist with those exact names. If your instance uses different fields (e.g. `state` as an integer choice list with display values like `"Work In Progress"`), swap `getValue` → `getDisplayValue` accordingly. Verify against `sys_dictionary` first.

---

## 1. Resource: `task-columns` (optional, but nice)

Build this first to confirm your scaffold works end-to-end. The wrapper component doesn't actually fetch this endpoint — it reads `columns` from the matrix payload — but exposing it is useful for any other tooling that needs the canonical registry.

**API:** `Work Orders` *(or a separate utility API; doesn't matter)*
**Resource path:** `/task-columns`
**HTTP method:** `GET`

```javascript
(function process(request, response) {
    var util = new x_company.HFSMatrixUtil();
    response.setStatus(200);
    response.setBody(util.getTaskColumns());
})(request, response);
```

**Smoke test:**
- REST API Explorer → URL: `/api/<namespace>/work_orders/task-columns`
- Expected: JSON array, 17 entries, first one `{"name":"HV-S","short":"HV",...}` (wrapped in `{"result": [...]}` by SNOW).

If this works, your service + scope + Script Include are wired correctly.

---

## 2. Resource: `matrix` (the pivot)

The centerpiece. Replaces [`snow/scripted-rest/matrix.js`](../snow/scripted-rest/matrix.js).

**API:** `Work Orders`
**Resource path:** `/matrix`
**HTTP method:** `GET`
**Query parameters consumed:** `list`, `limit`, `offset` (also accept SNOW conventional names `sysparm_limit` / `sysparm_offset`)

The full implementation is in [04-data-model.md §4](04-data-model.md#4-glidescript-reference--paginated-matrix). The structural template is:

```javascript
(function process(request, response) {
    try {
        var util   = new x_company.HFSMatrixUtil();
        var qp     = request.queryParams;

        var list = String(qp.list || 'legacy');
        if (list !== 'legacy' && list !== 'attention') {
            return util.sendError(response, 400, 'bad_list',
                "Unknown list '" + list + "'. Allowed: legacy, attention.");
        }

        var limit  = util.clampInt(qp.sysparm_limit  || qp.limit,  25, 1, 200);
        var offset = util.clampInt(qp.sysparm_offset || qp.offset, 0,  0, 1e9);

        // … see 04-data-model.md §4 for the full pivot body …

        response.setStatus(200);
        response.setBody({
            total:   total,
            offset:  offset,
            limit:   limit,
            columns: util.getTaskColumns(),
            rows:    rows
        });
    } catch (e) {
        gs.error('HFS Matrix /matrix error: ' + e + '\nStack: ' + e.stack);
        response.setStatus(500);
        response.setBody({ error: 'internal', message: 'Internal server error.' });
    }
})(request, response);
```

Three pagination patterns are worth understanding even if you copy the body verbatim:

### 2.1 Window the outer query with `chooseWindow`

```javascript
coGR.orderByDesc('number');
coGR.chooseWindow(offset, offset + limit, true);   // [start, end), forceCount=true
coGR.query();
```

`chooseWindow(start, end, forceCount)` reads rows in the half-open range `[start, end)`. Pass `forceCount = true` so the row count materialises — without it, `getRowCount()` returns -1 until you exhaust the iterator.

### 2.2 Compute `total` with `GlideAggregate`

The component's pagination footer ("1–25 of 27") needs `total` separately from the page size. Compute it once per request, with the **same encoded query** the page uses:

```javascript
var counter = new GlideAggregate('wm_customer_order');
if (filterEncodedQuery) counter.addEncodedQuery(filterEncodedQuery);
counter.addAggregate('COUNT');
counter.query();
var total = counter.next() ? parseInt(counter.getAggregate('COUNT'), 10) : 0;
```

- `getAggregate('COUNT')` returns a **string**, not a number. Wrap with `parseInt(_, 10)` so the response field has the right type — the component reads `total` as a number.
- `GlideAggregate` honours the same ACLs as a plain `GlideRecord`. The `total` reflects what the calling user can see, which is the correct behaviour.

### 2.3 Collapse N+1 into one batched task query

After fetching the page of CO rows, gather their UUIDs and run **one** task query with a dot-walked encoded query:

```javascript
var pageIds = orders.map(function (o) { return o.uuid; });

var taskGR = new GlideRecord('wm_task');
taskGR.addEncodedQuery('rfs_order.customer_orderIN' + pageIds.join(','));
taskGR.query();

var tasksByCo = {};
while (taskGR.next()) {
    var coId = taskGR.getDisplayValue('rfs_order.customer_order') ||
               taskGR.rfs_order.customer_order + '';
    var name = taskGR.getValue('short_description');   // canonical German name = map key
    var st   = taskGR.getValue('state');
    (tasksByCo[coId] = tasksByCo[coId] || {})[name] = st;
}

orders.forEach(function (o) { o.tasks = tasksByCo[o.uuid] || {}; });
```

For 25 rows per page, this turns **26 round-trips into 2**. See [04-data-model.md §4](04-data-model.md#4-glidescript-reference--paginated-matrix) for the full version including the `attention`-filter two-pass.

### 2.4 Critical detail — the `tasks` map key

The map keys must be the canonical German task names (`"HV-S"`, `"GIS Planung"`, `"HÜP"`). The component looks up `row.tasks[column.name]` where `column.name` comes from the task registry.

**The #1 wrong-shape bug** is building the map with the wrong key:

```javascript
//  WRONG — key is the display value, e.g. "Standard House Visit"
tasksByCo[coId][taskGR.getDisplayValue('short_description')] = st;

//  WRONG — key is the short code, e.g. "HV"
tasksByCo[coId][taskGR.getValue('short_code')] = st;

//  RIGHT — key is the canonical German name stored on the wm_task record
tasksByCo[coId][taskGR.getValue('short_description')] = st;
```

If every cell renders as `—` in the UI, this is the bug — verify the network-tab JSON keys match `columns[i].name` literally.

### 2.5 Page stability — ordering matters

`chooseWindow` returns stable pages **only when the underlying `orderBy` is unique per row**. CO `number` (`CO-YY-XXXX-XXXX`) is unique by construction, so `orderByDesc('number')` is safe.

If you later support sorting by a non-unique field (`construction_status` shares values across COs), add a deterministic tiebreaker:

```javascript
coGR.orderBy('construction_status');
coGR.orderBy('number');           // unique tiebreaker, applied after
```

Multiple `orderBy` calls compose left-to-right.

### 2.6 Smoke tests

| Request | Expected |
|---|---|
| `/matrix` | `total: <full count>, rows.length === Math.min(25, total)` |
| `/matrix?list=attention` | only COs with at least one Problem task |
| `/matrix?sysparm_limit=10&sysparm_offset=10` | page 2 of 10-row pages |
| `/matrix?list=bogus` | HTTP 400, body `{result: {error: "bad_list", message: "..."}}` |

---

## 3. Resource: `customer-order` (single CO + nested RFS + tasks)

Replaces [`snow/scripted-rest/customer-order.js`](../snow/scripted-rest/customer-order.js).

**API:** `Customer Orders`
**Resource path:** `/{uuid}`
**HTTP method:** `GET`

```javascript
(function process(request, response) {
    try {
        var util = new x_company.HFSMatrixUtil();
        var uuid = request.pathParams.uuid;

        // Validate format — adapt this regex to your production uuid convention
        if (!uuid || !/^[\w-]+$/.test(uuid)) {
            return util.sendError(response, 400, 'bad_uuid',
                "uuid must be a non-empty alphanumeric identifier.");
        }

        // Fetch the CO
        var coGR = new GlideRecord('wm_customer_order');
        if (!coGR.get('uuid', uuid)) {
            return util.sendError(response, 404, 'not_found',
                'Customer Order ' + uuid + ' not found.');
        }

        var out = util.serialiseCustomerOrder(coGR);
        // Add the detail-only fields the matrix row doesn't carry:
        out.customer_name         = coGR.getValue('customer_name');
        out.phone                 = coGR.getValue('phone') || null;
        out.order_date            = coGR.getValue('order_date');
        out.set_name              = coGR.getValue('set_name');
        out.unit_count            = parseInt(coGR.getValue('unit_count'), 10) || 0;
        out.scheduled_appointment = coGR.getValue('scheduled_appointment') || null;

        // Fetch the two RFS records (LMA + Connectivity)
        var rfsGR = new GlideRecord('wm_rfs_order');
        rfsGR.addQuery('customer_order', uuid);
        rfsGR.query();
        out.lma_order = null;
        out.connectivity_order = null;
        var rfsIds = [];
        while (rfsGR.next()) {
            var summary = {
                sys_id:   rfsGR.getUniqueValue(),
                number:   rfsGR.getValue('number'),
                rfs_type: rfsGR.getValue('rfs_type')
            };
            if (summary.rfs_type === 'LMA')          out.lma_order = summary;
            if (summary.rfs_type === 'Connectivity') out.connectivity_order = summary;
            rfsIds.push(summary.sys_id);
        }

        // Fetch all tasks across both RFS, in canonical order
        out.tasks = [];
        if (rfsIds.length > 0) {
            var taskGR = new GlideRecord('wm_task');
            taskGR.addEncodedQuery('rfs_orderIN' + rfsIds.join(','));
            taskGR.orderBy('short_description');
            taskGR.query();
            while (taskGR.next()) out.tasks.push(util.serialiseTask(taskGR));
        }

        response.setStatus(200);
        response.setBody(out);
    } catch (e) {
        gs.error('HFS Matrix /customer_orders error: ' + e + '\nStack: ' + e.stack);
        response.setStatus(500);
        response.setBody({ error: 'internal', message: 'Internal server error.' });
    }
})(request, response);
```

---

## 4. Resource: `rfs-order` (single RFS + parent CO + tasks)

Replaces [`snow/scripted-rest/rfs-order.js`](../snow/scripted-rest/rfs-order.js).

**API:** `RFS Orders`
**Resource path:** `/{rfsId}`
**HTTP method:** `GET`

```javascript
(function process(request, response) {
    try {
        var util  = new x_company.HFSMatrixUtil();
        var rfsId = request.pathParams.rfsId;

        if (!rfsId) {
            return util.sendError(response, 400, 'bad_rfs_id', 'rfsId is required.');
        }

        var rfsGR = new GlideRecord('wm_rfs_order');
        if (!rfsGR.get(rfsId)) {
            return util.sendError(response, 404, 'not_found',
                'RFS ' + rfsId + ' not found.');
        }

        // Parent Customer Order
        var coUuid = rfsGR.getValue('customer_order');
        var coGR = new GlideRecord('wm_customer_order');
        coGR.get('uuid', coUuid);

        // Tasks on this RFS
        var taskGR = new GlideRecord('wm_task');
        taskGR.addQuery('rfs_order', rfsGR.getUniqueValue());
        taskGR.orderBy('short_description');
        taskGR.query();
        var tasks = [];
        while (taskGR.next()) tasks.push(util.serialiseTask(taskGR));

        response.setStatus(200);
        response.setBody({
            sys_id:   rfsGR.getUniqueValue(),
            number:   rfsGR.getValue('number'),
            rfs_type: rfsGR.getValue('rfs_type'),
            customer_order: coGR.isValidRecord() ? {
                uuid:                coGR.getValue('uuid'),
                number:               coGR.getValue('number'),
                customer_name:        coGR.getValue('customer_name'),
                address:              coGR.getValue('address'),
                city:                 coGR.getValue('city'),
                construction_status:  coGR.getValue('construction_status'),
                set_name:             coGR.getValue('set_name')
            } : null,
            tasks: tasks
        });
    } catch (e) {
        gs.error('HFS Matrix /rfs_orders error: ' + e + '\nStack: ' + e.stack);
        response.setStatus(500);
        response.setBody({ error: 'internal', message: 'Internal server error.' });
    }
})(request, response);
```

---

## 5. Resource: `task` (single CO × task)

Replaces [`snow/scripted-rest/task.js`](../snow/scripted-rest/task.js).

**API:** `Customer Orders`
**Resource path:** `/{uuid}/tasks/{taskName}`
**HTTP method:** `GET`

```javascript
(function process(request, response) {
    try {
        var util     = new x_company.HFSMatrixUtil();
        var uuid     = request.pathParams.uuid;
        var taskName = request.pathParams.taskName;   // SNOW auto-decodes path segments

        if (!uuid) {
            return util.sendError(response, 400, 'bad_uuid', 'uuid is required.');
        }
        if (!taskName) {
            return util.sendError(response, 400, 'bad_task_name', 'taskName is required.');
        }

        // Find the task via dot-walked encoded query: any task whose RFS belongs
        // to this CO and whose short_description matches the canonical name.
        var taskGR = new GlideRecord('wm_task');
        taskGR.addEncodedQuery(
            'rfs_order.customer_order=' + uuid +
            '^short_description=' + taskName
        );
        taskGR.setLimit(1);
        taskGR.query();

        if (!taskGR.next()) {
            return util.sendError(response, 404, 'not_found',
                "Task '" + taskName + "' not found on CO " + uuid + '.');
        }

        response.setStatus(200);
        response.setBody(util.serialiseTask(taskGR));
    } catch (e) {
        gs.error('HFS Matrix /tasks error: ' + e + '\nStack: ' + e.stack);
        response.setStatus(500);
        response.setBody({ error: 'internal', message: 'Internal server error.' });
    }
})(request, response);
```

### 5.1 Umlauts & URL encoding

The component sends `encodeURIComponent(taskName)` so `HÜP` becomes `H%C3%9CP` in the URL. ServiceNow's Scripted REST framework auto-decodes `request.pathParams.taskName` once. **Do not call `decodeURIComponent` again** — that would double-decode and corrupt names containing `%`.

If your test client (curl, Postman) doesn't auto-encode, encode by hand.

---

## 6. ACLs and security

The component does read-only fetches. The four endpoints need read ACL on:

- `wm_customer_order` (all fields used in `serialiseCustomerOrder`)
- `wm_rfs_order` (fields read in the RFS detail + dot-walked queries)
- `wm_task` (all fields used in `serialiseTask`)

If your instance has row-level ACLs (e.g. "users only see their assignment-group's tasks"), the queries above respect them automatically — `GlideRecord` honours ACLs by default. The `total` count from §2.2 will reflect what the current user can see, which is the correct behaviour for the pagination footer.

To bypass ACLs for a dashboard service account that needs unrestricted reads, run the scripts as that service account (Scripted REST resource property "Run as" or impersonation). Don't add `gr.setWorkflow(false); gr.autoSysFields(false);` — those affect writes, not read ACLs.

---

## 7. Pagination Link header (optional but nice)

ServiceNow's built-in list APIs return a `Link` header with `rel="next"` / `rel="prev"`. The matrix component doesn't read these (it uses the `total` field in the body) but other consumers — and the SNOW REST API Explorer — will display them.

Add to the matrix script after computing `limit/offset/total`:

```javascript
function buildLink(baseUrl, list, off, lim, rel) {
    return '<' + baseUrl
        + '?list=' + encodeURIComponent(list)
        + '&sysparm_limit='  + lim
        + '&sysparm_offset=' + off
        + '>; rel="' + rel + '"';
}
var links = [];
var base  = '/api/' + gs.getProperty('glide.scriptedrest.api.namespace') +
            '/work_orders/matrix';
if (offset > 0)             links.push(buildLink(base, list, Math.max(0, offset - limit), limit, 'prev'));
if (offset + limit < total) links.push(buildLink(base, list, offset + limit,             limit, 'next'));
if (links.length)           response.setHeader('Link', links.join(', '));
response.setHeader('X-Total-Count', String(total));
```

---

## 8. Error response shape

Every non-`200` response from all four endpoints returns:

```json
{ "error": "<short-code>", "message": "<human-readable>" }
```

(Wrapped in `{"result": ...}` by SNOW.) The component treats any non-`200` as "render the error string from `message`" — you're free to invent new codes.

Standard codes:

| Status | Code | When |
|---|---|---|
| `400` | `bad_list` | Unknown `list` value |
| `400` | `bad_uuid` | Malformed or missing CO uuid |
| `400` | `bad_rfs_id` | Missing rfsId |
| `400` | `bad_task_name` | Missing or empty taskName |
| `404` | `not_found` | Record with that key does not exist |
| `500` | `internal` | Unhandled exception |

---

## 9. Top-level try/catch

Every script in §2-§5 wraps the body in `try { … } catch (e) { … }`. Don't skip this in production — ServiceNow's default unhandled-error response leaks stack traces in the body and yields a generic 500 the component shows as "HTTP 500" with no actionable message. The try/catch keeps the canonical `{error, message}` shape and logs the stack via `gs.error()` for the system log.

---

## 10. Update Set hygiene

Capture everything in one update set:

1. Three Scripted REST APIs (`Work Orders`, `Customer Orders`, `RFS Orders`) and their resources.
2. System Property `x_company.hfs.task_columns_json`.
3. Script Include `HFSMatrixUtil`.
4. The wo-matrix Now Experience custom component itself (the `sys_ux_lib_component` + `sys_ux_macroponent` + `sys_ux_lib_component_attr` records — `snc ui-component deploy` registers them).
5. UI Builder page hosting the component (sys_ux_page).
6. Configurable Workspace registration.
7. ACLs on `wm_customer_order` / `wm_rfs_order` / `wm_task` for the dispatcher role.

Test the update set in a sub-prod instance against a freshly imported copy of production `wm_customer_order` / `wm_rfs_order` / `wm_task` data before promoting.

---

## See also

- [03-api-contract.md](03-api-contract.md) — the JSON shapes these scripts produce
- [04-data-model.md](04-data-model.md) — table schema + the full paginated-matrix GlideScript
- [06-component-anatomy.md](06-component-anatomy.md) — how the front-end consumes these endpoints
