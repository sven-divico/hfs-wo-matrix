/**
 * <task-detail-tab> — Single-task detail pane
 *
 * Attributes:
 *   data-co-uuid    uuid of the parent Customer Order (e.g. "co-0010001")
 *   data-co-number  human-readable CO number (e.g. "CO-26-7T4K-NM9P")
 *   data-task-name  canonical German task name (e.g. "HV-S", "Genehmigungen")
 *   data-tab-pane   tab identifier for tab:close
 *
 * Events dispatched on document (bubbles: true, composed: true):
 *   tab:close  {tabId}   — when the × button is clicked
 *
 * The header title is built from attributes so no extra fetch is needed
 * beyond the single task API call.
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

function dispatch(source, type, detail) {
  source.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
}

class TaskDetailTab extends HTMLElement {
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
        .loading, .error {
          color: var(--hfs-color-text-muted, #5b6770);
          padding: 16px 0;
        }
        .error { color: var(--hfs-status-problem, #dc2626); }

        /* Header card */
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
        .header-info .subtitle {
          font-size: 12px;
          color: var(--hfs-color-text-muted, #5b6770);
        }
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

        /* Detail card */
        .detail-card {
          background: var(--hfs-color-surface, #fff);
          border: 1px solid var(--hfs-color-border, #d8dde3);
          border-radius: 6px;
          overflow: hidden;
        }
        .detail-row {
          display: flex;
          border-bottom: 1px solid var(--hfs-color-border, #d8dde3);
          padding: 0;
        }
        .detail-row:last-child { border-bottom: none; }
        .detail-label {
          width: 160px;
          flex-shrink: 0;
          padding: 10px 12px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--hfs-color-text-muted, #5b6770);
          background: var(--hfs-color-bg, #f4f5f7);
          border-right: 1px solid var(--hfs-color-border, #d8dde3);
        }
        .detail-value {
          padding: 10px 12px;
          font-size: 13px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        /* State dots */
        .dot {
          display: inline-block;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          vertical-align: middle;
          flex-shrink: 0;
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
        }
        .dot.na::before { content: "—"; }
      </style>
      <div class="loading">Loading…</div>
    `;

    this._load();
  }

  async _load() {
    const coUuid   = this.dataset.coUuid;
    const taskName = this.dataset.taskName;
    const coNumber = this.dataset.coNumber;
    const tabId    = this.dataset.tabPane;
    const baseUrl  = this.dataset.baseUrl ?? "/api";

    try {
      const url = `${baseUrl}/customer-orders/${encodeURIComponent(coUuid)}/tasks/${encodeURIComponent(taskName)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const task = await res.json();

      this._shadow.querySelector(".loading")?.remove();
      this._render(task, { coUuid, coNumber, taskName, tabId });
    } catch (err) {
      const el = this._shadow.querySelector(".loading");
      if (el) { el.className = "error"; el.textContent = `Error: ${err.message}`; }
    }
  }

  _render(task, { coUuid, coNumber, taskName, tabId }) {
    // --- Header card ---
    const card = document.createElement("div");
    card.className = "header-card";

    const info = document.createElement("div");
    info.className = "header-info";
    info.innerHTML = `
      <h2>${taskName}</h2>
      <div class="subtitle">Customer Order <strong>${coNumber}</strong>${task.rfs_type ? ` &nbsp;·&nbsp; <span style="font-size:11px;">${task.rfs_type} RFS</span>` : ""}</div>
    `;

    const closeBtn = document.createElement("button");
    closeBtn.className = "close-btn";
    closeBtn.textContent = "×";
    closeBtn.title = "Close tab";
    closeBtn.addEventListener("click", () => {
      dispatch(this, "tab:close", { tabId });
    });

    card.appendChild(info);
    card.appendChild(closeBtn);
    this._shadow.appendChild(card);

    // --- Detail rows ---
    const detailCard = document.createElement("div");
    detailCard.className = "detail-card";

    // State row (with coloured dot)
    const stateRow = this._mkRow("State");
    const dot = document.createElement("span");
    dot.className = `dot ${stateClass(task.state)}`;
    stateRow.querySelector(".detail-value").appendChild(dot);
    stateRow.querySelector(".detail-value").appendChild(document.createTextNode(task.state));
    detailCard.appendChild(stateRow);

    // Task number
    const numRow = this._mkRow("Task Number");
    numRow.querySelector(".detail-value").textContent = task.number ?? "—";
    detailCard.appendChild(numRow);

    // Assignment group
    const groupRow = this._mkRow("Assignment Group");
    groupRow.querySelector(".detail-value").textContent = task.assignment_group ?? "—";
    detailCard.appendChild(groupRow);

    // Last updated
    const updRow = this._mkRow("Last Updated");
    updRow.querySelector(".detail-value").textContent = task.sys_updated_on ?? "—";
    detailCard.appendChild(updRow);

    this._shadow.appendChild(detailCard);
  }

  _mkRow(label) {
    const row = document.createElement("div");
    row.className = "detail-row";
    row.innerHTML = `
      <div class="detail-label">${label}</div>
      <div class="detail-value"></div>
    `;
    return row;
  }
}

customElements.define("task-detail-tab", TaskDetailTab);
