import * as grpc from '@grpc/grpc-js';
import { Mutex as asyncMutex } from 'async-mutex';

import LibraryServerConstants from '@thzero/library_server/constants.js';

import Service from '@thzero/library_server/service/index.js';

class BaseClientGrpcService extends Service {
	constructor() {
		super();

		this._mutex = new asyncMutex();

		this._serviceDiscoveryResources = null;

		this._hosts = new Map();
	}

	async init(injector) {
		await super.init(injector);

		this._serviceDiscoveryResources = this._injector.getService(LibraryServerConstants.InjectorKeys.SERVICE_DISCOVERY_RESOURCES);
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

	_credentials(correlationId) {
		return grpc.credentials.createInsecure();
	}

	async _host(correlationId, key, opts) {
		this._enforceNotEmpty('BaseClientGrpcService', '_host', key, 'key', correlationId);

		let host = {
			url: null,
			secure: false
		};

		if (opts) {
			if (opts.resource)
				host = await this._hostFromResource(correlationId, host, opts.resource, opts);
			else if (!String.url(opts.url)) {
				host.url = opts.url;
				host.secure = opts.secure;
			}
		}
		else                         
			host = await this._hostFromConfig(correlationId, host, key, opts);

		return host;
	}

	async _hostFromConfig(correlationId, host, key, opts) {
		this._enforceNotEmpty('BaseClientGrpcService', '_hostFromConfig', host, 'host', correlationId);
		this._enforceNotEmpty('BaseClientGrpcService', '_hostFromConfig', key, 'key', correlationId);

		const config = this._config.getBackend(key);
		this._enforceNotNull('BaseClientGrpcService', '_hostFromConfig', config, 'config', correlationId);
		this._enforceNotEmpty('BaseClientGrpcService', '_hostFromConfig', config.baseUrl, 'config.baseUrl', correlationId);

		host.url = config.baseUrl;
		
		this._logger.debug('BaseServerGrpcService', '_host', 'config.discoverable', config.discoverable, correlationId);
		if (!config.discoverable)
			return host;

		this._logger.debug('BaseServerGrpcService', '_host', '_serviceDiscoveryResources', (this._serviceDiscoveryResources != null), correlationId);
		if (!(this._serviceDiscoveryResources && config.discoverable))
			return host;

		this._logger.debug('BaseServerGrpcService', '_host', 'config.discoverable.enabled', config.discoverable.enabled, correlationId);
		const enabled = config.discoverable.enabled === false ? false : true;
		this._logger.debug('BaseServerGrpcService', '_host', 'enabled', enabled, correlationId);
		if (!enabled)
			return host;

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
			if (this._hasFailed(response))
				return null;

			host = await this._hostFromResource(correlationId, host, response.results);

			this._hosts.set(key, host);
		}
		finally {
			release();
		}

		return host;
	}

	async _hostFromResource(correlationId, host, resource, opts) {
		this._enforceNotEmpty('BaseClientGrpcService', '_hostFromResource', host, 'host', correlationId);
		this._enforceNotEmpty('BaseClientGrpcService', '_hostFromResource', resource, 'resource', correlationId);
		this._enforceNotNull('BaseClientGrpcService', '_hostFromResource', resource.grpc, 'resource.grpc', correlationId);

		let port = resource.grpc.port ? resource.grpc.port : null;
		host.secure = resource.grpc.secure ? resource.grpc.secure : false;

		let address = resource.address;
		if (resource.dns) {
			const temp = [];
			temp.push(resource.dns.label);
			if (!String.isNullOrEmpty(resource.dns.namespace))
				temp.push(resource.dns.namespace);
			if (resource.dns.local)
				temp.push('local');
			address = temp.join('.');
		}

		this._enforceNotNull('BaseClientGrpcService', '_hostFromResource', address, 'address', correlationId);

		host.url = `${address}${port ? `:${port}` : ''}`;

		return host;
	}
}

export default BaseClientGrpcService;
