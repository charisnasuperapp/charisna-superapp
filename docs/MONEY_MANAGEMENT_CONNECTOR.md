# Money Management connector

Status: code and tests ready; production pairing requires both deployments and an unlocked source vault.

## Owner flow

1. Sign in to `https://zen.charisna-superapp.workers.dev/money`.
2. Select **Buat kode penghubung**. The 24-character code expires after 10 minutes.
3. Open CHARISNA Money Management on the web or Android, sign in to its cloud account, and unlock the PIN vault.
4. Open **Pengaturan → CHARISNA SuperApp**, paste the code, and select **Hubungkan dan kirim ringkasan**.
5. Read each financial profile separately in the SuperApp Money Management tab. No cross-currency grand total is shown.

## Data contract

The source sends schema 1: `{schema, month, profiles[]}`. `month` is `YYYY-MM` in Asia/Jakarta. Each profile has `id`, `name`, `currency`, ISO currency `scale`, `quality`, `balance_minor`, `income_minor`, and `expense_minor`. Amounts are signed integer strings in minor currency units; missing currency conversion is `null`, never zero. `quality` is `complete` or `fx_unavailable`.

Balance means net worth within the profile: asset account balances minus liability balances. It includes opening balances and account movements. Monthly income and expense exclude transfers and cancelled entries. The source uses its v14 account-balance function, including cross-profile transfer handling. The figures are read-only. Different profiles and currencies are never summed.

The source sends only after a successful encrypted cloud vault save or pull, while its vault is unlocked. The Worker cannot derive fresh figures from the PIN-encrypted vault when the source is closed. Its D1 snapshot remains available, marked stale after 24 hours. New values require a later source sync. No PIN, Supabase session token, transaction list, attachment, or full vault is sent.

## Security and storage

The owner starts pairing through an authenticated same-origin POST. D1 stores only an encrypted hash of the one-time code. First use consumes that code atomically. The Worker returns a random 256-bit connector key; the source stores it inside its encrypted vault. Later pushes prove possession of that key. D1 stores its hash and the limited snapshot under `money:owner`, encrypted with AES-256-GCM. This key has a domain-separated derivation from `SESSION_SECRET`. `POST /money/disconnect` removes pairing and snapshot state; an old key then fails. The Worker keeps Teaching Pay Audit in its separate `owner` row.

`GET /money/overview.json` uses the existing owner authorization and device lock. `POST /money/push` accepts only the known source web origin or specific Android localhost origins. CORS is a browser boundary; the one-time code and connector key authorize writes. Responses are not cached. The source ignores push failures for its own vault save, then retries on a later cloud sync.

## Verification and limitations

- SuperApp: `node --test tests/*.test.mjs`, `npm run check`.
- Source: `node --test tests/superapp-sync.test.mjs`; `node --check www/superapp-sync.js`.
- The native Windows build loads `file://`. Its opaque `Origin: null` was not authorized for financial pushes, so Windows native sends will be rejected. Use the web app for initial pairing and updates until a dedicated Windows transport is reviewed.
- Production D1 schema, Cloudflare secrets, and Teaching Pay Audit paths are unchanged. No new paid service is required.
