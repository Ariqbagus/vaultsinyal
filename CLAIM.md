# CLAIM.md — klaim API key Terminal 3 (langkah siap eksekusi)

Sumber: halaman resmi docs.terminal3.io "Claim Your API Key & credits" +
halaman klaim itu sendiri, dicek 26 Nov 2026. Seluruhnya self-serve:
**tanpa persetujuan, tanpa waitlist, key + kredit testnet terbit instan.**

## Yang didapat

- Satu **developer API key** (kunci yang dipakai SDK untuk autentikasi).
- **20.000 kredit sandbox/testnet** otomatis terhubung ke key itu.
- Satu **T3N ID (`did:t3n:...`)** yang dibuat dan tertaut otomatis.
- Selama periode program Build+Scale Micro Grant, kredit T3 yang terpakai
  **ditanggung penuh Terminal 3**; kredit tambahan bisa diminta di grup
  Telegram developer.

## Langkah klaim (hanya bisa dilakukan pemilik akun)

1. Buka halaman klaim resmi: **https://www.terminal3.io/claim-page**
2. **Sign in dengan email kerja** (form di halaman itu; pakai email akun
   yang akan dipakai membangun — ariq204@gmail.com).
3. Bila punya **kode kampanye/event**, masukkan di form untuk kredit
   tambahan (jumlahnya tergantung kampanye). Jalur komunitas ADK juga
   disebut di panduan onboarding resmi: SSO lewat
   `go.terminal3.io/adk-community` dengan dispensi otomatis 20.000 kredit.
4. Submit form. **Developer key langsung tampil di halaman sukses.**
5. ⚠️ **Key hanya tampil SEKALI** dan tidak bisa dilihat lagi sesudah
   meninggalkan halaman. Salin saat itu juga dan simpan di tempat aman
   (password manager / Secure Vault). Halaman yang sama menampilkan T3N ID
   dan kredit yang tertaut.
6. Masukkan key ke environment mesin yang menjalankan VaultSinyal
   (JANGAN kirim lewat chat, JANGAN commit ke repo):
   ```bash
   cd ~/workspace/dorahacks/terminal-3/app
   cp .env.example .env
   # isi T3_API_KEY=<key dari langkah 5> di .env
   export T3_API_KEY=<key dari langkah 5>   # atau T3N_API_KEY, keduanya dibaca
   ```
7. Verifikasi key jalan (langkah pertama sesudah key ada):
   ```bash
   npm install
   npx tsx src/setup.ts
   # diharapkan: "Connected as tenant did:t3n:..." + saldo ±20.000 kredit
   ```
   Error umum dan obatnya: docs.terminal3.io bagian "Common Errors";
   bantuan resmi: devrel@terminal3.io.

## Langkah akun lain yang hanya bisa dilakukan pemiliknya (skor Visibilitas 20%)

- **Follow @terminal3io di X** dari akun @Ar40629992.
- **Join + aktif di grup Telegram developer Terminal 3** (@terminal3developer)
  dari akun @Pemulung_Market — grup yang sama adalah jalur resmi meminta
  kredit tambahan.
- Posting progres bertagar **@terminal3io** dari akun sendiri.

## Sesudah key ada (dikerjakan Muse, urutan persis)

1. `npx tsx src/setup.ts` — koneksi + organisasi + agen; simpan
   `ORG_DID`, `AGENT_DID`, dan `AGENT_API_KEY` (tampil sekali) ke `.env`.
2. `npx tsx src/setup.ts --fund-agent 5` — danai agen 5 kredit.
3. Bangun kontrak: vendor WIT deps (contract/wit/deps/README.md),
   `rustup target add wasm32-wasip2`, `cargo test`, `cargo build --target wasm32-wasip2 --release`.
4. `npx tsx src/setup.ts --register` — upload WASM, buat map privat,
   simpan contract_id; lalu `--grant` untuk memberi agen fungsi `check`.
5. `npx tsx src/store.ts examples/record.json` — simpan record contoh.
6. `./scripts/run-agent.sh` — satu siklus check agen + dashboard.
