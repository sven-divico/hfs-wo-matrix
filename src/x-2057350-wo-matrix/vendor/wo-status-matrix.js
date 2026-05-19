/**
 * <wo-status-matrix> — Pivoted Work Order × Task status table
 *
 * Attributes:
 *   data-endpoint   URL prefix, e.g. /api/work-orders/matrix
 *   data-list       "legacy" | "attention"  (observed — refetches on change)
 *
 * Events dispatched on document (bubbles: true, composed: true):
 *   customer-order:open  {coUuid, coNumber}
 *   task:open            {coUuid, coNumber, taskName}
 */

/** Map task state string → CSS class name */
function stateClass(state) {
  switch (state) {
    case "Draft":              return "open";
    case "Pending Dispatch":
    case "Assigned":           return "pending";
    case "Scheduled":
    case "Work In Progress":   return "scheduled";
    case "Done":               return "done";
    case "Problem":            return "problem";
    case "not applicable":     return "na";
    default:                   return "open";
  }
}

/** Map construction_status → inline colour for the dot in that cell */
function constructionStatusColor(status) {
  switch (status) {
    case "Completed":                  return "var(--hfs-status-done, #10b981)";
    case "in progress":                return "var(--hfs-status-scheduled, #3b82f6)";
    case "Fallout":                    return "var(--hfs-status-problem, #dc2626)";
    case "Open":
    case "Cancellation in progress":
    default:                           return "var(--hfs-status-open, #9aa5b1)";
  }
}

/** Dispatch a bubbling, composed CustomEvent from `source`. The event walks up
 *  to whichever root hosts the components (document in the demonstrator,
 *  the NXF host's shadow root in the SNOW wrapper) where tab-strip listens. */
function dispatch(source, type, detail) {
  source.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
}

class WoStatusMatrix extends HTMLElement {
  static get observedAttributes() { return ["data-list"]; }

