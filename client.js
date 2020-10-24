import * as grpc from '@grpc/grpc-js';

import Service from '@thzero/library_server/service/index';

class BaseClientGrpcService extends Service {
	async _execute(correlationId, func, client, request) {
		this._enforceNotNull('BaseClientGrpcService', '_execute', func, 'func', correlationId);

		return await new Promise((resolve, reject) => {
			func.call(client, request, function(err, response) {
				if (err) {
					reject(err);
					return;
				}

				resolve(response);
			});
		});
	}

	get _credentials() {
		return grpc.credentials.createInsecure();
	}

	_host(key) {
		const config = this._config.getBackend(key);
		return config.baseUrl;
	}

	async _host(correlationId, key) {
		this._enforceNotNull('BaseClientGrpcService', '_host', key, 'key', correlationId);

		let baseUrl = config.baseUrl;
		if (config.discoverable) {
			this._enforceNotNull('BaseClientGrpcService', '_host', config.disoveryName, 'disoveryName', correlationId);

			baseUrl = this._serviceDiscoveryResources.getService(correlationId, config.disoveryName);
		}
		else
			baseUrl = config.baseUrl;

		return baseUrl;
	}
}

export default BaseClientGrpcService;
