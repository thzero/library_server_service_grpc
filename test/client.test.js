import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import '@thzero/library_common/utility/string.js';
import BaseClientGrpcService from '../client.js';

const inject = (target, name, value) => {
	Object.defineProperty(target, name, { value, writable: true, configurable: true });
	return target;
};

const newLogger = () => ({ debug() {}, info() {}, info2() {}, warn() {}, error() {}, exception() {}, fatal() {}, trace() {} });

let service;

beforeEach(() => {
	service = new BaseClientGrpcService();
	inject(service, '_logger', newLogger());
	inject(service, '_config', { getBackend: () => ({ baseUrl: 'http://backend:1' }) });
});

describe('_host', () => {
	it('requires a key', async () => {
		await assert.rejects(() => service._host('cid', null, null), /key is empty/);
	});

	// Regression: the guard read `!String.url(opts.url)`, and String.url does not
	// exist - library_common/utility/string.js declares capitalize, isNullOrEmpty,
	// isString and trim. Every call carrying a url threw
	// `TypeError: String.url is not a function`.
	it('takes the url straight from opts', async () => {
		const host = await service._host('cid', 'key', { url: 'http://given:1', secure: true });
		assert.deepEqual(host, { url: 'http://given:1', secure: true });
	});

	it('prefers a resource in opts over a url', async () => {
		const host = await service._host('cid', 'key', {
			url: 'http://ignored:1',
			resource: { address: 'from-resource', grpc: { port: 9000 } }
		});
		assert.equal(host.url, 'from-resource:9000');
	});

	it('falls back to config when there are no opts at all', async () => {
		const host = await service._host('cid', 'key', null);
		assert.equal(host.url, 'http://backend:1');
	});

	// Known gap: opts that carry neither a resource nor a url do NOT fall back to
	// config - the host comes back empty. Pinning current behaviour.
	it('returns an empty host for opts with neither a resource nor a url', async () => {
		assert.deepEqual(await service._host('cid', 'key', {}), { url: null, secure: false });
	});
});

describe('_hostFromConfig', () => {
	const host = () => ({ url: null, secure: false });

	it('uses the configured base url when discovery is off', async () => {
		const result = await service._hostFromConfig('cid', host(), 'key', null);
		assert.equal(result.url, 'http://backend:1');
	});

	it('uses the configured base url when no discovery service is wired up', async () => {
		inject(service, '_config', { getBackend: () => ({ baseUrl: 'http://backend:1', discoverable: { name: 'svc' } }) });
		const result = await service._hostFromConfig('cid', host(), 'key', null);
		assert.equal(result.url, 'http://backend:1');
	});

	it('uses the configured base url when discovery is explicitly disabled', async () => {
		inject(service, '_config', {
			getBackend: () => ({ baseUrl: 'http://backend:1', discoverable: { name: 'svc', enabled: false } })
		});
		service._serviceDiscoveryResources = { getService: async () => { throw new Error('must not be called'); } };
		const result = await service._hostFromConfig('cid', host(), 'key', null);
		assert.equal(result.url, 'http://backend:1');
	});

	it('resolves and caches a discovered host', async () => {
		let lookups = 0;
		inject(service, '_config', { getBackend: () => ({ baseUrl: 'http://backend:1', discoverable: { name: 'svc' } }) });
		service._serviceDiscoveryResources = {
			getService: async () => { lookups++; return { success: true, results: { address: 'discovered', grpc: { port: 9000 } } }; }
		};
		const first = await service._hostFromConfig('cid', host(), 'key', null);
		const second = await service._hostFromConfig('cid', host(), 'key', null);
		assert.equal(first.url, 'discovered:9000');
		assert.equal(lookups, 1, 'the second call came from the cache');
		assert.equal(second, first);
	});

	it('returns null when discovery fails', async () => {
		inject(service, '_config', { getBackend: () => ({ baseUrl: 'http://backend:1', discoverable: { name: 'svc' } }) });
		service._serviceDiscoveryResources = { getService: async () => ({ success: false }) };
		assert.equal(await service._hostFromConfig('cid', host(), 'key', null), null);
	});

	it('rejects a config without a base url', async () => {
		inject(service, '_config', { getBackend: () => ({}) });
		await assert.rejects(() => service._hostFromConfig('cid', host(), 'key', null), /config.baseUrl is empty/);
	});
});

describe('_hostFromResource', () => {
	const host = () => ({ url: null, secure: false });

	it('joins address and port', async () => {
		const result = await service._hostFromResource('cid', host(), { address: 'a', grpc: { port: 1 } });
		assert.equal(result.url, 'a:1');
	});

	it('omits a missing port', async () => {
		const result = await service._hostFromResource('cid', host(), { address: 'a', grpc: {} });
		assert.equal(result.url, 'a');
	});

	it('carries the secure flag off the grpc block', async () => {
		assert.equal((await service._hostFromResource('cid', host(), { address: 'a', grpc: { secure: true } })).secure, true);
		assert.equal((await service._hostFromResource('cid', host(), { address: 'a', grpc: {} })).secure, false);
	});

	it('assembles a dns name from label, namespace and local', async () => {
		const result = await service._hostFromResource('cid', host(),
			{ dns: { label: 'svc', namespace: 'ns', local: true }, grpc: { port: 1 } });
		assert.equal(result.url, 'svc.ns.local:1');
	});

	it('assembles a dns name that is neither namespaced nor local', async () => {
		const result = await service._hostFromResource('cid', host(), { dns: { label: 'svc' }, grpc: {} });
		assert.equal(result.url, 'svc');
	});

	it('rejects a resource with no grpc block and one with no address', async () => {
		await assert.rejects(() => service._hostFromResource('cid', host(), { address: 'a' }), /resource.grpc is null/);
		await assert.rejects(() => service._hostFromResource('cid', host(), { grpc: {} }), /address is null/);
	});
});

describe('_execute', () => {
	it('requires a function', async () => {
		await assert.rejects(() => service._execute('cid', null, {}, {}), /func is null/);
	});

	it('resolves with the response the callback is given', async () => {
		const func = function (request, meta, callback) { callback(null, { echoed: request.a }); };
		assert.deepEqual(await service._execute('cid', func, {}, { a: 1 }), { echoed: 1 });
	});

	it('rejects with the error the callback is given', async () => {
		const func = function (request, meta, callback) { callback(new Error('boom')); };
		await assert.rejects(() => service._execute('cid', func, {}, {}), /boom/);
	});

	it('sends the correlationId as metadata', async () => {
		let seen = null;
		const func = function (request, meta, callback) { seen = meta.get('correlationId'); callback(null, {}); };
		await service._execute('cid-123', func, {}, {});
		assert.deepEqual(seen, [ 'cid-123' ]);
	});

	it('calls the function with the client as its receiver', async () => {
		const client = { marker: 'me' };
		let receiver = null;
		const func = function (request, meta, callback) { receiver = this; callback(null, {}); };
		await service._execute('cid', func, client, {});
		assert.equal(receiver, client);
	});
});
