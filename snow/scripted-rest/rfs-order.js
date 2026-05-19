// Scripted REST resource: GET /api/<namespace>/rfs_orders/{rfsId}
//
// Returns a deterministic RFS Work Order detail. rfsId pattern produced by
// customer-order.js is `rfs-<N>-lma` (LMA RFS) or `rfs-<N>-con` (Connectivity
// RFS). The script keys off both digits and the suffix.
//
// Showcase-only. Replace with a GlideRecord query against wm_rfs_order + its
// parent wm_customer_order + child wm_task records once the data layer is
// ready.

(function process(/*RESTAPIRequest*/ request, /*RESTAPIResponse*/ response) {
	var rfsId = String(request.pathParams.rfsId || '');
	var isLma = rfsId.indexOf('-lma') > -1;
	var idx   = parseInt(rfsId.replace(/[^0-9]/g, ''), 10) || 0;

	var columns = [
		'HV-S', 'UV-S', 'HV-NE4', 'UV-NE4', 'GIS Planung', 'Fremdleitungsplan',
		'Genehmigungen', 'Tiefbau', 'Spleißen', 'Einblasen', 'Gartenbohrung',
		'Hauseinführung', 'HÜP', 'Leitungsweg NE4', 'GFTA', 'ONT', 'Patch'
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

	function pad3(n) {
		return n < 10 ? '00' + n : n < 100 ? '0' + n : '' + n;
	}

	// LMA RFS owns the first 7 tasks (planning + permits); Connectivity owns
	// the remaining 10 (build-out + final). Matches the split used by the
	// matrix and customer-order endpoints.
	var tasks = [];
	for (var i = 0; i < columns.length; i++) {
		var inThisRfs = isLma ? (i < 7) : (i >= 7);
		if (!inThisRfs) continue;
		tasks.push({
			short_description: columns[i],
			state:             'Done',
			assignment_group:  isLma ? 'Field Services' : 'Splicing',
			sys_updated_on:    '2026-05-18 09:30:00'
		});
	}

	var city = cities[idx % cities.length];

	response.setStatus(200);
	response.setContentType('application/json');
	response.setBody({
		sys_id:   rfsId,
		number:   'RFS' + (isLma ? (idx + 20001) : (idx + 30001)),
		rfs_type: isLma ? 'LMA' : 'Connectivity',
		customer_order: {
			uuid:                'co-' + pad3(idx),
			number:              'WO' + (10001 + idx),
			customer_name:       'Maria Schmidt',
			address:             city[1] + ' ' + (((idx * 7) % 99) + 1),
			city:                city[0],
			construction_status: 'in progress',
			set_name:            'FTTH Standard'
		},
		tasks: tasks
	});
})(request, response);
