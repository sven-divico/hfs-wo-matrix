// Stub data + fetch interceptor for `snc ui-component develop`.
//
// The wrapper component points its `endpoint` and `base-url` at production
// Scripted REST paths by default; the example mount overrides them to a
// `/stub/wo-matrix/...` namespace handled here. `installStub()` overrides
// `window.fetch` once and only intercepts requests inside that namespace —
// everything else passes through to the real fetch. Production builds never
// load this file.

const STUB_PREFIX = "/stub/wo-matrix";

// Canonical task column list — copied from public/task-columns.json so the
// stub renders identically to the demonstrator.
const COLUMNS = [
	{name: "HV-S",              short: "HV",   label: "Standard House Visit",      sequence:  1},
	{name: "UV-S",              short: "UV",   label: "Standard Unit Visit",       sequence:  2},
	{name: "HV-NE4",            short: "HV4",  label: "House Visit NE4",           sequence:  3},
	{name: "UV-NE4",            short: "UV4",  label: "Unit Visit NE4",            sequence:  4},
	{name: "GIS Planung",       short: "GP",   label: "GIS Planning - NAS",        sequence:  5},
	{name: "Fremdleitungsplan", short: "LLD",  label: "Utility Lines Plan",        sequence:  6},
	{name: "Genehmigungen",     short: "PM",   label: "Permits (VRAO / Aufbruch)", sequence:  7},
	{name: "Tiefbau",           short: "CV",   label: "Civil Works",               sequence:  8},
	{name: "Spleißen",          short: "SP",   label: "Splicing",                  sequence:  9},
	{name: "Einblasen",         short: "BF",   label: "Blow-in Fiber",             sequence: 10},
	{name: "Gartenbohrung",     short: "GD",   label: "Garden Drilling",           sequence: 11},
	{name: "Hauseinführung",    short: "WB",   label: "Wall Breakthrough",         sequence: 12},
	{name: "HÜP",               short: "HÜP",  label: "Install HÜP",               sequence: 13},
	{name: "Leitungsweg NE4",   short: "CW4",  label: "Cable Way NE4",             sequence: 14},
	{name: "GFTA",              short: "GFTA", label: "Install GFTA",              sequence: 15},
	{name: "ONT",               short: "ONT",  label: "Install ONT",               sequence: 16},
	{name: "Patch",             short: "PCH",  label: "Patch",                     sequence: 17},
];

const CITIES = [
	["Düsseldorf",      "Königsallee"],
	["Köln",            "Hohe Straße"],
	["Bonn",            "Adenauerallee"],
	["Aachen",          "Pontstraße"],
	["Krefeld",         "Rheinstraße"],
	["Mönchengladbach", "Hindenburgstraße"],
	["Wuppertal",       "Bahnhofstraße"],
	["Essen",           "Limbecker Straße"],
	["Duisburg",        "Königstraße"],
	["Münster",         "Prinzipalmarkt"],
];

const CONSTRUCTION_STATES = [
	"Open", "in progress", "in progress", "Completed", "Fallout",
	"in progress", "Completed", "Open", "Cancellation in progress", "in progress",
];

const STATUS_CODES = ["In Progress", "Pending", "Open", "Done"];

// Synthesise a per-row task map. Earlier columns lean "Done"/"Scheduled",
// later columns lean "Draft"/"not applicable" so the visual gradient reads
// as plausible progress.
function buildTasks(rowIdx) {
	const cycle = ["Done", "Done", "Work In Progress", "Scheduled", "Assigned", "Pending Dispatch", "Draft", "not applicable"];
	const tasks = {};
	for (let i = 0; i < COLUMNS.length; i++) {
		// Shift the progress band by rowIdx so each row looks different.
		const idx = Math.min(cycle.length - 1, Math.max(0, i - rowIdx % 6));
		// Sprinkle a few problems for visual variety.
		const state = (rowIdx + i) % 17 === 5 ? "Problem" : cycle[idx];
		tasks[COLUMNS[i].name] = state;
	}
	return tasks;
}

function buildRow(idx) {
	const [city, street] = CITIES[idx % CITIES.length];
	const houseNo = ((idx * 7) % 99) + 1;
	return {
		uuid:                `co-${String(idx).padStart(3, "0")}`,
		number:              `WO${String(idx + 10001)}`,
		status_code:         STATUS_CODES[idx % STATUS_CODES.length],
		city,
		address:             `${street} ${houseNo}`,
		construction_status: CONSTRUCTION_STATES[idx % CONSTRUCTION_STATES.length],
		sys_updated_on:      "2026-05-18 11:42:00",
		tasks:               buildTasks(idx),
	};
}

const ALL_ROWS_LEGACY    = Array.from({length: 27}, (_, i) => buildRow(i));
// "Needs Attention" — a subset of the legacy list filtered to rows that
// have any Problem state or are stuck in early tasks.
const ALL_ROWS_ATTENTION = ALL_ROWS_LEGACY.filter(r =>
	Object.values(r.tasks).includes("Problem") ||
	r.construction_status === "Fallout"
);

function paginate(rows, limit, offset) {
	return {
		columns: COLUMNS,
		rows:    rows.slice(offset, offset + limit),
		total:   rows.length,
		offset,
		limit,
	};
}

