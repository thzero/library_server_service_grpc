import * as grpc from '@grpc/grpc-js';
import { Mutex as asyncMutex } from 'async-mutex';

import LibraryConstants from '@thzero/library_server/constants';

import Service from '@thzero/library_server/service/index';

class BaseClientGrpcService extends Service {
	constructor() {
		super();

		this._mutex = new asyncMutex();

		this._serviceDiscoveryResources = null;

		this._hosts = new Map();
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

	_credentials(correlationId, host) {
		return grpc.credentials.createInsecure();
	}

	async _host(correlationId, key) {
		this._enforceNotEmpty('BaseClientGrpcService', '_host', key, 'key', correlationId);

		const config = this._config.getBackend(key);
		this._enforceNotNull('BaseClientGrpcService', '_host', config, 'config', correlationId);
		this._enforceNotEmpty('BaseClientGrpcService', '_host', config.host, 'config.host', correlationId);

		let host = {
			url: config.url,
			secure: false
		};

		this._logger.debug('BaseServerGrpcService', '_host', 'config.discoverable', config.discoverable, correlationId);
		if (!(this._serviceDiscoveryResources && config.discoverable))
			return this.host;

		this._logger.debug('BaseServerGrpcService', '_host', 'config.discoverable.enabled', config.discoverable.enabled, correlationId);
		const enabled = config.discoverable.enabled === false ? false : true;
		this._logger.debug('BaseServerGrpcService', '_host', 'enabled', enabled, correlationId);
		if (!enabled)
			return this.host;

		host = this._hosts.get(key);
		if (host)
			return host;

		const release = await this._mutex.acquire();
		try {
			host = this._hosts.get(key);
			if (host)
				return host;

			this._enforceNotNull('BaseClientGrpcService', '_host', config.discoverable.name, 'discoveryName', correlationId);

			const response = await this._serviceDiscoveryResources.getService(correlationId, config.discoverable.name);
			if (!response.success)
				return null;

			this._enforceNotNull('BaseClientGrpcService', '_host', response.results, 'results', correlationId);
			this._enforceNotNull('BaseClientGrpcService', '_host', response.results.grpc, 'results.grpc', correlationId);

			let port = response.results.grpc.port ? response.results.grpc.port : null;
			host.secure = response.results.grpc.secure ? response.results.grpc.secure : false;

			let address = response.results.address;
			if (response.results.dns) {
				const temp = [];
				temp.push(response.results.dns.label);
				if (!String.isNullOrEmpty(response.results.dns.namespace))
					temp.push(response.results.dns.namespace);
				if (response.results.dns.local)
					temp.push('local');
				address = temp.join('.');
			}

			this._enforceNotNull('BaseClientGrpcService', '_host', address, 'address', correlationId);

			host.url = `${address}${port ? `:${port}` : ''}`;
			this._hosts.set(key, host);
		}
		finally {
			release();
		}

		return host;
	}
}

export default BaseClientGrpcService;
