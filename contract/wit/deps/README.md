# wit/deps — vendor the host packages before building

This contract imports three host interfaces:

- `host:tenant/tenant-context@2.0.0`
- `host:interfaces/logging@2.4.0`
- `host:interfaces/kv-store@2.4.0`

The WIT package definitions for these live in the Terminal 3 **trinity**
release the public testnet runs (`testnet-v1.0.12`): packages
`host:interfaces@2.4.0` and `host:tenant@2.0.0`. They are deliberately not
copied into this repository. Vendor them by either route:

1. Clone the official reference contract and copy its vendored deps:
   `git clone https://github.com/Terminal-3/agent-vault-starter.git`, then
   copy its `wit/deps/host-interfaces-2.4.0/` and `wit/deps/host-tenant-2.0.0/`
   folders into this folder, or
2. Take the same two packages from the trinity release matching your
   target cluster.

Expected layout afterwards:

```
wit/
  world.wit
  deps/
    host-interfaces-2.4.0/package.wit
    host-tenant-2.0.0/package.wit
```

Only these members are used by this contract:

- tenant-context: `tenant-did`, `calling-user-did`, `is-delegated`
- logging: `info`
- kv-store: `get`, `put`, `delete`

Re-vendor whenever the target cluster's trinity release changes.
