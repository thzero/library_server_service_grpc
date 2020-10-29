import * as grpc from '@grpc/grpc-js';
import { Mutex as asyncMutex } from 'async-mutex';

import Service from '@thzero/library_server/service/index';

class BaseClientGrpcService extends Service {
	constructor() {
		super();

		this._mutex = new asyncMutex();

		this._baseUrls = new Map();
	}

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

	async _host(correlationId, key) {
		this._enforceNotNull('BaseClientGrpcService', '_host', key, 'key', correlationId);
		this._enforceNotNull('BaseClientGrpcService', '_host', key, 'key', correlationId);

		const config = this._config.getBackend(key);
		this._enforceNotNull('BaseClientGrpcService', '_host', config, 'config', correlationId);

		let baseUrl = config.baseUrl;

		if (config.discoverable) {
			baseUrl = this._baseUrls.get(name);
			if (!baseUrl)
				return baseUrl;

			const release = await this._mutex.acquire();
			try {
				let service = this._baseUrls.get(name);
				if (!service)
					return this._successResponse(service, correlationId);

				this._enforceNotNull('AxiosRestCommunicationService', '_determineUrl', config.discoveryName, 'discoveryName', correlationId);

				const result = this._serviceDiscoveryResources.getService(correlationId, config.discoveryName);
				this._enforceNotNull('AxiosRestCommunicationService', '_determineUrl', result, 'result', correlationId);
				this._enforceNotNull('AxiosRestCommunicationService', '_determineUrl', result.Address, 'result.Address', correlationId);
				this._enforceNotNull('AxiosRestCommunicationService', '_determineUrl', result.Meta, 'result.Meta', correlationId);

				baseUrl = `http${result.Meta.secure ? 's' : ''}s://${result.Address}${result.Port ? `:${result.Port}` : ''}` + cofnig.discoveryRoot;
				this._baseUrls.set(name, baseUrl);
			}
			finally {
				release();
			}
		}

		return baseUrl;
	}

	get _credentials() {
		return grpc.credentials.createInsecure();
	}
}

export default BaseClientGrpcService;
