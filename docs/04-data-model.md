# Data model — `wm_customer_order` / `wm_rfs_order` / `wm_task`

**Audience:** engineer replacing the showcase Scripted REST stubs in [`snow/scripted-rest/`](../snow/scripted-rest/) with real GlideRecord queries against the three production tables.

The wire contract documented in [03-api-contract.md](03-api-contract.md) is **independent of the backing tables** — same `{ columns, rows, total, offset, limit }` envelope, same German `short_description` keys in the per-row `tasks` map. This doc covers the table schema and the GlideRecord patterns to produce that payload from production data.

---

## 1. The schema

```
wm_customer_order             ← business-facing record; matrix rows are these
  uuid (PK)                     'co-NNNNNNN'
  number                        'CO-YY-XXXX-XXXX'  (or 'WONNNNN' in the showcase)
  customer_name, address, city, phone, order_date,
  scheduled_appointment, status_code, construction_status,
  unit_count, set_name
  │
  ├── wm_rfs_order  rfs_type=LMA            (16 tasks)
  └── wm_rfs_order  rfs_type=Connectivity   (1 task: ONT, plus the Connectivity-side build)
        sys_id (PK)              'rfs-NNNNNNN'
        number                   'RFSNNNNNNN'
        customer_order (FK)      → wm_customer_order.uuid
        rfs_type                 'LMA' | 'Connectivity'
        │
        └── wm_task
              sys_id (PK)         'wot-NNNNNNN'
              number              'WOTNNNNNNN'
              rfs_order (FK)      → wm_rfs_order.sys_id
              rfs_type            denormalised copy of parent.rfs_type ← see §3.2
              short_description, short_code, state, assignment_group, sys_updated_on
```

Three notable structural choices:

1. **`wm_customer_order` is the matrix row**. Pagination, counting, sorting, and `attention` filtering all happen at the Customer Order level — not at the RFS or task level.
2. **`wm_task.rfs_order`** is the join, not a direct `customer_order` link. The owning CO is reached transitively: `task → rfs → co`.
3. **The 17 canonical German `short_description` values are the join key** to the matrix's `tasks` map. Don't rename them on the way out; the component looks up `row.tasks[column.name]` and any other key shape silently renders every cell as em-dash.

---

## 2. The pivot

```sql
SELECT  co.*, t.short_description, t.state
FROM    wm_customer_order co
JOIN    wm_rfs_order      rfs ON rfs.customer_order = co.uuid
JOIN    wm_task           t   ON t.rfs_order        = rfs.sys_id
ORDER BY co.number DESC;
```

