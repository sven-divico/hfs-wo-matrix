// Scripted REST resource: GET /api/<namespace>/customer-orders/{uuid}/tasks/{taskName}
//
// Lives on the same `customer-orders` API as customer-order.js, just a deeper
// resource path. Returns a single task detail. The taskName is the canonical
// German name from task-columns.json (e.g. "Spleißen", "GIS Planung").
//
// Showcase-only. Replace with a GlideRecord query against wm_task once the
// data layer is ready.

(function process(/*RESTAPIRequest*/ request, /*RESTAPIResponse*/ response) {
	var coUuid   = String(request.pathParams.uuid     || '');
	var taskName = String(request.pathParams.taskName || '');
	var coIdx    = parseInt(coUuid.replace(/[^0-9]/g, ''), 10) || 0;

	var columns = [
		'HV-S', 'UV-S', 'HV-NE4', 'UV-NE4', 'GIS Planung', 'Fremdleitungsplan',
		'Genehmigungen', 'Tiefbau', 'Spleißen', 'Einblasen', 'Gartenbohrung',
		'Hauseinführung', 'HÜP', 'Leitungsweg NE4', 'GFTA', 'ONT', 'Patch'
	];

	var taskIdx = -1;
	for (var i = 0; i < columns.length; i++) {
		if (columns[i] === taskName) { taskIdx = i; break; }
	}

	if (taskIdx === -1) {
		response.setStatus(404);
		response.setContentType('application/json');
		response.setBody({ error: 'Unknown task name', taskName: taskName });
		return;
	}

	response.setStatus(200);
	response.setContentType('application/json');
	response.setBody({
		number:            'TASK' + (coIdx * 100 + taskIdx),
		short_description: taskName,
		state:             'Work In Progress',
		assignment_group:  taskIdx < 4 ? 'Field Services' : taskIdx < 12 ? 'Civils' : 'Splicing',
		sys_updated_on:    '2026-05-18 11:42:00',
		rfs_type:          taskIdx < 7 ? 'LMA' : 'Connectivity'
	});
})(request, response);
