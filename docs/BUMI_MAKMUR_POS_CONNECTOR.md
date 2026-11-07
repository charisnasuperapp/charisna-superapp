# Bumi Makmur POS connector

Status: code integration prepared on 2026-11-07. Production pairing and live figures require owner verification.

## Owner flow

1. Sign in to `https://zen.charisna-superapp.workers.dev/pos`.
2. Select **Buat kode penghubung**. Code expires after 10 minutes.
3. Open `https://bumi-makmur.my.id` as POS Owner. Wait until Firebase sync is healthy and the active owner has no pending changes.
4. Open **Pengaturan Sistem → CHARISNA SuperApp**, enter the code, then select **Hubungkan dan kirim ringkasan**.
5. Review each branch card in SuperApp. Each card shows net sales, transaction count, and estimated profit for the current Asia/Jakarta month.

## Data contract and semantics

Source sends schema 1: `{schema:1, month:'YYYY-MM', branches:[{id,name,revenue_idr,transactions,profit_estimate_idr}]}`. Amounts are signed integer strings in IDR. Branch IDs must be unique. The snapshot contains every branch in POS, including an inactive branch when present.

For each branch, the source selects non-VOID sales whose `createdAt` or `date` falls in the Asia/Jakarta month. Net sales is `sale.total - sale.refundedTotal`. Transaction count is the number of those sales, including partly refunded sales. Estimated profit is net sales minus `calculateNetHpp(sales, refunds)` and the branch's expenses recorded in that month. Refunds are linked to selected sales. This matches the POS dashboard's cost calculation and is an estimate, not cash balance or audited net income. A later refund can revise a previous month's source data, but this connector only sends the current month.

The source sends only when an Owner session matches Firebase Auth, the cloud is ready, and no mutation queue or cloud error remains. It sends after pairing and after a settled data change. An unchanged snapshot is refreshed every 15 minutes while open. A closed POS cannot push; SuperApp keeps the last encrypted snapshot and marks it stale after 24 hours. Users must open a paired POS again to refresh it. Other POS devices need their own pairing design; the current sync key is stored only in the paired Owner browser's local storage and scoped to the Firebase UID and store ID. Native Windows `file://` has an opaque Origin and is not allowed to push; use the web or Android app.

## Security and storage

The SuperApp owner starts pairing through an authenticated same-origin POST. D1 stores an encrypted one-time code hash, then an AES-256-GCM encrypted limited snapshot and sync-key hash under `pos:owner`. Key derivation is domain-separated from Money Management and Teaching Pay Audit but depends on `SESSION_SECRET`. The source stores the 256-bit sync key in local storage on the paired Owner device. Do not copy the key to chat, docs, logs, or another device. Browser origin is checked against approved POS web origins and Android localhost origins; origin alone does not authorize writes. `POST /pos/disconnect` removes pairing and snapshot, invalidating the old key. No Firebase password, token, transaction rows, customer data, or stock records are sent.

No new Cloudflare binding or paid service is required. The existing D1 `connector_state` table holds isolated `pos:*` rows. Deployment order: SuperApp Worker first, POS web second, then owner pairing. Rollback: remove the POS tab and source push code; leave `pos:*` rows until the owner disconnects through the UI or a separate approved cleanup. Existing Money Management and Teaching Pay Audit rows are untouched.

## Verification

- SuperApp: `npm test`, `npm run check`.
- POS: `node --test tests/superapp-sync.test.mjs`, then `npm run test:core` and `npm run build` after `npm ci`.
- Live: owner connects once and compares each branch card with the POS dashboard for the same month. Do not report real data before this check.
