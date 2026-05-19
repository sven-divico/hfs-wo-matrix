import '../src/x-2057350-wo-matrix';
import {installStub, STUB_ENDPOINT, STUB_BASE_URL} from './stub.js';

// `snc ui-component develop` previews the component in isolation. Install the
// stub fetch shim and mount with stub URLs so the matrix has data to render.
// Production builds never load example/ — the component's own property
// defaults remain the production Scripted REST paths.
installStub();

const host = document.createElement('div');
host.style.cssText = 'height:100vh;width:100vw;';
document.body.appendChild(host);

host.innerHTML = `
	<x-2057350-wo-matrix
		endpoint="${STUB_ENDPOINT}"
		base-url="${STUB_BASE_URL}">
	</x-2057350-wo-matrix>
`;