// Single canned customer order — echoes the uuid/number the matrix sent so the
// detail header reads as the row you clicked. Two RFS pills + 17 tasks below.
function buildCustomerOrder(uuid) {
	const idx    = parseInt(uuid.replace(/[^0-9]/g, ""), 10) || 0;
	const number = `WO${String(idx + 10001)}`;
	const [city, street] = CITIES[idx % CITIES.length];
	const tasks  = COLUMNS.map((c, i) => ({
		short_description: c.name,
		state:             buildTasks(idx)[c.name],
		number:            `TASK${String(idx * 100 + i).padStart(6, "0")}`,
		assignment_group:  i < 4 ? "Field Services" : i < 12 ? "Civils" : "Splicing",
		sys_updated_on:    "2026-05-18 09:30:00",
		rfs_type:          i < 7 ? "LMA" : "Connectivity",
	}));
	return {
		uuid, number,
		customer_name:        "Maria Schmidt",
		phone:                "+49 211 555 1234",
		address:              `${street} ${((idx * 7) % 99) + 1}`,
		city,
		order_date:           "2026-04-12",
		construction_status:  CONSTRUCTION_STATES[idx % CONSTRUCTION_STATES.length],
		set_name:             "FTTH Standard",
		unit_count:           1,
		scheduled_appointment: null,
		lma_order:            {sys_id: `rfs-${idx}-lma`, number: `RFS${idx + 20001}`, rfs_type: "LMA"},
		connectivity_order:   {sys_id: `rfs-${idx}-con`, number: `RFS${idx + 30001}`, rfs_type: "Connectivity"},
		tasks,
	};
}

function buildRfsOrder(rfsId) {
	const isLma   = rfsId.endsWith("-lma");
	const rfsType = isLma ? "LMA" : "Connectivity";
	const co      = buildCustomerOrder("co-001");
	const tasks   = COLUMNS
		.filter((_, i) => isLma ? i < 7 : i >= 7)
		.map((c, i) => ({
			short_description: c.name,
			state:             "Done",
			assignment_group:  isLma ? "Field Services" : "Splicing",
			sys_updated_on:    "2026-05-18 09:30:00",
		}));
	return {
		sys_id:         rfsId,
		number:         `RFS${rfsId.includes("lma") ? 20001 : 30001}`,
		rfs_type:       rfsType,
		customer_order: co,
		tasks,
	};
}

function buildTaskDetail(coUuid, taskName) {
	return {
		number:           `TASK${coUuid.replace(/[^0-9]/g, "") || "0"}000`,
		short_description: taskName,
		state:            "Work In Progress",
		assignment_group: "Field Services",
		sys_updated_on:   "2026-05-18 11:42:00",
		rfs_type:         COLUMNS.findIndex(c => c.name === taskName) < 7 ? "LMA" : "Connectivity",
	};
}

function jsonResponse(payload) {
	return new Response(JSON.stringify(payload), {
		status:  200,
		headers: {"Content-Type": "application/json"},
	});
}

function handleStub(urlString) {
	const url      = new URL(urlString, location.origin);
	const path     = url.pathname.slice(STUB_PREFIX.length); // drop "/stub/wo-matrix"
	const params   = url.searchParams;

	// /work-orders/matrix?list=…&limit=…&offset=…
	if (path === "/work-orders/matrix") {
		const list   = params.get("list")   ?? "legacy";
		const limit  = Number(params.get("limit")  ?? 25);
		const offset = Number(params.get("offset") ?? 0);
		const rows   = list === "attention" ? ALL_ROWS_ATTENTION : ALL_ROWS_LEGACY;
		return jsonResponse(paginate(rows, limit, offset));
	}

	// /customer-orders/{uuid}/tasks/{taskName}
	let m = path.match(/^\/customer-orders\/([^/]+)\/tasks\/(.+)$/);
	if (m) return jsonResponse(buildTaskDetail(decodeURIComponent(m[1]), decodeURIComponent(m[2])));

	// /customer-orders/{uuid}
	m = path.match(/^\/customer-orders\/([^/]+)$/);
	if (m) return jsonResponse(buildCustomerOrder(decodeURIComponent(m[1])));

	// /rfs-orders/{rfsId}
	m = path.match(/^\/rfs-orders\/([^/]+)$/);
	if (m) return jsonResponse(buildRfsOrder(decodeURIComponent(m[1])));

	return new Response(`Stub: no handler for ${url.pathname}`, {status: 404});
}

let installed = false;
export function installStub() {
	if (installed) return;
	installed = true;
	const realFetch = window.fetch.bind(window);
	window.fetch = (input, init) => {
		// `fetch()` accepts strings, URL objects, and Request objects. URL exposes
		// `href`, Request exposes `url`. Cover all three before falling through.
		const url = typeof input === "string"
			? input
			: (input && (input.href || input.url)) || "";
		if (url.includes(STUB_PREFIX)) return Promise.resolve(handleStub(url));
		return realFetch(input, init);
	};
}

export const STUB_ENDPOINT  = `${STUB_PREFIX}/work-orders/matrix`;
export const STUB_BASE_URL  = STUB_PREFIX;
