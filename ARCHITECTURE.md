# VaultSinyal — catatan arsitektur & riset SDK

Riset dilakukan 26 Nov 2026 langsung dari sumber resmi: dokumentasi
docs.terminal3.io (Quickstart, Create Organisation, walkthrough
Register/Store-Grant-Check, halaman Claim) dan paket npm
`@terminal3/t3n-sdk` **5.42.0** (versi latest hari itu; tipe API di bawah
diambil dari `dist/index.d.ts` paket itu sendiri, bukan dari ingatan).

## SDK dalam satu halaman

- **Paket:** `@terminal3/t3n-sdk` (TypeScript/Node ≥ 18, ESM wajib).
  Sejak 5.31.0 klien stateless tinggal di `@terminal3/t3n-client` dan
  di-re-export oleh SDK (`invoke`, `toBaseUnits`, `formatTokens`, …), jadi
  nama impor tidak berubah. Dokumentasi resmi melarang pin versi lama:
  selalu `npm install @terminal3/t3n-sdk tsx` (latest).
- **Autentikasi developer:** satu API key dari claim page. Key itu adalah
  kunci Ethereum: `eth_get_address(key)` menurunkan alamatnya, dan
  `T3nClient` dibuat dengan trust anchor teratestasi
  (`resolveTrustAnchor("testnet")` — wajib, client melempar error tanpa
  itu) + handler `EthSign: metamask_sign(address, undefined, key)`.
  `handshake()` lalu `authenticate(createEthAuthInput(address))`
  mengembalikan `Did` — ambil `.value`-nya. Tenant DID tidak pernah
  diturunkan/ditebak dari alamat; selalu dibaca dari sesi.
- **TenantClient:** `new TenantClient({ t3n, tenantDid, environment, baseUrl })`
  memberi namespace `tenant.contracts` (`register({tail, version, wasm}) ->
  { name, contract_id }`, `execute(tail, {version, function_name, input})`),
  `tenant.maps` (`create({tail, visibility, writers, readers})` — `readers`
  WAJIB diisi eksplisit `{ only: [contractId] }`, kalau tidak kontraknya
  sendiri tidak bisa membaca map-nya), dan `tenant.token.getUsage()`.
  `contract_id` numerik hanya dikembalikan oleh `register`; tidak ada
  lookup, jadi disimpan di `state/setup.json`.
- **Organisasi & agen:** hanya admin organisasi yang bisa membuat agen dan
  memindahkan kredit. `t3n.createOrganisation(name)` (TIDAK idempotent),
  `t3n.createAgent(orgDid, name)` -> `{ agentDid, apiKey, keyId }` —
  **apiKey agen tampil sekali, tidak bisa dipulihkan**. Agen mulai dari
  saldo nol dan membayar panggilannya sendiri; `t3n.fundAgent(agentDid,
  toBaseUnits(5))` memindahkan 5 kredit dari saldo developer (1 kredit =
  1.000.000 base units). Jangan pakai `initialCredits` saat create: itu
  mendanai dari saldo organisasi yang nol.
- **Kontrak TEE:** crate Rust -> komponen WASM (`wasm32-wasip2`,
  `crate-type = ["cdylib","lib"]`, tanpa cargo-component). World
  `tenant-base`: impor hanya `host:tenant/tenant-context@2.0.0`,
  `host:interfaces/logging@2.4.0`, `host:interfaces/kv-store@2.4.0` —
  tanpa HTTP, jadi data tersimpan tidak punya jalan keluar selain jawaban
  boolean `check`. Paket WIT host di-vendor dari rilis trinity
  testnet-v1.0.12. Fungsi diekspor lewat interface `contracts` dengan
  record `generic-input { input, user-profile, context }`.
- **Delegasi:** pemilik data memberi agen fungsi tertentu lewat
  `t3n.updateMemberDelegation(fanOutGrant({ grantee, contract_id, scopes: [], allowed_hosts: [] }, ["check"]))`
  — satu baris grant per fungsi, read-merge-write, **kedaluwarsa 90 hari**.
  Di dalam enclave: `calling_user_did()` = pemilik data (`pii_did` yang
  disebut agen), `authenticated_did()` = agen, `is_delegated()` = true.
  Agen memanggil tanpa sesi: `invoke({ baseUrl, apiKey, request:
  { contract_id, contract_version, function_name, pii_did, input } })`.
  Panggilan tanpa grant ditolak node dengan 403 `function_not_delegated`
  sebelum kontrak berjalan; `store`/`forget` juga menolak semua panggilan
  terdelegasi di dalam kontrak. Jawaban kontrak boleh membawa label
  `custom` yang ditempel node ke entri activity log panggilan itu.
- **Biaya uji resmi:** seluruh Quickstart->walkthrough menghabiskan
  ±3.000 kredit test; klaim memberi 20.000 kredit sandbox. Selama periode
  program grant, kredit yang terpakai ditanggung Terminal 3.

## Arsitektur VaultSinyal

```
Pemilik data (trader)                Agen VaultSinyal (terjadwal)
  store(record) ──┐                    fetch harga publik (Binance)
                  ▼                           │
        ┌───────────────────┐                 │ invoke(check, pii_did=pemilik)
        │ TEE contract      │◄────────────────┘  hanya bila pemilik memberi
        │ signal-vault      │                    grant fungsi `check`
        │ map privat        │
        │ z:<tid>:signal-  │────► answers {rule: bool} + label custom
        │ vault             │                    │
        └───────────────────┘                    ▼
                              data/checks.jsonl -> dashboard (bukti traksi:
                              jumlah check, DID unik, kredit terpakai via
                              activity log organisasi)
```

- `contract/` — kontrak Rust: record = posisi trading + kebijakan risiko;
  rules = batas risiko per posisi / total, jumlah posisi, keberadaan stop
  loss, dan stop loss terlanggar harga publik. Logika murni di `logic.rs`
  (native `cargo test`), dispatch host di `lib.rs`.
- `src/risk.ts` — implementasi referensi TypeScript dari semantik rules
  yang sama persis, untuk log ekspektasi agen + unit test tanpa key.
  Kontrak adalah sumber kebenaran; cermin ini tidak pernah dipakai
  menggantikan jawaban enclave.
- `src/setup.ts` — org + agen (terjaga env, tidak idempotent), funding,
  register kontrak + map, grant. Setiap langkah berbayar/irreversibel
  di belakang flag sendiri.
- `src/store.ts` / `src/grant.ts` — sisi pemilik data.
- `src/agent.ts` — runner terjadwal agen (harga publik -> invoke -> log).
- `src/dashboard.ts` — bukti traksi statis (JSON + HTML) dari log check.
- Semua rahasia dari env (`T3_API_KEY`, fallback `T3N_API_KEY`;
  `AGENT_API_KEY`); tidak ada yang hardcoded, tidak ada `.env` ter-commit.