  connectedCallback() {
    this._shadow = this.attachShadow({ mode: "open" });
    this._shadow.innerHTML = `
      <style>
        :host {
          display: flex;
          flex-direction: column;
          height: 100%;
          font-family: var(--hfs-font, system-ui, sans-serif);
          font-size: 11px;
          color: var(--hfs-color-text, #1b2734);
          background: var(--hfs-color-sidebar, #fafbfc);
        }

        /* Scroll container for the table.
           min-height: 0 is mandatory — a flex column child defaults to
           min-height: auto (= content size) and would refuse to shrink
           below the table's natural height, suppressing vertical scroll. */
        .table-scroll {
          flex: 1;
          min-height: 0;
          overflow: auto;
          background: var(--hfs-color-surface, #fff);
        }

        .loading, .error {
          padding: 32px;
          color: var(--hfs-color-text-muted, #5b6770);
          font-size: 13px;
        }
        .error { color: var(--hfs-status-problem, #dc2626); }

        table {
          border-collapse: collapse;
          width: max-content;
          min-width: 100%;
        }
        th, td {
          padding: 9px 10px;                          /* a hair more vertical breathing room */
          /* No row or column borders — banded rows provide separation */
          white-space: nowrap;
          vertical-align: middle;
          text-align: left;
        }
        th {
          font-weight: 600;
          font-size: 11px;
          color: var(--hfs-color-text-muted, #5b6770);
          background: var(--hfs-color-bg, #f4f5f7);
          border-bottom: 1px solid var(--hfs-color-border, #d8dde3);
        }
        /* Sticky thead */
        thead th {
          position: sticky;
          top: 0;
          z-index: 2;
        }
        /* Sticky first five columns */
        td.sticky, th.sticky {
          position: sticky;
          z-index: 1;
        }
        thead th.sticky { z-index: 3; }
        td.sticky:nth-child(1), th.sticky:nth-child(1) { left: 0; }
        td.sticky:nth-child(2), th.sticky:nth-child(2) { left: 100px; }
        td.sticky:nth-child(3), th.sticky:nth-child(3) { left: 160px; }
        td.sticky:nth-child(4), th.sticky:nth-child(4) { left: 210px; }
        td.sticky:nth-child(5), th.sticky:nth-child(5) { left: 310px; }

        /* Banded rows — odd rows white, even rows light grey.
           Sticky cells inherit the row's band via per-row background. */
        tbody tr            td            { background: var(--hfs-color-surface, #fff); }
        tbody tr:nth-child(even) td       { background: var(--hfs-color-sidebar,  #fafbfc); }

        /* Hover — subtle teal tint, applied to every cell including sticky */
        tbody tr:hover td                 { background: #e8f5f1; }

        /* ORDER link */
        a.wo-link {
          color: var(--hfs-color-primary, #1f8476);
          text-decoration: none;
          font-weight: 600;
          cursor: pointer;
        }
        a.wo-link:hover { text-decoration: underline; }

        /* Construction-status dot + label */
        .cstatus {
          display: flex;
          align-items: center;
          gap: 5px;
        }
        .cstatus-dot {
          display: inline-block;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        /* Task-state dots */
        .dot {
          display: inline-block;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          vertical-align: middle;
          cursor: pointer;
        }
        .dot.open     { background: transparent; border: 1.5px solid var(--hfs-status-open, #9aa5b1); }
        .dot.pending  { background: var(--hfs-status-pending,  #f59e0b); border: none; }
        .dot.scheduled{ background: var(--hfs-status-scheduled,#3b82f6); border: none; }
        .dot.done     { background: var(--hfs-status-done,     #10b981); border: none; }
        .dot.problem  { background: var(--hfs-status-problem,  #dc2626); border: none; }
        .dot.na {
          display: inline;
          width: auto; height: auto;
          border-radius: 0;
          background: none; border: none;
          color: var(--hfs-color-text-muted, #5b6770);
          font-size: 12px;
          cursor: default;
        }
        .dot.na::before { content: "—"; }

        /* Pagination footer */
        .paginator {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px var(--hfs-space-md, 16px);
          border-top: 1px solid var(--hfs-color-border, #d8dde3);
          background: var(--hfs-color-bg, #f4f5f7);
          font-size: 12px;
          color: var(--hfs-color-text-muted, #5b6770);
        }
        .paginator .range { font-weight: 600; color: var(--hfs-color-text, #1b2734); }
        .paginator .grow  { flex: 1; }
        .paginator button {
          font-family: inherit;
          font-size: 12px;
          color: var(--hfs-color-text);
          background: var(--hfs-color-surface, #fff);
          border: 1px solid var(--hfs-color-border, #d8dde3);
          border-radius: 4px;
          padding: 5px 10px;
          cursor: pointer;
          transition: background 0.12s, border-color 0.12s, color 0.12s;
        }
        .paginator button:hover:not(:disabled) {
          color: var(--hfs-color-primary, #1f8476);
          border-color: var(--hfs-color-primary, #1f8476);
          background: var(--hfs-color-primary-bg, #e8f5f1);
        }
        .paginator button:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .paginator select {
          font-family: inherit;
          font-size: 12px;
          padding: 4px 6px;
          border: 1px solid var(--hfs-color-border);
          border-radius: 4px;
          background: var(--hfs-color-surface);
          cursor: pointer;
        }
      </style>
      <div class="table-scroll">
        <div class="loading">Loading…</div>
      </div>
      <div class="paginator" hidden>
        <span class="range" data-role="range"></span>
        <span class="grow"></span>
        <span>Rows:</span>
        <select data-role="limit">
          <option value="25">25</option>
          <option value="50">50</option>
          <option value="100">100</option>
          <option value="200">200</option>
        </select>
        <button data-role="prev" type="button">‹ Prev</button>
        <button data-role="next" type="button">Next ›</button>
      </div>
    `;

    // State
    this._limit  = 25;
    this._offset = 0;

    // Wire paginator controls
    const root = this._shadow;
    root.querySelector('[data-role="prev"]').addEventListener("click", () => {
      this._offset = Math.max(0, this._offset - this._limit);
      this._fetch();
    });
    root.querySelector('[data-role="next"]').addEventListener("click", () => {
      this._offset = this._offset + this._limit;
      this._fetch();
    });
    root.querySelector('[data-role="limit"]').addEventListener("change", e => {
      this._limit  = Number(e.target.value);
      this._offset = 0;
      this._fetch();
    });

    this._fetch();
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (name === "data-list" && oldVal !== null && oldVal !== newVal && this._shadow) {
      this._offset = 0;                                    // reset to first page on list switch
      this._fetch();
    }
  }

