/**
 * <rfs-detail-tab> — RFS Work Order detail pane
 *
 * Attributes:
 *   data-rfs-id      sys_id of the RFS work order (e.g. "rfs-0020001")
 *   data-rfs-number  human-readable number (e.g. "RFS0020001")
 *   data-tab-pane    tab identifier for tab:close
 *
 * Events dispatched on document (bubbles: true, composed: true):
 *   task:open               {coUuid, coNumber, taskName}
 *   customer-order:open     {coUuid, coNumber}
 *   tab:close               {tabId}
 */

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

function dispatch(source, type, detail) {
  source.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
}

class RfsDetailTab extends HTMLElement {
  connectedCallback() {
    this._shadow = this.attachShadow({ mode: "open" });
    this._shadow.innerHTML = `
      <style>
        :host {
          display: block;
          padding: var(--hfs-space-md, 16px);
          font-family: var(--hfs-font, system-ui, sans-serif);
          font-size: 13px;
          color: var(--hfs-color-text, #1b2734);
          height: 100%;
          overflow: auto;
          box-sizing: border-box;
        }
        .loading, .error { color: var(--hfs-color-text-muted, #5b6770); padding: 16px 0; }
        .error { color: var(--hfs-status-problem, #dc2626); }

        .header-card {
          background: var(--hfs-color-surface, #fff);
          border: 1px solid var(--hfs-color-border, #d8dde3);
          border-radius: 6px;
          padding: var(--hfs-space-md, 16px);
          margin-bottom: var(--hfs-space-md, 16px);
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: var(--hfs-space-md, 16px);
        }
        .header-info h2 {
          font-size: 16px;
          font-weight: 700;
          color: var(--hfs-color-primary, #1f8476);
          margin-bottom: 4px;
        }
        .breadcrumb {
          font-size: 12px;
          color: var(--hfs-color-text-muted, #5b6770);
          margin-bottom: 8px;
        }
        .breadcrumb a {
          color: var(--hfs-color-primary, #1f8476);
          text-decoration: none;
          font-weight: 600;
          cursor: pointer;
        }
        .breadcrumb a:hover { text-decoration: underline; }
        .rfs-type-pill {
          display: inline-block;
          font-size: 11px;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 10px;
          background: var(--hfs-color-primary-bg, #e8f5f1);
          color: var(--hfs-color-primary, #1f8476);
          margin-left: 8px;
          vertical-align: middle;
        }
        .header-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 8px 20px;
          font-size: 12px;
          color: var(--hfs-color-text-muted, #5b6770);
        }
        .header-meta span strong { color: var(--hfs-color-text, #1b2734); }
        .close-btn {
          background: none;
          border: 1px solid var(--hfs-color-border, #d8dde3);
          border-radius: 4px;
          width: 28px;
          height: 28px;
          cursor: pointer;
          font-size: 16px;
          color: var(--hfs-color-text-muted, #5b6770);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: background 0.12s, color 0.12s;
        }
        .close-btn:hover {
          background: #fef2f2;
          color: var(--hfs-status-problem, #dc2626);
          border-color: var(--hfs-status-problem, #dc2626);
        }

        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
          background: var(--hfs-color-surface, #fff);
          border: 1px solid var(--hfs-color-border, #d8dde3);
          border-radius: 6px;
          overflow: hidden;
        }
        th, td {
          padding: 7px 10px;
          border-bottom: 1px solid var(--hfs-color-border, #d8dde3);
          text-align: left;
          vertical-align: middle;
        }
        th {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: var(--hfs-color-text-muted, #5b6770);
          background: var(--hfs-color-bg, #f4f5f7);
        }
        tbody tr { cursor: pointer; transition: background 0.1s; }
        tbody tr:hover td { background: #f0f9f7; }
        tbody tr:last-child td { border-bottom: none; }

        .dot {
          display: inline-block;
          width: 9px; height: 9px;
          border-radius: 50%;
          vertical-align: middle;
          margin-right: 6px;
        }
        .dot.open      { background: transparent; border: 1.5px solid var(--hfs-status-open, #9aa5b1); }
        .dot.pending   { background: var(--hfs-status-pending,   #f59e0b); border: none; }
        .dot.scheduled { background: var(--hfs-status-scheduled, #3b82f6); border: none; }
        .dot.done      { background: var(--hfs-status-done,      #10b981); border: none; }
        .dot.problem   { background: var(--hfs-status-problem,   #dc2626); border: none; }
        .dot.na {
          display: inline;
          width: auto; height: auto;
          border-radius: 0;
          background: none; border: none;
          color: var(--hfs-color-text-muted, #5b6770);
          margin-right: 4px;
        }
        .dot.na::before { content: "—"; }
      </style>
      <div class="loading">Loading…</div>
    `;
    this._load();
  }

