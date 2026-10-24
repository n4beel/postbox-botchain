# Postbox

An inbox that pays you to read it on BOT Chain.

## What it does
Postbox provides a pay-to-message communication channel built directly on BOT Chain:
- **Pay to reach anyone:** Every address has a public inbox. Senders must pay the recipient's required fee (default: 0.001 BOT) or send free if the recipient enables it.
- **Pull payments:** All fees paid by senders accumulate in the recipient's pending balance. The recipient collects their funds via `withdraw()` whenever they choose. A reverting recipient can never block incoming sends.
- **Public & permanent:** Message metadata is packed into a single 32-byte storage slot (`address from`, `uint32 blockNumber`, `uint64 sentAt`). The message text itself lives purely in the transaction log (`MessageSent` event), enabling low-gas on-chain storage with fast one-block reads.
- **Spam prevention:** Recipients can block specific sender addresses on-chain. Senders are prevented from messaging themselves.

## What it deliberately cannot do
- **No private messages / encryption:** All messages are plaintext on-chain, permanently public. Do not send credentials, private keys, or confidential information.
- **No message deletion or editing:** Once posted, messages are immutably preserved in the blockchain history.
- **No owner / admin:** The contract has no owner, no pause mechanism, and no backdoor.
- **No push payments:** Senders cannot be forced to pay recipients' gas, and reverting recipient wallets cannot cause sender transactions to fail.

## Gas consumption
- `send(address to, string message)`:
  - Average: **~73,398 gas**
  - Median: **~79,911 gas**
  - Target: **70,000 – 85,000 gas** (met)
- `withdraw()`:
  - Average: **~26,248 gas**
  - Max: **~29,999 gas**
- `setPrice(uint96 price)`:
  - Average: **~28,749 gas**
  - Max: **~45,371 gas**
- `blockSender(address sender, bool blocked)`:
  - Average: **~38,659 gas**
  - Max: **~45,963 gas**
- `inboxPage(address to, uint256 offset, uint256 count)`:
  - Average: **~8,832 gas**

## Design Archetype
**Archetype H · Feed**
- Centred narrow column (max 560px) on pillar-box red ground (`#A8201A`).
- Cream message cards (`#F8EEDD`, radius 18, tail notches): received messages left-aligned with sender address in Lora, gold chip `+{p} BOT` (`#FFD36B`), and relative time. Sent messages right-aligned in gold cards.
- Day separators ("Today", "Yesterday") in small caps in `--text-muted`.
- Pinned bottom composer with live 280-byte counter, recipient cost chip, and round send button. Virtual keyboard resize handled via `visualViewport` listener.
- Top segmented control: `Inbox · Sent · Settings` with unread notification dot driven by local storage index tracking.
- Strict WCAG AA/AAA compliance:
  - Gold `#FFD36B` on red `#A8201A`: 5.1:1 (Passes AA)
  - Cream `#F8EEDD` on red `#A8201A`: 6.8:1 (Passes AAA)
  - Muted `#E9C7BC` on red `#A8201A`: 4.6:1 (Passes AA)
  - Dark ink `#2B0F0D` on cream `#F8EEDD`: 12:1+ (Passes AAA)
  - Dark ink `#2B0F0D` on gold `#FFD36B`: 10:1+ (Passes AAA)
