import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import '@thzero/library_common/utility/string.js';
import BaseServerGrpcService from '../server.js';

const inject = (target, name, value) => {
	Object.defineProperty(target, name, { value, writable: true, configurable: true });
	return target;
};

const newLogger = () => ({ debug() {}, info() {}, info2() {}, warn() {}, error() {}, exception() {}, fatal() {}, trace() {} });

// grpc metadata exposes get(key) -> array of values
const newCall = (metadata = {}) => ({ metadata: { get: (key) => metadata[key] ?? [] } });

let service;

beforeEach(() => {
	service = new BaseServerGrpcService();
	inject(service, '_logger', newLogger());
	inject(service, '_config', { get: () => null });
});

describe('_correlationId', () => {
	it('reads the first correlationId from the call metadata', () => {
		assert.equal(service._correlationId(newCall({ correlationId: [ 'cid-123' ] })), 'cid-123');
	});

	it('returns null when the metadata carries none', () => {
		assert.equal(service._correlationId(newCall()), null);
	});

	it('throws on a missing call', () => {
		assert.throws(() => service._correlationId(null), /call is null/);
	});
});

describe('_authenticate', () => {
	it('returns the correlationId off the call', () => {
		assert.equal(service._authenticate(newCall({ correlationId: [ 'cid-123' ] })), 'cid-123');
	});

	// Known gap: `const valid = true; // TODO` - the authorization metadata is read
	// and logged but never checked, so nothing is ever rejected here. Pinning that
	// so it is visible rather than assumed.
	it('does not currently reject anything (TODO in the source)', () => {
		assert.doesNotThrow(() => service._authenticate(newCall({ authorization: [ 'Bearer nonsense' ] })));
	});
});

describe('_handleError', () => {
	it('requires a callback', () => {
		assert.throws(() => service._handleError('cid', new Error('boom'), null), /callback is null/);
	});

	it('does nothing when there is no error', () => {
		let called = false;
		service._handleError('cid', null, () => { called = true; });
		assert.equal(called, false);
	});

	it('reports the name and message together', () => {
		let payload = null;
		service._handleError('cid', new Error('boom'), (err) => { payload = err; });
		assert.deepEqual(payload, { message: 'Error boom' });
	});

	it('trims when only one of name and message is present', () => {
		let payload = null;
		service._handleError('cid', { message: 'boom' }, (err) => { payload = err; });
		assert.deepEqual(payload, { message: 'boom' });

		service._handleError('cid', { name: 'Bad' }, (err) => { payload = err; });
		assert.deepEqual(payload, { message: 'Bad' });
	});
});

describe('_start', () => {
	it('requires a grpc config with a port', async () => {
		await assert.rejects(() => service._start('cid'), /config.grpc is null/);
		service._configGrpc = {};
		await assert.rejects(() => service._start('cid'), /config.grpc.port is null/);
	});
});
