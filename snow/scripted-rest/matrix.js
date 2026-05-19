// Scripted REST resource: GET /api/<namespace>/work_orders/matrix
//
// Returns a deterministic 27-row table matching the matrix data contract.
// Query params:
//   list   "legacy" (default) | "attention"   filters to rows with a Problem or Fallout
//   limit  page size           (default 25, max 200)
//   offset starting row offset (default 0)
//
// Showcase-only. Replace the in-memory `allRows` array with GlideRecord
// queries against wm_customer_order / wm_task once the data layer is ready.

(function process(/*RESTAPIRequest*/ request, /*RESTAPIResponse*/ response) {
	var columns = [
		{name: 'HV-S',              "short": 'HV',   label: 'Standard House Visit',      sequence: 1},
		{name: 'UV-S',              "short": 'UV',   label: 'Standard Unit Visit',       sequence: 2},
		{name: 'HV-NE4',            "short": 'HV4',  label: 'House Visit NE4',           sequence: 3},
		{name: 'UV-NE4',            "short": 'UV4',  label: 'Unit Visit NE4',            sequence: 4},
		{name: 'GIS Planung',       "short": 'GP',   label: 'GIS Planning - NAS',        sequence: 5},
		{name: 'Fremdleitungsplan', "short": 'LLD',  label: 'Utility Lines Plan',        sequence: 6},
		{name: 'Genehmigungen',     "short": 'PM',   label: 'Permits (VRAO / Aufbruch)', sequence: 7},
		{name: 'Tiefbau',           "short": 'CV',   label: 'Civil Works',               sequence: 8},
		{name: 'Spleißen',          "short": 'SP',   label: 'Splicing',                  sequence: 9},
		{name: 'Einblasen',         "short": 'BF',   label: 'Blow-in Fiber',             sequence: 10},
		{name: 'Gartenbohrung',     "short": 'GD',   label: 'Garden Drilling',           sequence: 11},
		{name: 'Hauseinführung',    "short": 'WB',   label: 'Wall Breakthrough',         sequence: 12},
		{name: 'HÜP',               "short": 'HÜP',  label: 'Install HÜP',               sequence: 13},
		{name: 'Leitungsweg NE4',   "short": 'CW4',  label: 'Cable Way NE4',             sequence: 14},
		{name: 'GFTA',              "short": 'GFTA', label: 'Install GFTA',              sequence: 15},
		{name: 'ONT',               "short": 'ONT',  label: 'Install ONT',               sequence: 16},
		{name: 'Patch',             "short": 'PCH',  label: 'Patch',                     sequence: 17}
	];

	var cities = [
		['Düsseldorf',      'Königsallee'],
		['Köln',            'Hohe Straße'],
		['Bonn',            'Adenauerallee'],
		['Aachen',          'Pontstraße'],
		['Krefeld',         'Rheinstraße'],
		['Mönchengladbach', 'Hindenburgstraße'],
		['Wuppertal',       'Bahnhofstraße'],
		['Essen',           'Limbecker Straße'],
		['Duisburg',        'Königstraße'],
		['Münster',         'Prinzipalmarkt']
	];
	var constructionStates = [
		'Open', 'in progress', 'in progress', 'Completed', 'Fallout',
		'in progress', 'Completed', 'Open', 'Cancellation in progress', 'in progress'
	];
	var statusCodes = ['In Progress', 'Pending', 'Open', 'Done'];
	var cycle = ['Done', 'Done', 'Work In Progress', 'Scheduled', 'Assigned', 'Pending Dispatch', 'Draft', 'not applicable'];

	function pad3(n) {
		return n < 10 ? '00' + n : n < 100 ? '0' + n : '' + n;
	}

	function buildTasks(rowIdx) {
		var tasks = {};
		for (var i = 0; i < columns.length; i++) {
			var bandIdx = Math.min(cycle.length - 1, Math.max(0, i - (rowIdx % 6)));
			var state = (rowIdx + i) % 17 === 5 ? 'Problem' : cycle[bandIdx];
			tasks[columns[i].name] = state;
		}
		return tasks;
	}

	function hasProblem(tasks) {
		for (var k in tasks) {
			if (tasks.hasOwnProperty(k) && tasks[k] === 'Problem') return true;
		}
		return false;
	}

	var allRows = [];
	for (var i = 0; i < 27; i++) {
		var city = cities[i % cities.length];
		var houseNo = ((i * 7) % 99) + 1;
		allRows.push({
			uuid:                'co-' + pad3(i),
			number:              'WO' + (10001 + i),
			status_code:         statusCodes[i % statusCodes.length],
			city:                city[0],
			address:             city[1] + ' ' + houseNo,
			construction_status: constructionStates[i % constructionStates.length],
			sys_updated_on:      '2026-05-18 11:42:00',
			tasks:               buildTasks(i)
		});
	}

	var list   = request.queryParams.list   ? String(request.queryParams.list)   : 'legacy';
	var limit  = parseInt(request.queryParams.limit  || '25', 10);
	var offset = parseInt(request.queryParams.offset || '0',  10);
	if (limit > 200) limit = 200;

	var filtered = (list === 'attention')
		? allRows.filter(function (r) { return hasProblem(r.tasks) || r.construction_status === 'Fallout'; })
		: allRows;

	response.setStatus(200);
	response.setContentType('application/json');
	response.setBody({
		columns: columns,
		rows:    filtered.slice(offset, offset + limit),
		total:   filtered.length,
		offset:  offset,
		limit:   limit
	});
})(request, response);