  async _fetch() {
    const endpoint = this.dataset.endpoint ?? "/api/work-orders/matrix";
    const list     = this.dataset.list     ?? "legacy";

    const scroll = this._shadow.querySelector(".table-scroll");
    scroll.innerHTML = "";
    const loading = document.createElement("div");
    loading.className = "loading";
    loading.textContent = "Loading…";
    scroll.appendChild(loading);

    const url = new URL(endpoint, location.origin);
    url.searchParams.set("list",   list);
    url.searchParams.set("limit",  String(this._limit));
    url.searchParams.set("offset", String(this._offset));

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      loading.remove();
      this._render(data);
      this._renderPaginator(data);
    } catch (err) {
      loading.className = "error";
      loading.textContent = `Failed to load matrix: ${err.message}`;
    }
  }

  _render({ columns, rows }) {
    const scroll = this._shadow.querySelector(".table-scroll");
    // Remove any previous table
    scroll.querySelector("table")?.remove();

    const table = document.createElement("table");

    // --- THEAD ---
    const thead = table.createTHead();
    const hRow  = thead.insertRow();

    // Five fixed headers — each sticky
    for (const [i, label] of ["CUSTOMER ORDER", "Status", "City", "Address", "Construction"].entries()) {
      const th = document.createElement("th");
      th.className = "sticky";
      th.textContent = label;
      hRow.appendChild(th);
    }

    // One header per column from API
    for (const col of columns) {
      const th = document.createElement("th");
      th.textContent = col.short;
      th.title = col.name; // hover tooltip = full German name
      hRow.appendChild(th);
    }

    // --- TBODY ---
    const tbody = table.createTBody();
    for (const row of rows) {
      const tr = tbody.insertRow();

      // 1. Customer Order cell — clickable link to merged CO tab
      const tdOrder = tr.insertCell();
      tdOrder.className = "sticky";
      const a = document.createElement("a");
      a.className = "wo-link";
      a.href = "#";
      a.textContent = row.number;
      a.addEventListener("click", e => {
        e.preventDefault();
        dispatch(this, "customer-order:open", {
          coUuid: row.uuid,
          coNumber: row.number,
          baseUrl: this.dataset.baseUrl ?? "",
        });
      });
      tdOrder.appendChild(a);

      // 2. Status code cell
      const tdStatus = tr.insertCell();
      tdStatus.className = "sticky";
      tdStatus.textContent = row.status_code ?? "";

      // 3. City cell
      const tdCity = tr.insertCell();
      tdCity.className = "sticky";
      tdCity.textContent = row.city ?? "";

      // 4. Address cell
      const tdAddr = tr.insertCell();
      tdAddr.className = "sticky";
      tdAddr.textContent = row.address ?? "";

      // 5. Construction status cell — coloured dot + text
      const tdConstr = tr.insertCell();
      tdConstr.className = "sticky";
      const cDiv = document.createElement("div");
      cDiv.className = "cstatus";
      const cDot = document.createElement("span");
      cDot.className = "cstatus-dot";
      cDot.style.background = constructionStatusColor(row.construction_status);
      cDiv.appendChild(cDot);
      cDiv.appendChild(document.createTextNode(row.construction_status ?? ""));
      tdConstr.appendChild(cDiv);

      // 6. One cell per task column
      for (const col of columns) {
        const state = row.tasks?.[col.name] ?? "not applicable";
        const cls   = stateClass(state);
        const td    = tr.insertCell();
        td.style.textAlign = "center";

        const dot = document.createElement("span");
        dot.className = `dot ${cls}`;
        dot.title = `${state} · updated ${row.tasks?.[col.name + "_updated"] ?? ""}`;

        // Build a richer title from the state itself
        const updated = row.sys_updated_on ?? "";
        dot.title = `${col.name}: ${state}`;

        if (cls !== "na") {
          dot.addEventListener("click", () => {
            dispatch(this, "task:open", {
              coUuid: row.uuid,
              coNumber: row.number,
              taskName: col.name,
              baseUrl: this.dataset.baseUrl ?? "",
            });
          });
        }

        td.appendChild(dot);
      }

      tbody.appendChild(tr);
    }

    scroll.appendChild(table);
  }

  _renderPaginator({ total = 0, offset = 0, limit = this._limit }) {
    const root = this._shadow;
    const paginator = root.querySelector(".paginator");
    if (total === 0) {
      paginator.hidden = true;
      return;
    }
    paginator.hidden = false;

    const first = offset + 1;
    const last  = Math.min(offset + limit, total);
    root.querySelector('[data-role="range"]').textContent = `${first}–${last} of ${total}`;

    const select = root.querySelector('[data-role="limit"]');
    if (Number(select.value) !== limit) select.value = String(limit);

    root.querySelector('[data-role="prev"]').disabled = offset === 0;
    root.querySelector('[data-role="next"]').disabled = last >= total;
  }
}

customElements.define("wo-status-matrix", WoStatusMatrix);
