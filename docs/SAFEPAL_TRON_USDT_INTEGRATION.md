# SafePal + USDT (TRON/TRC-20) Integration Plan

Status: design specification only — not connected to a live wallet, not audited, and not authorized for real-money use.

## 1. Initial decision
- External wallet: SafePal.
- Initial chain: TRON mainnet.
- Initial token: USDT using TRC-20.
- Game accounting: integer USD cents; on-chain transfers tracked separately in exact token base units.
- All withdrawals manually reviewed by an administrator in the first release.
- This choice remains provisional until integration tests and legal/compliance review are complete.

## 2. Compatibility assessment
SafePal's official developer material describes DApp connectivity and lists TRON support for its wallet experience. SafePal's official WalletConnect guide documents connecting its mobile wallet to a DApp. TRON developer documentation exposes TRC-20 transfer history through TronGrid. The commonly used TRON mainnet USDT TRC-20 contract address is:

`TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6`

Before deployment, independently verify the token contract address against current official Tether/TRON sources and verify the network and recipient address in SafePal. Never trust a token only because its ticker says USDT. No live SafePal connection has been tested by this document.

References:
- SafePal DApp developer introduction: https://devdocs.safepal.com/Connect-wallet/Web/introduction.html
- SafePal WalletConnect guide: https://devdocs.safepal.com/Connect-wallet/Mobile/walletconnet.html
- SafePal developer guide mentioning TRON: https://www.safepal.com/en/blog/developers-guide-how-to-optimize-your-dapp-in-the-safepal-wallet
- TRON TRC-20 transaction history: https://developers.tron.network/docs/get-trc20-transaction-history

## 3. Recommended architecture

### A. Receive funds
1. Use a dedicated treasury address for game receipts; avoid reusing an everyday personal wallet where possible.
2. Display the exact network (TRON mainnet / TRC-20) and token contract next to the address.
3. A server-side watcher reads confirmed TRC-20 transfers to the treasury address from a reliable TRON node/indexer.
4. Verify contract address, recipient, amount, transaction success, confirmation/block status, and transaction hash.
5. Identify each event uniquely by chain + transaction hash + event/log index to prevent duplicate credits.
6. Never credit a balance from screenshots, client callbacks, or unconfirmed transfers.
7. Reconcile the watcher against an independent node/explorer and retain an audit trail.

### B. Connect a player's SafePal wallet
- Provide a Connect SafePal flow through a supported SafePal DApp browser or WalletConnect route only after confirming the current TRON integration method and library.
- Request only the public address needed for display/verification.
- If the selected TRON integration supports secure message signing, use a fresh single-use nonce to prove address control and verify the signature server-side.
- Never request a seed phrase, private key, wallet PIN, or remote-control access.
- A connected wallet does not grant the game permission to spend assets. Every transfer must be explicitly reviewed and approved in the wallet by its owner.

### C. Player withdrawals
1. Player submits an amount and destination address, explicitly selecting TRON / TRC-20 USDT.
2. Validate the address format and show a confirmation warning: wrong-network or wrong-address transfers may be unrecoverable.
3. Apply account security checks, minimum/maximum limits, risk review, duplicate-request checks, and available-balance checks.
4. Atomically move the requested amount from available earnings to withdrawal-reserved in the ledger.
5. Admin reviews and approves/rejects. Where staffing allows, the requester/reviewer/sender roles should be separated.
6. Initial release: administrator initiates the transfer in SafePal and records the transaction hash in the admin panel. The backend independently verifies the successful on-chain transfer before marking it paid.
7. Never mark paid merely because an admin approved a request or pasted a hash. Verify recipient, token contract, amount, chain, and transaction success on-chain.
8. On rejection or definitive failure, release reserved funds through a compensating ledger transaction; never delete posted ledger entries.
9. Use idempotency keys and a strict state machine to prevent duplicate payouts on retries.

### D. Automatic payouts — future phase only
Do not automate payouts by storing a SafePal seed phrase/private key in the game server, GitHub, frontend JavaScript, GitHub Pages, or committed environment files. SafePal's normal DApp connection is not itself a server-side hot-wallet signing service.

