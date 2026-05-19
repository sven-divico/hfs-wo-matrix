// Scripted REST resource: GET /api/<namespace>/customer-orders/{uuid}
//
// Returns a deterministic Customer Order detail for the given uuid. The uuid
// pattern produced by the matrix endpoint is `co-NNN` (zero-padded index 0-26);
// any uuid is accepted and the digits drive the deterministic values, so the
// detail page is reproducible from the matrix click.
//
// Showcase-only. Replace with a GlideRecord query against wm_customer_order
// plus joined wm_rfs_order / wm_task once the data layer is ready.

(function process(/*RESTAPIRequest*/ request, /*RESTAPIResponse*/ response) {
	var uuid = String(request.pathParams.uuid || '');
	var idx  = parseInt(uuid.replace(/[^0-9]/g, ''), 10) || 0;

	var columns = [
		{name: 'HV-S',              "short": 'HV',   sequence: 1},
		{name: 'UV-S',              "short": 'UV',   sequence: 2},
		{name: 'HV-NE4',            "short": 'HV4',  sequence: 3},
		{name: 'UV-NE4',            "short": 'UV4',  sequence: 4},
		{name: 'GIS Planung',       "short": 'GP',   sequence: 5},
		{name: 'Fremdleitungsplan', "short": 'LLD',  sequence: 6},
		{name: 'Genehmigungen',     "short": 'PM',   sequence: 7},
		{name: 'Tiefbau',           "short": 'CV',   sequence: 8},
		{name: 'Spleißen',          "short": 'SP',   sequence: 9},
		{name: 'Einblasen',         "short": 'BF',   sequence: 10},
		{name: 'Gartenbohrung',     "short": 'GD',   sequence: 11},
		{name: 'Hauseinführung',    "short": 'WB',   sequence: 12},
		{name: 'HÜP',               "short": 'HÜP',  sequence: 13},
		{name: 'Leitungsweg NE4',   "short": 'CW4',  sequence: 14},
		{name: 'GFTA',              "short": 'GFTA', sequence: 15},
		{name: 'ONT',               "short": 'ONT',  sequence: 16},
		{name: 'Patch',             "short": 'PCH',  sequence: 17}
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
	var cycle = ['Done', 'Done', 'Work In Progress', 'Scheduled', 'Assigned', 'Pending Dispatch', 'Draft', 'not applicable'];

	function buildTaskState(i) {
		var bandIdx = Math.min(cycle.length - 1, Math.max(0, i - (idx % 6)));
		return (idx + i) % 17 === 5 ? 'Problem' : cycle[bandIdx];
	}

	var tasks = [];
	for (var i = 0; i < columns.length; i++) {
		tasks.push({
			short_description: columns[i].name,
			state:             buildTaskState(i),
			number:            'TASK' + (idx * 100 + i),
			assignment_group:  i < 4 ? 'Field Services' : i < 12 ? 'Civils' : 'Splicing',
			sys_updated_on:    '2026-05-18 09:30:00',
			rfs_type:          i < 7 ? 'LMA' : 'Connectivity'
		});
	}

	var city = cities[idx % cities.length];

	response.setStatus(200);
	response.setContentType('application/json');
	response.setBody({
		uuid:                  uuid,
		number:                'WO' + (10001 + idx),
		customer_name:         'Maria Schmidt',
		phone:                 '+49 211 555 1234',
		address:               city[1] + ' ' + (((idx * 7) % 99) + 1),
		city:                  city[0],
		order_date:            '2026-04-12',
		construction_status:   constructionStates[idx % constructionStates.length],
		set_name:              'FTTH Standard',
		unit_count:            1,
		scheduled_appointment: null,
		lma_order:             { sys_id: 'rfs-' + idx + '-lma', number: 'RFS' + (idx + 20001), rfs_type: 'LMA' },
		connectivity_order:    { sys_id: 'rfs-' + idx + '-con', number: 'RFS' + (idx + 30001), rfs_type: 'Connectivity' },
		tasks:                 tasks
	});
})(request, response);
