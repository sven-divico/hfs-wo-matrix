import {createCustomElement} from '@servicenow/ui-core';
import snabbdom from '@servicenow/ui-renderer-snabbdom';

// Side-effect imports — each vendor file ends with customElements.define(...)
// which registers the element name globally. We don't import any symbols from
// them; we only need the registration to happen before our view renders.
import './vendor/tab-strip.js';
import './vendor/wo-status-matrix.js';
import './vendor/customer-order-detail-tab.js';
import './vendor/rfs-detail-tab.js';
import './vendor/task-detail-tab.js';

import styles from './styles.scss';

// Inline 14px SVG icon used in the permanent "Legacy Orders" tab — kept here
// (rather than in the tab-strip vendor file) so snabbdom can render it as part
// of the view tree.
const ListIcon = () => (
	<svg width="14" height="14" viewBox="0 0 24 24" fill="none"
	     stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
		<path d="M4 6h16M4 12h16M4 18h16"/>
	</svg>
);

// NXF has two view-arg shapes. Classic: `(state, helpers)` where `state` has
// `state.properties.endpoint` etc. Coeffects: a single bag `{state, properties,
// dispatch, updateState, host, …}` and the second arg is undefined. Decide
// based on the presence of arg2 so the component renders either way.
const view = (arg1, arg2) => {
	const coeffects  = arg2 === undefined;
	const properties = (coeffects ? arg1.properties : arg1.properties) || {};
	const stateBag   = coeffects ? (arg1.state || {})                 : arg1;
	const dispatch   = coeffects ? arg1.dispatch                      : arg2.dispatch;
	const {endpoint = '', baseUrl = ''} = properties;
	const {list = 'legacy'}             = stateBag;
	const setList = next => dispatch('HFS#SIDEBAR_LIST_CLICKED', {list: next});
	return (
		<div className="hfs-shell">
			<header className="topbar">
				<div className="brand">DG</div>
				<nav>
					<span>All</span>
					<span>Favorites</span>
					<span>History</span>
					<span>Workspaces</span>
				</nav>
				<div className="workspace-pill">HFS Workspace ★</div>
			</header>

			<div className="action-bar" role="toolbar" aria-label="Workspace actions">
				<span className="action-bar-hint">Last refreshed just now</span>
				<span className="action-bar-spacer"></span>
			</div>

			<tab-strip>
				<button slot="tab" data-tab-id="matrix" data-tab-type="list" className="active">
					<ListIcon/>
					<span className="tab-label">Legacy Orders</span>
				</button>
			</tab-strip>

			<main className="workspace">
				<aside className="sidebar">
					<div className="sidebar-section-title">My Lists</div>
					<button
						className={`list-item ${list === 'legacy' ? 'active' : ''}`}
						data-list="legacy"
						on-click={() => setList('legacy')}>
						Legacy Orders
					</button>
					<button
						className={`list-item ${list === 'attention' ? 'active' : ''}`}
						data-list="attention"
						on-click={() => setList('attention')}>
						Needs Attention
					</button>
				</aside>
				<section className="content">
					<wo-status-matrix
						id="matrix-view"
						data-endpoint={endpoint}
						data-base-url={baseUrl}
						data-list={list}
						data-tab-pane="matrix">
					</wo-status-matrix>
				</section>
			</main>
		</div>
	);
};

createCustomElement('x-2057350-wo-matrix', {
	renderer: {type: snabbdom},
	view,
	styles,
	initialState: {
		// Sidebar filter — mirrors the legacy/attention toggle from the demo's
		// app.js. Kept in component state (not properties) because UI Builder
		// admins don't need to bind it; sidebar clicks own it.
		list: 'legacy',
	},
	properties: {
		// Matrix endpoint URL. Defaults to the Scripted REST path on the PDI
		// scope (x_2057350_wo_mat_0). Production ports override per environment
		// via UI Builder, typically: /api/x_<companycode>_hfs/work-orders/matrix
		endpoint: {
			default: '/api/x_2057350_wo_mat_0/work-orders/matrix',
			schema:  {type: 'string'},
		},
		// Base URL prefix the detail tabs (customer-order / rfs / task) use to
		// build their own fetch URLs. Same scope as `endpoint` but without the
		// resource suffix. Default `/api` matches the demonstrator so this
		// component runs unchanged outside SNOW.
		baseUrl: {
			default: '/api/x_2057350_wo_mat_0',
			schema:  {type: 'string'},
		},
	},
	actionHandlers: {
		'HFS#SIDEBAR_LIST_CLICKED': ({action, updateState}) => {
			updateState({list: action.payload.list});
		},
	},
});
