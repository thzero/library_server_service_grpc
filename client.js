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

		const meta = new grpc.Metadata();
		meta.add('correlationId', correlationId);

		return await new Promise((resolve, reject) => {
			func.call(client, request, meta, function(err, response) {
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

				this._enforceNotNull('BaseClientGrpcService', '_host', response.results, 'results', correlationId);

				response.results.port ? response.results.port : 80;
				this._enforceNotNull('BaseClientGrpcService', '_host', response.results.port, 'results.port', correlationId);

				if (response.results.dns) {
					const temp = [];
					temp.push(response.results.dns.label);
					if (!String.isNullOrEmpty(response.results.dns.namespace))
						temp.push(response.results.dns.namespace);
					if (response.results.dns.local)
						temp.push('local');
					response.results.address = temp.join('.');
				}

				this._enforceNotNull('BaseClientGrpcService', '_host', response.results.address, 'results.address', correlationId);

				baseUrl = `http${response.results.secure ? 's' : ''}://${response.results.address}${response.results.port ? `:${response.results.port}` : ''}`;
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
