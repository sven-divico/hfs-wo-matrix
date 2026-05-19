/**
 * <tab-strip> — Workspace tab bar
 *
 * Listens on document for:
 *   customer-order:open  {coUuid, coNumber}              → opens / activates a customer-order-detail-tab pane
 *   rfs:open             {rfsId, rfsNumber, rfsType}     → opens / activates an rfs-detail-tab pane
 *   task:open            {coUuid, coNumber, taskName}    → opens / activates a task-detail-tab pane
 *   tab:close            {tabId}                         → removes the tab + pane, falls back to matrix
 *
 * The "matrix" tab (data-tab-id="matrix") is permanent / non-closeable.
 * Tab buttons are slotted into light DOM so they pick up ::slotted styles.
 */
class TabStrip extends HTMLElement {
  constructor() {
    super();
    this.tabs = new Map(); // tabId -> { button, pane }
  }

  connectedCallback() {
    // Hosted inside an NXF component, the strip is rendered into the host's
    // shadow root rather than `document`. Use `getRootNode()` for DOM lookups
    // so the strip works in both the demonstrator and the SNOW wrapper.
    this._root = this.getRootNode();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          background: var(--hfs-color-surface, #fff);
          border-bottom: 1px solid var(--hfs-color-border, #d8dde3);
          flex-shrink: 0;
        }
        nav {
          display: flex;
          align-items: stretch;                        /* tabs fill the strip height */
          padding: 0 var(--hfs-space-md, 16px);
          gap: 4px;
          height: var(--hfs-tabstrip-h, 40px);
          overflow-x: auto;
          scrollbar-width: none;
        }
        nav::-webkit-scrollbar { display: none; }

        /* Per-type accent and SVG coloring live in app.css (the buttons
           are in light DOM as slotted children, so app.css targets them
           directly and --tab-accent inherits into this shadow tree for
           the active-tab box-shadow below). */

        ::slotted(button[slot="tab"]) {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: transparent;
          border: 1px solid transparent;              /* reserved space so active state doesn't shift */
          border-bottom: none;
          border-radius: 4px 4px 0 0;
          padding: 0 28px;                             /* vertical filled by align-items: stretch */
          margin-bottom: -1px;                        /* overlap the host border */
          cursor: pointer;
          font-family: var(--hfs-font, system-ui, sans-serif);
          font-size: 13px;
          color: var(--hfs-color-text-muted, #5b6770);
          white-space: nowrap;
          flex-shrink: 0;
          transition: background 0.12s, color 0.12s, border-color 0.12s;
        }
        ::slotted(button[slot="tab"]:hover) {
          color: var(--tab-accent, var(--hfs-color-primary, #1f8476));
          background: rgba(31, 132, 118, 0.04);
        }
        /* Active tab — register-card look: distinctly darker bg, top accent
           in the tab-type colour, subtle shadow that lifts it off the strip;
           -1px bottom margin lets the host's bottom border pass BEHIND it
           so it reads as one continuous surface with the page below. */
        ::slotted(button[slot="tab"].active) {
          color: var(--hfs-color-text, #1b2734);
          background: var(--hfs-color-tab-active, #dde3eb);
          border-color: var(--hfs-color-border, #d8dde3);
          font-weight: 600;
          box-shadow:
            inset 0 3px 0 0 var(--tab-accent, var(--hfs-color-primary, #1f8476)),
            0 -1px 2px rgba(27, 39, 52, 0.04);
        }
      </style>
      <nav><slot name="tab"></slot></nav>
    `;

    // Listen on the root we share with the matrix and detail panes. In the
    // demonstrator that root is `document`; inside the NXF wrapper it is the
    // host's shadow root. Events dispatched there with `composed: true` reach
    // us in either case.
    this._root.addEventListener("customer-order:open", e => this.openCustomerOrderTab(e.detail));
    this._root.addEventListener("rfs:open",            e => this.openRfsTab(e.detail));
    this._root.addEventListener("task:open",           e => this.openTaskTab(e.detail));
    this._root.addEventListener("tab:close",           e => this.closeTab(e.detail.tabId));

    // Delegate clicks on the slotted tab buttons (they are light DOM, so we
    // listen on `this` rather than shadowRoot)
    this.addEventListener("click", e => {
      const btn = e.target.closest("button[data-tab-id]");
      if (btn) this.activate(btn.dataset.tabId);
    });
  }

  /**
   * Show the pane for tabId, hide all others.
   * Also marks the matching slot button as .active.
   */
  activate(tabId) {
    // Update tab button classes (light DOM)
    for (const btn of this.querySelectorAll("button[slot='tab']")) {
      btn.classList.toggle("active", btn.dataset.tabId === tabId);
    }
    // Show/hide panes — panes are in .content in light DOM
    this._root.querySelectorAll("[data-tab-pane]").forEach(pane => {
      pane.hidden = pane.dataset.tabPane !== tabId;
    });
  }

  closeTab(tabId) {
    if (tabId === "matrix") return; // permanent tab
    const t = this.tabs.get(tabId);
    if (!t) return;
    t.button.remove();
    t.pane.remove();
    this.tabs.delete(tabId);
    this.activate("matrix"); // fall back to matrix
  }

  openCustomerOrderTab({ coUuid, coNumber, baseUrl = "" }) {
    const id = `co-${coUuid}`;
    if (!this.tabs.has(id)) {
      const button = this._mkTabButton(id, coNumber, "co");
      const pane   = document.createElement("customer-order-detail-tab");
      pane.setAttribute("data-co-uuid",   coUuid);
      pane.setAttribute("data-co-number", coNumber);
      pane.setAttribute("data-tab-pane",  id);
      if (baseUrl) pane.setAttribute("data-base-url", baseUrl);
      this._root.querySelector(".content").appendChild(pane);
      this.tabs.set(id, { button, pane });
    }
    this.activate(id);
  }

  openRfsTab({ rfsId, rfsNumber, rfsType, baseUrl = "" }) {
    const id = `rfs-${rfsId}`;
    if (!this.tabs.has(id)) {
      const label = `${rfsNumber} · ${rfsType}`;
      const button = this._mkTabButton(id, label, "wo");
      const pane   = document.createElement("rfs-detail-tab");
      pane.setAttribute("data-rfs-id",     rfsId);
      pane.setAttribute("data-rfs-number", rfsNumber);
      pane.setAttribute("data-tab-pane",   id);
      if (baseUrl) pane.setAttribute("data-base-url", baseUrl);
      this._root.querySelector(".content").appendChild(pane);
      this.tabs.set(id, { button, pane });
    }
    this.activate(id);
  }

  openTaskTab({ coUuid, coNumber, taskName, baseUrl = "" }) {
    const safeName = taskName.replace(/[^a-zA-Z0-9\-_]/g, "_");
    const id = `task-${coUuid}-${safeName}`;
    if (!this.tabs.has(id)) {
      const button = this._mkTabButton(id, `${coNumber} · ${taskName}`, "task");
      const pane   = document.createElement("task-detail-tab");
      pane.setAttribute("data-co-uuid",   coUuid);
      pane.setAttribute("data-co-number", coNumber);
      pane.setAttribute("data-task-name", taskName);
      pane.setAttribute("data-tab-pane",  id);
      if (baseUrl) pane.setAttribute("data-base-url", baseUrl);
      this._root.querySelector(".content").appendChild(pane);
      this.tabs.set(id, { button, pane });
    }
    this.activate(id);
  }

  _mkTabButton(tabId, label, type = "list") {
    const b = document.createElement("button");
    b.slot = "tab";
    b.dataset.tabId   = tabId;
    b.dataset.tabType = type;
    b.innerHTML = `
      ${TAB_ICON[type] ?? TAB_ICON.list}
      <span class="tab-label"></span>
      <span class="tab-close" role="button" aria-label="Close tab" title="Close tab">${TAB_ICON.close}</span>
    `;
    b.querySelector(".tab-label").textContent = label;

    // Close icon: stop the click from also activating the tab. Dispatch from
    // `this` (the strip itself) so the event bubbles up to whatever root we
    // share with the matrix and detail panes — works in light DOM and under
    // an NXF shadow root.
    b.querySelector(".tab-close").addEventListener("click", e => {
      e.stopPropagation();
      this.dispatchEvent(new CustomEvent("tab:close", {
        detail: { tabId }, bubbles: true, composed: true,
      }));
    });

    this.appendChild(b);
    return b;
  }
}

/** Inline 14px SVG icons — colored via currentColor so they pick up
 *  the per-type accent on hover/active and muted text otherwise. */
const TAB_ICON = {
  // 3 horizontal lines — list / grid metaphor
  list: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>`,
  // Clipboard outline — a Work Order / RFS record
  wo:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4h6v3H9z"/><path d="M9 11h6M9 15h4"/></svg>`,
  // User badge — a Customer Order record (business-facing)
  co:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6"/></svg>`,
  // Check-square — a Task / action item
  task: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 12l3 3 5-6"/></svg>`,
  // ✕ close icon used inside each closeable tab
  close: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
};

customElements.define("tab-strip", TabStrip);
