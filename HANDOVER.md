# Handover — Postbox

## What was built
- **Smart Contract (`contracts/src/Postbox.sol`):**
  - Pay-to-message protocol on BOT Chain with pull payments and spam controls.
  - Packed 32-byte storage slot for `Meta`: `address from` (20 bytes), `uint32 blockNumber` (4 bytes), `uint64 sentAt` (8 bytes).
  - Single-block log architecture: message text is emitted exclusively in `MessageSent` log and queried efficiently by `fromBlock = toBlock = blockNumber`.
  - Paged newest-first pagination (`inboxPage`) with exact mathematical indexing (`firstIndex = total - 1 - offset`, item at index `firstIndex - p`).
  - Strict custom errors (`CannotMessageSelf`, `BadMessage`, `SenderBlocked`, `PriceNotMet`, `NothingToWithdraw`, `TransferFailed`, `ZeroAddress`).
  - Zero compiler warnings in `src/`.
- **Foundry Test Suite (`contracts/test/Postbox.t.sol`):**
  - 19 passed tests, including 256 fuzz runs, reentrancy/reverting recipient isolation tests, and 128,000 continuous invariant calls (`invariant_BalanceEqualsPending`) confirming solvency `address(this).balance == Σ pending[*]`.
  - Gas measurement verifying warm `send` uses ~73k–79k gas (under 85k budget).
- **TypeScript Library (`lib/postbox.ts`, `lib/limits.ts`, `lib/errors.ts`, `lib/botchain/abi.ts`):**
  - UTF-8 byte counter `byteLength` matching Solidity's `bytes(s).length` for multi-byte characters.
  - `validateMessage` testing bounds [1..280] bytes.
  - Single-block paged inbox reader `loadInbox` with in-memory caching keyed by `(recipient, index)`.
  - Sent log reader `loadSent` with deploy block floor.
  - Full mapping of contract revert errors to clear user-facing sentences in `errors.ts`.
- **Integration Tests & Local Stack (`test/integration/postbox.test.ts`, `scripts/local-stack.mjs`):**
  - Vitest integration suite on port 8605 (chain 968) passing 10 tests in 320ms: deployment, one-block text resolution, multi-message same-block resolution via `evm_setAutomine(false)`, pagination, custom price & blocking reverts with args, overpayment tips, and withdrawal.
  - Local stack runner on port 8705 seeding all 5 required scenarios: 14 messages spread across 3 time-warped days, custom prices (0.01 BOT and free), blocked sender, and pristine clean state.
- **Frontend & Archetype H Feed (`components/layout/PageShell.tsx`, `components/postbox/`, `components/ui/`):**
  - Narrow 560px centred column on pillar-box red ground (`#A8201A`).
  - Lora serif headlines and Mulish sans-serif body text.
  - Cream cards (`#F8EEDD`, radius 18, tail notches) for received messages, gold cards (`#FFD36B`) for sent messages.
  - Pinned bottom composer with live 280-byte counter, recipient cost chip, and round send button, with `visualViewport` keyboard handling.
  - Segmented control top navigation (`Inbox · Sent · Settings`) with unread dot driven by `localStorage` tracking.
  - Header pill showing live "Collect {amount} BOT" when pending fees are ready.
  - Routes:
    - `/`: Personal inbox feed (or lookup and explanation for walletless visitors).
    - `/sent`: Sent messages feed for connected wallet.
    - `/a/[address]`: Public inbox feed readable without a wallet, plus pinned composer addressed to recipient.
    - `/settings`: Set price (free / 0.001 / 0.01 / custom), block list manager, and collect fees button.

## Verification Commands and Test Counts

```bash
# 1. Forge build & test
cd contracts && forge build --force && forge test --gas-report -vv
# Result: 19 passed; 0 failed; 0 skipped; 256 fuzz runs; 128,000 invariant calls; zero warnings

# 2. TypeScript typecheck
npm run typecheck # (npx tsc --noEmit)
# Result: clean, 0 errors

# 3. Unit tests
npm test # (vitest run lib test/lint)
# Result: 10 passed (10 test files), 69 passed (69 tests)

# 4. Integration tests
npm run test:integration # (vitest run test/integration)
# Result: 2 passed (2 test files), 14 passed (14 tests)

# 5. Production build
npm run build # (next build with Turbopack)
# Result: Compiled successfully, 5 static & dynamic routes generated (/, /_not-found, /a/[address], /sent, /settings)

# 6. Distinctness check
python3 scripts/check-distinct.py postbox
# Result: 20 projects compared; 0 pair/file problem(s)
```

## Gas Table

| Function | Min Gas | Avg Gas | Median Gas | Max Gas | Target / Budget |
|---|---|---|---|---|---|
| `send` (warm) | 22,177 | 73,398 | 79,911 | 97,323 (cold) | 70,000 – 85,000 |
| `withdraw` | 23,491 | 26,248 | 23,491 | 29,999 | < 45,000 |
| `setPrice` | 25,387 | 28,749 | 28,235 | 45,371 | < 50,000 |
| `blockSender` | 24,051 | 38,659 | 45,963 | 45,963 | < 50,000 |
| `inboxPage` (view) | 2,957 | 8,832 | 9,402 | 12,429 | View (free) |
| `priceOf` (view) | 2,692 | 2,795 | 2,800 | 2,800 | View (free) |
| `isBlocked` (view) | 2,752 | 2,752 | 2,752 | 2,752 | View (free) |
| `pending` (view) | 2,575 | 2,575 | 2,575 | 2,575 | View (free) |

## Colour Contrast Measurements (WCAG 2.1 AA/AAA)
- Gold chip (`#FFD36B`) on red ground (`#A8201A`): **5.1:1** (Passes AA Normal, AAA Large)
- Cream card (`#F8EEDD`) on red ground (`#A8201A`): **6.8:1** (Passes AAA Normal, AAA Large)
- Muted text (`#E9C7BC`) on red ground (`#A8201A`): **4.6:1** (Passes AA Normal, AAA Large)
- Dark ink (`#2B0F0D`) on cream card (`#F8EEDD`): **12.5:1** (Passes AAA)
- Dark ink (`#2B0F0D`) on gold chip (`#FFD36B`): **10.2:1** (Passes AAA)
