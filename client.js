import * as grpc from '@grpc/grpc-js';
import { Mutex as asyncMutex } from 'async-mutex';

import LibraryConstants from '@thzero/library_server/constants';

import Service from '@thzero/library_server/service/index';

class BaseClientGrpcService extends Service {
	constructor() {
		super();

		this._mutex = new asyncMutex();

		this._serviceDiscoveryResources = null;

		this._baseUrls = new Map();
	}

	async init(injector) {
		await super.init(injector);

		this._serviceDiscoveryResources = this._injector.getService(LibraryConstants.InjectorKeys.SERVICE_DISCOVERY_RESOURCES);
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
		this._enforceNotEmpty('BaseClientGrpcService', '_host', key, 'key', correlationId);

		const config = this._config.getBackend(key);
		this._enforceNotNull('BaseClientGrpcService', '_host', config, 'config', correlationId);
		this._enforceNotEmpty('BaseClientGrpcService', '_host', config.baseUrl, 'config.baseUrl', correlationId);

		let baseUrl = config.baseUrl;

		if (this._serviceDiscoveryResources && config.discoverable) {
			baseUrl = this._baseUrls.get(key);
			if (baseUrl)
				return baseUrl;

			// const release = await this._mutex.acquire();
			try {
				baseUrl = this._baseUrls.get(key);
				if (baseUrl)
					return baseUrl;

				this._enforceNotNull('BaseClientGrpcService', '_host', config.discoveryName, 'discoveryName', correlationId);

				const response = await this._serviceDiscoveryResources.getService(correlationId, config.discoveryName);
				if (!response.success)
					return null;

				this._enforceNotNull('BaseClientGrpcService', '_host', response.results, 'result', correlationId);
				this._enforceNotNull('BaseClientGrpcService', '_host', response.results.Address, 'result.Address', correlationId);
				this._enforceNotNull('BaseClientGrpcService', '_host', response.results.Meta, 'result.Meta', correlationId);

				baseUrl = `http${response.results.Meta.secure ? 's' : ''}://${response.results.Address}${response.results.Port ? `:${response.results.Port}` : ''}`;
				baseUrl = !String.isNullOrEmpty(config.discoveryRoot) ? baseUrl + config.discoveryRoot : baseUrl;
				this._baseUrls.set(key, baseUrl);
			}
			finally {
				// release();
			}
		}

		return baseUrl;
	}

	get _credentials() {
		return grpc.credentials.createInsecure();
	}
}

export default BaseClientGrpcService;