Group by `co.uuid`, fold `(short_description → state)` into `tasks`, return one row per CO. In GlideScript this is two queries per page (CO list, then a batched task query scoped to the page's CO IDs). See [§4](#4-glidescript-reference--paginated-matrix) for the implementation.

---

## 3. Optimization angles the 3-table model unlocks

The LMA + Connectivity split is a constraint imposed by TMF — but once it exists in the schema, two pieces of denormalised metadata become cheap and let the matrix pivot skip joins.

### 3.1 Filter by `rfs_type` without joining `wm_rfs_order`

The denormalised `wm_task.rfs_type` (exact copy of `wm_rfs_order.rfs_type`) is set on insert by a Business Rule on `wm_task` (recompute if the rare `rfs_order` reassignment ever happens). Payoff:

```sql
-- "Only the activation/Connectivity-side tasks across the whole list"
SELECT * FROM wm_task WHERE rfs_type = 'Connectivity';
```

No join to `wm_rfs_order` to filter by side. Matters when you add a sidebar filter like *"Only show orders with an open Connectivity task"* — the count and the page-scoped task fetch both stay one-table reads.

If you opt **not** to denormalise (defensible: violates 3NF, requires the Business Rule to stay consistent), the alternative is a two-step:

```javascript
// Step 1: pull rfs_ids for the side you want
var rfsGR = new GlideRecord('wm_rfs_order');
rfsGR.addQuery('rfs_type', 'Connectivity');
rfsGR.query();
var connRfsIds = [];
while (rfsGR.next()) connRfsIds.push(rfsGR.getUniqueValue());

// Step 2: scope tasks to those rfs_ids
taskGR.addEncodedQuery('rfs_orderIN' + connRfsIds.join(','));
```

Workable, but the denormalised flag turns 2 queries into 1.

### 3.2 A "has-Problem" flag at the Customer Order level

The `attention` filter — "Customer Orders with ≥ 1 Problem task" — can be a Business-Rule-maintained `wm_customer_order.has_problem_task` boolean:

- On `wm_task` insert/update: walk up `rfs_order → customer_order`, recompute the CO's `has_problem_task` based on whether *any* task on *either* RFS is `Problem`.
- On `wm_rfs_order` delete (rare): re-evaluate.

Payoff: the matrix's `attention` query becomes a single encoded query (`has_problem_task=true`) instead of the two-pass collect-then-filter shown in §4 below. Worth it as soon as the dataset exceeds a few hundred Customer Orders.

### 3.3 RFS-level rollup as a stepping stone

If maintaining the CO-level flag feels brittle, an intermediate option is `wm_rfs_order.has_problem_task` (cheap — only depends on the RFS's own tasks). The matrix attention query then becomes:

```sql
SELECT DISTINCT co.uuid
FROM   wm_customer_order co
JOIN   wm_rfs_order      rfs ON rfs.customer_order = co.uuid
WHERE  rfs.has_problem_task = true;
```

One join, no fold, no two-pass. Trades a tiny bit of duplication for a clean query path. Recommended starting point.

---

## 4. GlideScript reference — paginated matrix

Drop-in replacement for the body of [`snow/scripted-rest/matrix.js`](../snow/scripted-rest/matrix.js) once you're ready to switch from the showcase synthetic data to real GlideRecord queries. The structure mirrors the showcase stub; only the data source changes.

```javascript
(function process(request, response) {
    var util   = new x_company.HFSMatrixUtil();
    var list   = request.queryParams.list   || 'legacy';
    var limit  = util.clampInt(request.queryParams.limit,  25, 1, 200);
    var offset = util.clampInt(request.queryParams.offset, 0,  0);

    // --- attention filter: collect Customer Order uuids with ≥ 1 Problem task
    var filterEncodedQuery = '';
    if (list === 'attention') {
        // If you've added wm_rfs_order.has_problem_task (§3.3), this is one
        // encoded query: 'rfs_order.has_problem_task=true' on wm_customer_order
        // via dot-walk. The two-pass version below is the model-agnostic fallback.
        var problemTaskGR = new GlideRecord('wm_task');
        problemTaskGR.addQuery('state', 'Problem');
        problemTaskGR.query();
        var coIds = {};                       // dedup
        while (problemTaskGR.next()) {
            var rfsId = problemTaskGR.getValue('rfs_order');
            var rfsGR = new GlideRecord('wm_rfs_order');
            if (rfsGR.get(rfsId)) {
                coIds[rfsGR.getValue('customer_order')] = true;
            }
        }
        filterEncodedQuery = 'uuidIN' + Object.keys(coIds).join(',');
        // Empty list → 'uuidIN' (no value) matches no rows → total=0, rows=[].
    }

    // --- total
    var counter = new GlideAggregate('wm_customer_order');
    if (filterEncodedQuery) counter.addEncodedQuery(filterEncodedQuery);
    counter.addAggregate('COUNT');
    counter.query();
    var total = counter.next() ? parseInt(counter.getAggregate('COUNT'), 10) : 0;

    // --- page of Customer Orders
    var coGR = new GlideRecord('wm_customer_order');
    if (filterEncodedQuery) coGR.addEncodedQuery(filterEncodedQuery);
    coGR.orderByDesc('number');
    coGR.chooseWindow(offset, offset + limit, true);
    coGR.query();

    var orders   = [];
    var pageIds  = [];
    while (coGR.next()) {
        var row = util.serialiseCustomerOrder(coGR);
        row.tasks = {};
        orders.push(row);
        pageIds.push(coGR.getValue('uuid'));
    }

    // --- batched task fetch — one query, joined to wm_rfs_order via dot-walk
    if (pageIds.length > 0) {
        var taskGR = new GlideRecord('wm_task');
        taskGR.addEncodedQuery('rfs_order.customer_orderIN' + pageIds.join(','));
        taskGR.query();
        var tasksByCo = {};
        while (taskGR.next()) {
            // Two-hop dot-walk back to the CO uuid. For large pages, build a
            // (rfsId → coUuid) side-map once at the start of the page assembly
            // and look up from there instead — fewer per-row resolves.
            var coId = taskGR.getDisplayValue('rfs_order.customer_order') ||
                       taskGR.rfs_order.customer_order + '';
            var name = taskGR.getValue('short_description');     // canonical key
            (tasksByCo[coId] = tasksByCo[coId] || {})[name] = taskGR.getValue('state');
        }
        orders.forEach(function (o) { o.tasks = tasksByCo[o.uuid] || {}; });
    }

    response.setBody({
        total:   total,
        offset:  offset,
        limit:   limit,
        columns: util.getTaskColumns(),
        rows:    orders
    });
})(request, response);
```

GlideScript-specific notes:

- **Dot-walk on the encoded query** — `'rfs_order.customer_orderIN' + ids` traverses the reference fields. SNOW resolves this server-side; you don't write any join code. Same idea you'd use for `caller_id.department`-style queries.
- **Getting the FK value back** — `taskGR.getValue('rfs_order')` returns the RFS sys_id (one hop), but you want the Customer Order uuid (two hops). Either fetch the RFS in a side-map (`rfsId → coUuid`) once at the start of the page assembly, or use the dot-walked `getDisplayValue` as above. The side-map is more explicit and faster for large pages.
- **`chooseWindow` is the SNOW pagination primitive.** It's equivalent to SQL's `LIMIT/OFFSET`, applied server-side after `orderByDesc` for stable pages.
- **`GlideAggregate('COUNT')`** runs in the DB, not in the script — don't replace it with a manual count of records returned by the page query.

---

## 5. Drilldown endpoints

The three detail endpoints follow the same Scripted REST pattern as `/matrix`; only the join paths change.

| Endpoint | Joins | Returns |
|---|---|---|
| `GET /customer-orders/{uuid}` | `co → rfs → task` (both RFS) | The CO plus both nested RFS summaries plus the flattened task list |
| `GET /rfs-orders/{rfsId}` | `rfs → co` upward, `rfs → task` downward | The RFS, its tasks, and the parent Customer Order |
| `GET /customer-orders/{uuid}/tasks/{taskName}` | `co → rfs → task WHERE short_description=…` | A single task; resolves through both RFS so the caller never picks a side |

Reference Scripted REST scripts in [`snow/scripted-rest/`](../snow/scripted-rest/) implement these against synthetic data. Swap `for (var i = 0; ...)` synthesis for a GlideRecord on the appropriate table; the response shape is unchanged.

---

## 6. Migration considerations

If the SNOW instance already has data in a legacy `wm_order` / `wm_task` schema (the 2-table model the project started with):

- **Lift `wm_order` rows into `wm_customer_order` 1:1.** The legacy commercial fields (customer, address, status_code) carry over unchanged; `order_date`, `phone`, `scheduled_appointment` are new and start NULL until backfilled.
- **For each legacy `wm_order`, create two `wm_rfs_order` rows** — one LMA, one Connectivity. The RFS numbering scheme (`RFSNNNNNNN`) and Customer Order numbering (`CO-YY-XXXX-XXXX`) are independent of any legacy number; you're not renaming records, you're creating a layer above them.
- **Repoint `wm_task.rfs_order`** based on `short_description`: `ONT` → the Connectivity RFS, everything else → the LMA RFS. This is a deterministic rule for known task names; validate against edge-case task names not in the 17-task registry.

Field-rename mappings if you keep the legacy tables physically and rewrite via views:

| Legacy | New |
|---|---|
| `wm_order` | `wm_customer_order` |
| `wm_order.sys_id` | `wm_customer_order.uuid` |
| `wm_order.number` (`ORDNNNNNNN`) | `wm_customer_order.number` (`CO-YY-XXXX-XXXX`) — different format, plan customer-comms accordingly |
| `wm_task.work_order` | `wm_task.rfs_order` (transitively reaches the CO) |

---

## 7. Self-check

1. **Trace one paginated request.** `list=legacy`, `limit=10`, `offset=10`: how many DB round-trips, and what does each return?
2. **Where does the `attention` filter's "≥1 Problem task" condition cross schema layers?** Name the cheapest invariant you could maintain to make it a single-pass query.
3. **A bug report says `<task-detail-tab>` always shows "LMA RFS" in the subtitle even for the ONT task.** Where do you check first — the API, the denormalised `rfs_type` column, or the component? Justify your order.
4. **The seed generator routes `ONT` to the Connectivity RFS based on `short_description`.** What's the fragility here, and what would you add to make it self-healing if a new task name is added later?

---

## See also

- [03-api-contract.md](03-api-contract.md) — the wire shapes this data feeds
- [05-scripted-rest.md](05-scripted-rest.md) — Scripted REST patterns, pagination, ACLs
- [`snow/scripted-rest/`](../snow/scripted-rest/) — synthetic-data stubs that demonstrate the response shapes
