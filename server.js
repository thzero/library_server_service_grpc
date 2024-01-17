import * as grpc from '@grpc/grpc-js';

import Service from '@thzero/library_server/service/index.js';

class BaseServerGrpcService extends Service {
	constructor() {
		super();

		this._configGrpc = null;

		this._grpc = null;
	}

	async init(injector) {
		await super.init(injector);

		try {
			this._configGrpc = this._config.get(`grpc`);

			this._grpc = new grpc.Server();
			await this._initServices(this._grpc);
			await this._start();
		}
		catch (err) {
			this._logger.error('BaseServerGrpcService', 'init', null, err);
		}
	}

	_authenticate(call) {
		const correlationId = this._correlationId(call);
		this._logger.debug('BaseServerGrpcService', '_authenticate', 'correlationId', correlationId, correlationId);

		const meta = call.metadata.get('authorization');
		this._logger.debug('BaseServerGrpcService', '_authenticate', 'meta', meta, correlationId);
		const authorization = (meta && (meta.length > 0)) ? meta[0] : null;
		this._logger.debug('BaseServerGrpcService', '_authenticate', 'authorization', authorization, correlationId);

		const valid = true; // TODO
		if (!valid)
			throw Error('Unauthorized.');

		return correlationId;
	}

	_correlationId(call) {
		this._enforceNotNull('BaseServerGrpcService', '_correlationId', call, 'call');

		const meta = call.metadata.get('correlationId');
		this._logger.debug('BaseServerGrpcService', '_correlationId', 'meta', meta);
		return (meta && (meta.length > 0)) ? meta[0] : null;
	}

	_handleError(correlationId, err, callback) {
		this._enforceNotNull('BaseServerGrpcService', '_handleError', callback, 'callback', correlationId);

		if (!err)
			return;

		let message = '';
		if (err.name)
			message += err.name + ' ';
		if (err.message)
			message += err.message;
		message = message.trim();

		callback({ message: message }, null);
	}

	async _initServices(grpc) {
	}

	async _start(correlationId) {
		this._enforceNotNull('BaseServerGrpcService', '_start', this._configGrpc, 'config.grpc', correlationId);
		this._enforceNotNull('BaseServerGrpcService', '_start', this._configGrpc.port, 'config.grpc.port', correlationId);

		return await new Promise((resolve, reject) => {
			this._grpc.bindAsync('0.0.0.0:' + this._configGrpc.port, grpc.ServerCredentials.createInsecure(), (err, port) => {
				if (err) {
					reject(this._error('BaseServerGrpcService', '_start', null, err, null, null, correlationId));
					return;
				}

				this._logger.info2(`GRPC: starting server on port '${this._configGrpc.port}'...`, null, correlationId);
				this._grpc.start();

				resolve(this._success(correlationId));
			});
		});
	}
}

export default BaseServerGrpcService;