If automation is later required, evaluate a dedicated treasury signing architecture (such as a properly secured HSM/MPC/custody provider or isolated signer with strict policy limits), independent security review, allowlisted destinations, daily caps, multi-party approval, emergency pause, and key recovery/rotation procedures. This is a separate security project.

## 4. Ledger and balances
Keep separate buckets:
- `game_free`: promotional gameplay balance; not withdrawable.
- `game_topup`: paid game credit; not automatically convertible to withdrawable earnings.
- `earnings_pending`: rewards awaiting validation.
- `earnings_available`: validated earnings eligible for spending or withdrawal.
- `withdrawal_reserved`: funds reserved for an active withdrawal request.

Use an append-only double-entry ledger; each posted transaction must balance to zero. Store token amounts as integers in base units (USDT TRC-20 uses 6 decimals) and fiat accounting as integer cents; never use floating-point money values. If converting USDT to USD accounting values, record the rate, source, and timestamp. USDT is designed to track USD, but its market price and redemption are not guaranteed to be exactly one dollar.

The agreed player pool remains 20% of eligible game revenue collectively, not 20% per player. Reward allocation rules must be transparent, versioned, and auditable.

## 5. Minimum data model additions
Adapt existing tables rather than duplicating them:
- `wallet_connections`: user_id, chain_id, address, verification_status, nonce_hash, verified_at, created_at, revoked_at.
- `chain_deposits`: chain, token_contract, tx_hash, event_index, sender, recipient, amount_base_units, block_number, confirmation/status, detected_at, credited_at.
- `withdrawal_requests`: user_id, destination_address, chain, token_contract, amount_base_units, fee_base_units, status, reviewer_id, review timestamps, tx_hash, idempotency_key, failure_reason.
- `chain_reconciliation_runs`: source, cursor/block range, result, mismatch count, completed_at.
- `admin_audit_log`: immutable actor/action/target/timestamp/reason metadata.

Add unique constraints for chain deposit event identity and withdrawal idempotency key. Store no wallet secrets or seed phrases.

## 6. Operational security
- Keep API keys and service credentials in deployment secrets, never in the public repository or browser bundle.
- Use a dedicated treasury address and controlled operational balance.
- Require MFA for admins and log payout approvals, rejections, address changes, and reconciliation actions.
- Consider destination allowlisting and a cooling-off period after address changes.
- Apply rate limits, anomaly detection, withdrawal caps, and an emergency pause.
- Monitor TRON resource/fee requirements and ensure sufficient TRX for network fees before transfers.
- Back up database/audit records and test restoration and incident response.
- Never log private keys, recovery phrases, authentication tokens, or unnecessary personal data.
- Publish clear terms, fees/minimums, processing times, eligibility, disputes, and geographic restrictions.

## 7. Test plan
1. Unit tests for decimals, rounding, reward allocation, and ledger balancing.
2. Testnet integration first; testnet tokens are not real USDT and do not prove mainnet readiness.
3. Test valid deposits, wrong contract, wrong chain, failed/unconfirmed transfers, duplicate events, pagination, chain reorganization edge cases, watcher downtime and recovery.
4. Test withdrawal rejection/approval, invalid address, wrong network, insufficient earnings, concurrent duplicate requests, timeout, failed transaction, and reconciliation mismatch.
5. Only after independent review and legal/compliance approval, conduct a small supervised mainnet test.
6. Before real-money rewards, obtain qualified review of applicable UK and target-country law, tax, consumer protection, crypto-asset, AML/sanctions, and app-store requirements.

## 8. Release phases
- Phase 1: mock wallet UI and simulated balances; no blockchain writes.
- Phase 2: SafePal connection/address verification and read-only TRON deposit watcher in a test environment.
- Phase 3: manually approved withdrawals with independent on-chain confirmation.
- Phase 4: security audit and legal/compliance sign-off.
- Phase 5: consider automation only after a separate threat model and approval.

## 9. Explicit limitations
This document does not create a live wallet connection, generate a treasury address, send funds, deploy a contract, or certify legal compliance. It is a safe implementation plan only.
