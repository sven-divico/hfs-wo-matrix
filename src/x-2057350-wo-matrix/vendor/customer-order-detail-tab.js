/**
 * <customer-order-detail-tab> — Merged Customer Order page
 *
 * This is the business-facing "single order" view. It pulls the CO with both
 * child RFS orders and a flattened 17-task list.
 *
 * Attributes:
 *   data-co-uuid    e.g. "co-0010001"
 *   data-co-number  e.g. "CO-26-7T4K-NM9P"
 *   data-tab-pane   tab identifier for tab:close
 *
 * Events dispatched on document (bubbles: true, composed: true):
 *   rfs:open    {rfsId, rfsNumber, rfsType}
 *   task:open   {coUuid, coNumber, taskName}
 *   tab:close   {tabId}
 *   ui:toast    {message}    — caught by app.js to render a transient pill
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

function fmtDateTime(iso) {
  if (!iso) return "";
  // 2026-05-18T09:00:00Z -> 2026-05-18 09:00
  return iso.replace("T", " ").replace(/:\d{2}Z?$/, "").replace("Z", "");
}

class CustomerOrderDetailTab extends HTMLElement {
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

        /* Header */
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
          font-size: 18px;
          font-weight: 700;
          color: var(--hfs-color-primary, #1f8476);
          margin-bottom: 8px;
          letter-spacing: 0.02em;
        }
        .header-meta {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 6px 20px;
          font-size: 12px;
          color: var(--hfs-color-text-muted, #5b6770);
        }
        .header-meta span strong { color: var(--hfs-color-text, #1b2734); }
        .header-actions {
          display: flex;
          flex-direction: column;
          gap: 8px;
          align-items: flex-end;
          flex-shrink: 0;
        }
        .schedule-btn {
          background: var(--hfs-color-primary, #1f8476);
          color: #fff;
          border: 1px solid var(--hfs-color-primary, #1f8476);
          padding: 7px 14px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.12s;
        }
        .schedule-btn:hover:not(:disabled) { background: #166e62; }
        .schedule-btn:disabled {
          background: var(--hfs-color-bg, #f4f5f7);
          color: var(--hfs-color-text-muted, #5b6770);
          border-color: var(--hfs-color-border, #d8dde3);
          cursor: not-allowed;
        }
        .close-btn {
          background: none;
          border: 1px solid var(--hfs-color-border, #d8dde3);
          border-radius: 4px;
          width: 28px; height: 28px;
          cursor: pointer;
          font-size: 16px;
          color: var(--hfs-color-text-muted, #5b6770);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.12s, color 0.12s;
        }
        .close-btn:hover {
          background: #fef2f2;
          color: var(--hfs-status-problem, #dc2626);
          border-color: var(--hfs-status-problem, #dc2626);
        }

        /* RFS pills section */
        .section-title {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--hfs-color-text-muted, #5b6770);
          margin: 0 0 8px 2px;
        }
        .rfs-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
          margin-bottom: var(--hfs-space-md, 16px);
        }
        .rfs-card {
          background: var(--hfs-color-surface, #fff);
          border: 1px solid var(--hfs-color-border, #d8dde3);
          border-radius: 6px;
          padding: 12px 14px;
          cursor: pointer;
          transition: border-color 0.12s, box-shadow 0.12s;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .rfs-card:hover {
          border-color: var(--hfs-color-primary, #1f8476);
          box-shadow: 0 1px 4px rgba(31, 132, 118, 0.12);
        }
        .rfs-card .rfs-type {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: var(--hfs-color-text-muted, #5b6770);
          margin-bottom: 2px;
        }
        .rfs-card .rfs-number {
          font-size: 14px;
          font-weight: 600;
          color: var(--hfs-color-primary, #1f8476);
        }
        .rfs-card .rfs-arrow {
          color: var(--hfs-color-text-muted, #5b6770);
          font-size: 18px;
        }

        /* Task table */
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
        .rfs-tag {
          display: inline-block;
          font-size: 10px;
          font-weight: 700;
          padding: 1px 6px;
          border-radius: 8px;
          background: var(--hfs-color-bg, #f4f5f7);
          color: var(--hfs-color-text-muted, #5b6770);
        }
        .rfs-tag.connectivity {
          background: #fff4e5;
          color: #b46414;
        }

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
    const uuid    = this.dataset.coUuid;
    // Default `/api` matches the demonstrator. In SNOW, the wrapper passes
    // `/api/<scope>` (e.g. /api/x_2057350_wo_mat_0) so resources resolve under
    // the Scripted REST API scope. The demonstrator omits the attribute.
    const baseUrl = this.dataset.baseUrl ?? "/api";
    try {
      const res = await fetch(`${baseUrl}/customer-orders/${encodeURIComponent(uuid)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this._shadow.querySelector(".loading")?.remove();
      this._render(data);
    } catch (err) {
      const el = this._shadow.querySelector(".loading");
      if (el) { el.className = "error"; el.textContent = `Error: ${err.message}`; }
    }
  }

  _render(co) {
    const tabId = this.dataset.tabPane;

    // --- Header ---
    const card = document.createElement("div");
    card.className = "header-card";

    const info = document.createElement("div");
    info.className = "header-info";
    const h2 = document.createElement("h2");
    h2.textContent = co.number;
    info.appendChild(h2);
    const meta = document.createElement("div");
    meta.className = "header-meta";
    meta.innerHTML = `
      <span><strong>Customer:</strong> ${co.customer_name ?? "—"}</span>
      <span><strong>Phone:</strong> ${co.phone ?? "—"}</span>
      <span><strong>Address:</strong> ${co.address ?? "—"}, ${co.city ?? ""}</span>
      <span><strong>Order date:</strong> ${co.order_date ?? "—"}</span>
      <span><strong>Construction:</strong> ${co.construction_status ?? "—"}</span>
      <span><strong>Set:</strong> ${co.set_name ?? "—"}</span>
      <span><strong>Units:</strong> ${co.unit_count ?? "—"}</span>
      <span><strong>Appointment:</strong> ${co.scheduled_appointment ? fmtDateTime(co.scheduled_appointment) : "—"}</span>
    `;
    info.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "header-actions";
    const closeBtn = document.createElement("button");
    closeBtn.className = "close-btn";
    closeBtn.textContent = "×";
    closeBtn.title = "Close tab";
    closeBtn.addEventListener("click", () => dispatch(this, "tab:close", { tabId }));
    actions.appendChild(closeBtn);

    const schedBtn = document.createElement("button");
    schedBtn.className = "schedule-btn";
    if (co.scheduled_appointment) {
      schedBtn.textContent = "Appointment scheduled";
      schedBtn.disabled = true;
      schedBtn.title = `Appointment already scheduled for ${fmtDateTime(co.scheduled_appointment)}`;
    } else {
      schedBtn.textContent = "Schedule Appointment";
      schedBtn.addEventListener("click", () => {
        dispatch(this, "ui:toast", { message: "Demo only — would open the scheduling flow" });
      });
    }
    actions.appendChild(schedBtn);

    card.appendChild(info);
    card.appendChild(actions);
    this._shadow.appendChild(card);

    // --- RFS pills ---
    const rfsSectionTitle = document.createElement("div");
    rfsSectionTitle.className = "section-title";
    rfsSectionTitle.textContent = "RFS work orders";
    this._shadow.appendChild(rfsSectionTitle);

    const grid = document.createElement("div");
    grid.className = "rfs-grid";
    for (const slot of ["lma_order", "connectivity_order"]) {
      const r = co[slot];
      if (!r) continue;
      const c = document.createElement("div");
      c.className = "rfs-card";
      c.innerHTML = `
        <div>
          <div class="rfs-type">${r.rfs_type}</div>
          <div class="rfs-number">${r.number}</div>
        </div>
        <span class="rfs-arrow">›</span>
      `;
      c.addEventListener("click", () => {
        dispatch(this, "rfs:open", {
          rfsId: r.sys_id,
          rfsNumber: r.number,
          rfsType: r.rfs_type,
          baseUrl: this.dataset.baseUrl ?? "",
        });
      });
      grid.appendChild(c);
    }
    this._shadow.appendChild(grid);

    // --- Flattened 17-task table ---
    const taskTitle = document.createElement("div");
    taskTitle.className = "section-title";
    taskTitle.textContent = "Tasks";
    this._shadow.appendChild(taskTitle);

    const table = document.createElement("table");
    const thead = table.createTHead();
    const hRow = thead.insertRow();
    for (const label of ["Task", "RFS", "State", "Assignment Group", "Last Updated"]) {
      const th = document.createElement("th");
      th.textContent = label;
      hRow.appendChild(th);
    }
    const tbody = table.createTBody();
    for (const t of (co.tasks ?? [])) {
      const tr = tbody.insertRow();
      tr.title = `Click to open ${t.short_description}`;
      tr.addEventListener("click", () => {
        dispatch(this, "task:open", {
          coUuid: co.uuid,
          coNumber: co.number,
          taskName: t.short_description,
          baseUrl: this.dataset.baseUrl ?? "",
        });
      });
      tr.insertCell().textContent = t.short_description;
      const tdRfs = tr.insertCell();
      const tag = document.createElement("span");
      tag.className = `rfs-tag${t.rfs_type === "Connectivity" ? " connectivity" : ""}`;
      tag.textContent = t.rfs_type;
      tdRfs.appendChild(tag);

      const tdState = tr.insertCell();
      const dot = document.createElement("span");
      dot.className = `dot ${stateClass(t.state)}`;
      tdState.appendChild(dot);
      tdState.appendChild(document.createTextNode(t.state));
      tr.insertCell().textContent = t.assignment_group || "—";
      tr.insertCell().textContent = t.sys_updated_on || "—";
    }
    this._shadow.appendChild(table);
  }
}

customElements.define("customer-order-detail-tab", CustomerOrderDetailTab);