  async _load() {
    const rfsId   = this.dataset.rfsId;
    const baseUrl = this.dataset.baseUrl ?? "/api";
    try {
      // SNOW enforces snake_case API IDs on scoped apps — `rfs_orders`, not
      // `rfs-orders`. URL paths follow the same convention end-to-end.
      const res = await fetch(`${baseUrl}/rfs_orders/${encodeURIComponent(rfsId)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json();
      // Unwrap SNOW's `{result: ...}` envelope; pass through flat payloads
      // unchanged so the demonstrator and local stub keep working.
      const data = raw && raw.result !== undefined ? raw.result : raw;
      this._shadow.querySelector(".loading")?.remove();
      this._render(data);
    } catch (err) {
      const el = this._shadow.querySelector(".loading");
      if (el) { el.className = "error"; el.textContent = `Error: ${err.message}`; }
    }
  }

  _render(data) {
    const tabId = this.dataset.tabPane;
    const co = data.customer_order ?? {};

    const card = document.createElement("div");
    card.className = "header-card";

    const info = document.createElement("div");
    info.className = "header-info";

    const breadcrumb = document.createElement("div");
    breadcrumb.className = "breadcrumb";
    const coLink = document.createElement("a");
    coLink.textContent = `Customer Order ${co.number ?? ""}`;
    coLink.addEventListener("click", e => {
      e.preventDefault();
      dispatch(this, "customer-order:open", {
        coUuid: co.uuid,
        coNumber: co.number,
        baseUrl: this.dataset.baseUrl ?? "",
      });
    });
    breadcrumb.appendChild(document.createTextNode("← "));
    breadcrumb.appendChild(coLink);
    info.appendChild(breadcrumb);

    const h2 = document.createElement("h2");
    h2.textContent = data.number;
    const pill = document.createElement("span");
    pill.className = "rfs-type-pill";
    pill.textContent = data.rfs_type;
    h2.appendChild(pill);
    info.appendChild(h2);

    const meta = document.createElement("div");
    meta.className = "header-meta";
    meta.innerHTML = `
      <span><strong>Customer:</strong> ${co.customer_name ?? "—"}</span>
      <span><strong>Address:</strong> ${co.address ?? "—"}, ${co.city ?? ""}</span>
      <span><strong>Construction:</strong> ${co.construction_status ?? "—"}</span>
      <span><strong>Set:</strong> ${co.set_name ?? "—"}</span>
    `;
    info.appendChild(meta);

    const closeBtn = document.createElement("button");
    closeBtn.className = "close-btn";
    closeBtn.textContent = "×";
    closeBtn.title = "Close tab";
    closeBtn.addEventListener("click", () => dispatch(this, "tab:close", { tabId }));

    card.appendChild(info);
    card.appendChild(closeBtn);
    this._shadow.appendChild(card);

    const table = document.createElement("table");
    const thead = table.createTHead();
    const hRow = thead.insertRow();
    for (const label of ["Task", "State", "Assignment Group", "Last Updated"]) {
      const th = document.createElement("th");
      th.textContent = label;
      hRow.appendChild(th);
    }
    const tbody = table.createTBody();
    for (const task of (data.tasks ?? [])) {
      const tr = tbody.insertRow();
      tr.title = `Click to open ${task.short_description}`;
      tr.addEventListener("click", () => {
        dispatch(this, "task:open", {
          coUuid: co.uuid,
          coNumber: co.number,
          taskName: task.short_description,
          baseUrl: this.dataset.baseUrl ?? "",
        });
      });
      tr.insertCell().textContent = task.short_description;
      const tdState = tr.insertCell();
      const dot = document.createElement("span");
      dot.className = `dot ${stateClass(task.state)}`;
      tdState.appendChild(dot);
      tdState.appendChild(document.createTextNode(task.state));
      tr.insertCell().textContent = task.assignment_group || "—";
      tr.insertCell().textContent = task.sys_updated_on || "—";
    }
    this._shadow.appendChild(table);
  }
}

customElements.define("rfs-detail-tab", RfsDetailTab);
