![GitHub package.json version](https://img.shields.io/github/package-json/v/thzero/library_server_service_grpc)
![David](https://img.shields.io/david/thzero/library_server_service_grpc)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

# library_server_service_grpc

gRPC client and server bases for [@thzero/library_server](https://github.com/thzero/library_server), built on [@grpc/grpc-js](https://github.com/grpc/grpc-node).

For service-to-service calls inside a deployment, alongside the REST communication service used for outward-facing traffic. Host resolution goes through the framework's service discovery when it is configured, and falls back to a configured base url when it is not.

## Requirements

### NodeJs

[NodeJs](https://nodejs.org) version 22+

### Installation

[![NPM](https://nodei.co/npm/@thzero/library_server_service_grpc.png?compact=true)](https://npmjs.org/package/@thzero/library_server_service_grpc)

```
npm install @thzero/library_server_service_grpc
```

#### Peer dependencies

* `@thzero/library_common`
* `@thzero/library_common_service`
* `@thzero/library_server`

## What it provides

### `client.js` — `BaseClientGrpcService`

| Method | Purpose |
|---|---|
| `_execute(correlationId, func, client, request)` | Calls a generated stub method as a promise, attaching the correlationId as gRPC metadata. |
| `_host(correlationId, key, opts)` | Resolves the host for a backend. |
| `_hostFromConfig(correlationId, host, key, opts)` | Resolves from config, consulting service discovery when enabled. Discovered hosts are cached per key. |
| `_hostFromResource(correlationId, host, resource, opts)` | Builds `address:port` from a discovery resource, assembling a DNS name from `label`, `namespace` and `local` when present. |
| `_credentials(correlationId)` | Returns the channel credentials. Insecure by default — **override this for anything crossing a trust boundary.** |

`_host` takes the url straight from `opts` when one is supplied, prefers `opts.resource` over it, and only falls back to config when `opts` is absent entirely. Note that `opts` carrying neither a resource nor a url yields an empty host rather than the config fallback.

Every call sends `correlationId` as metadata, so a request can be traced across service boundaries the same way it is over HTTP.

### `server.js` — `BaseServerGrpcService`

| Method | Purpose |
|---|---|
| `_initServices(grpc)` | **Override this.** Add your generated service implementations to the server. |
| `_start(correlationId)` | Binds to `0.0.0.0:<grpc.port>` and starts. Called during `init`. |
| `_correlationId(call)` | Reads the correlationId from the call metadata. |
| `_authenticate(call)` | Reads the `authorization` metadata and returns the correlationId. |
| `_handleError(correlationId, err, callback)` | Turns an error into the `{ message }` shape a gRPC callback expects, combining `name` and `message`. |

**`_authenticate` does not currently reject anything** — the authorization metadata is read and logged, but the validity check is a `TODO` in the source. Do not rely on it as a security boundary; override it, or authenticate at another layer.

## Configuration

### Server

```json
{
    "app": {
        "grpc": {
            "port": 50051
        }
    }
}
```

A missing `grpc` block or `grpc.port` fails at boot.

### Client

Per-backend, read through `_config.getBackend(correlationId, key)`:

```json
{
    "app": {
        "backend": {
            "<key>": {
                "baseUrl": "service-host:50051",
                "discoverable": {
                    "name": "<discovery service name>",
                    "enabled": true
                }
            }
        }
    }
}
```

* **`baseUrl`** — used directly when discovery is off or unavailable.
* **`discoverable`** — omit it to skip discovery entirely. With it present, discovery is used only when a `SERVICE_DISCOVERY_RESOURCES` service is registered **and** `discoverable.enabled` is not `false`.
* **`discoverable.name`** — the name looked up in discovery. Required once discovery is active.

## Wiring it up

```js
import BaseClientGrpcService from '@thzero/library_server_service_grpc/client.js';

class InventoryClientService extends BaseClientGrpcService {
    async fetch(correlationId, id) {
        const host = await this._host(correlationId, 'inventory');
        const client = new InventoryClient(host.url, this._credentials(correlationId));
        return await this._execute(correlationId, client.fetch, client, { id });
    }
}
```

Register client and server services with the injector from `_initServices` in your `BootMain` derived class, or from a boot plugin's `initServices`. The client resolves `SERVICE_DISCOVERY_RESOURCES` during `init`, which may legitimately be absent.

## Development

```
npm run lint       # eslint .
npm run lint:fix   # eslint . --fix
npm test           # node --test "test/*.test.js"
```
