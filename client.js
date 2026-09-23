import * as grpc from '@grpc/grpc-js';

import LibraryCommonUtility from '@thzero/library_common/utility/index.js';
import LibraryMomentUtility from '@thzero/library_common/utility/moment.js';

import LibraryServerConstants from '@thzero/library_server/constants.js';

import Service from '@thzero/library_server/service/index.js';

class BaseClientGrpcService extends Service {
	constructor() {
		super();

		this._serviceDiscoveryResources = null;

		// key -> discovered host. A failed discovery is remembered by time so a
		// backend that is down is asked about once per retry window rather than on
		// every call, and a discovery in flight is shared by the calls that arrive
		// while it runs.
		this._hosts = new Map();
		this._hostsFailed = new Map();
		this._hostsPending = new Map();
		this._hostsRetryMs = 5 * 1000;
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
			else if (!String.isNullOrEmpty(opts.url)) {
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

		const config = this._config.getBackend(correlationId, key);
		this._enforceNotNull('BaseClientGrpcService', '_hostFromConfig', config, 'config', correlationId);
		this._enforceNotEmpty('BaseClientGrpcService', '_hostFromConfig', config.baseUrl, 'config.baseUrl', correlationId);

		host.url = config.baseUrl;
		
		this._logger.debug('BaseServerGrpcService', '_host', 'config.discoverable', config.discoverable, correlationId);
		if (!config.discoverable)
			return host;

		this._logger.debug('BaseServerGrpcService', '_host', '_serviceDiscoveryResources', LibraryCommonUtility.isNotNull(this._serviceDiscoveryResources), correlationId);
		if (!(this._serviceDiscoveryResources && config.discoverable))
			return host;

		this._logger.debug('BaseServerGrpcService', '_host', 'config.discoverable.enabled', config.discoverable.enabled, correlationId);
		const enabled = config.discoverable.enabled === false ? false : true;
		this._logger.debug('BaseServerGrpcService', '_host', 'enabled', enabled, correlationId);
		if (!enabled)
			return host;

		const discovered = this._hosts.get(key);
		if (discovered)
			return discovered;

		// A failure used to cache nothing, so every call after it took the mutex
		// and asked discovery again, one at a time.
		const failed = this._hostsFailed.get(key);
		if (failed && ((LibraryMomentUtility.getTimestamp() - failed) < this._hostsRetryMs))
			return null;

		// One discovery per key at a time. Calls for the same key share it; calls
		// for other keys are not held up by it, which the single mutex did.
		let pending = this._hostsPending.get(key);
		if (!pending) {
			pending = this._hostDiscover(correlationId, host, config, key)
				.finally(() => {
					this._hostsPending.delete(key);
				});
			this._hostsPending.set(key, pending);
		}
		return await pending;
	}

	async _hostDiscover(correlationId, host, config, key) {
		this._enforceNotNull('BaseClientGrpcService', '_host', config.discoverable.name, 'discoveryName', correlationId);

		const response = await this._serviceDiscoveryResources.getService(correlationId, config.discoverable.name);
		if (this._hasFailed(response)) {
			this._hostsFailed.set(key, LibraryMomentUtility.getTimestamp());
			return null;
		}

		host = await this._hostFromResource(correlationId, host, response.results);

		this._hosts.set(key, host);
		this._hostsFailed.delete(key);
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
