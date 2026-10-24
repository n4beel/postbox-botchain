/**
 * Local stack runner and seeder for Postbox.
 *
 * Spawns anvil on port 8705 with chain id 968, deploys Postbox, and seeds
 * the scenarios from 05-postbox.md §5:
 * 1. Account 0: 14-message inbox from 5 senders across 3 days via evm_increaseTime, pending > 0.
 * 2. Account 1: price set to 0.01 BOT.
 * 3. Account 2: price set to 0 BOT (free).
 * 4. Account 3: blocked account 4.
 * 5. Account 5: clean state (no messages).
 *
 * Usage:
 *   node scripts/local-stack.mjs
 */

import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseEther,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";

const PORT = 8705;
const RPC = `http://127.0.0.1:${PORT}`;
const CHAIN_ID = 968;

const MNEMONIC = "test test test test test test test test test test test junk";

const local = defineChain({
  id: CHAIN_ID,
  name: "anvil",
  nativeCurrency: { name: "Test BOT", symbol: "tBOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

console.log(`Starting anvil on port ${PORT}...`);
spawn("anvil", ["--port", String(PORT), "--chain-id", String(CHAIN_ID), "--accounts", "10", "--silent"], {
  detached: true,
  stdio: "ignore",
}).unref();

const pub = createPublicClient({ chain: local, transport: http() });

const accounts = Array.from({ length: 10 }, (_, i) =>
  mnemonicToAccount(MNEMONIC, { addressIndex: i })
);
const wallets = accounts.map((acc) =>
  createWalletClient({ account: acc, chain: local, transport: http() })
);

// Wait for anvil to answer
for (let i = 0; ; i++) {
  try {
    await pub.getBlockNumber();
    break;
  } catch {
    if (i > 100) throw new Error(`anvil never answered on ${RPC}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

const artifact = JSON.parse(
  readFileSync("contracts/out/Postbox.sol/Postbox.json", "utf8")
);
const abi = artifact.abi;

console.log("Deploying Postbox contract...");
const deployHash = await wallets[0].deployContract({
  abi,
  bytecode: artifact.bytecode.object,
  args: [],
  chain: local,
  account: accounts[0],
});
const deployReceipt = await pub.waitForTransactionReceipt({ hash: deployHash });
const contractAddress = deployReceipt.contractAddress;
const deployBlock = deployReceipt.blockNumber;

console.log(`Postbox deployed to ${contractAddress} at block ${deployBlock}`);

// --- Seed Account 0: 14 messages from 5 senders across 3 days ---
console.log("Seeding Account 0 inbox (14 messages across 3 days)...");
const target = accounts[0].address;

// Day 1: 2 days ago (4 messages)
const day1Messages = [
  { senderIdx: 1, text: "Hey there! Welcome to BOT Chain Postbox.", tip: parseEther("0.001") },
  { senderIdx: 2, text: "Are you attending the community call tomorrow?", tip: parseEther("0.002") },
  { senderIdx: 3, text: "Testing the letterbox feed interface.", tip: parseEther("0.001") },
  { senderIdx: 4, text: "Check out the new governance proposal in Assembly.", tip: parseEther("0.003") },
];

for (const m of day1Messages) {
  const h = await wallets[m.senderIdx].writeContract({
    address: contractAddress,
    abi,
    functionName: "send",
    args: [target, m.text],
    value: m.tip,
    chain: local,
    account: accounts[m.senderIdx],
  });
  await pub.waitForTransactionReceipt({ hash: h });
}

// Warp to yesterday (+24h)
await pub.request({ method: "evm_increaseTime", params: [86400] });
await pub.request({ method: "evm_mine", params: [] });

// Day 2: yesterday (5 messages)
const day2Messages = [
  { senderIdx: 6, text: "Good morning! The new node release is out.", tip: parseEther("0.001") },
  { senderIdx: 1, text: "Did you review the PR for the token contract?", tip: parseEther("0.002") },
  { senderIdx: 2, text: "Lunch today at the usual spot?", tip: parseEther("0.001") },
  { senderIdx: 3, text: "Sent you some documentation links on Telegram.", tip: parseEther("0.0015") },
  { senderIdx: 4, text: "Quick reminder: multisig signers need to confirm tx #4.", tip: parseEther("0.0025") },
];

for (const m of day2Messages) {
  const h = await wallets[m.senderIdx].writeContract({
    address: contractAddress,
    abi,
    functionName: "send",
    args: [target, m.text],
    value: m.tip,
    chain: local,
    account: accounts[m.senderIdx],
  });
  await pub.waitForTransactionReceipt({ hash: h });
}

// Warp to today (+24h)
await pub.request({ method: "evm_increaseTime", params: [86400] });
await pub.request({ method: "evm_mine", params: [] });

// Day 3: today (5 messages)
const day3Messages = [
  { senderIdx: 6, text: "Can you review my recent claimcheck campaign?", tip: parseEther("0.002") },
  { senderIdx: 1, text: "Postbox feed looks incredible in cream and red!", tip: parseEther("0.005") },
  { senderIdx: 2, text: "Let's sync up after the block explorer update.", tip: parseEther("0.001") },
  { senderIdx: 3, text: "Everything looks set for the demo today.", tip: parseEther("0.002") },
  { senderIdx: 4, text: "Final check-in before mainnet deployment prep.", tip: parseEther("0.001") },
];

for (const m of day3Messages) {
  const h = await wallets[m.senderIdx].writeContract({
    address: contractAddress,
    abi,
    functionName: "send",
    args: [target, m.text],
    value: m.tip,
    chain: local,
    account: accounts[m.senderIdx],
  });
  await pub.waitForTransactionReceipt({ hash: h });
}

console.log("Account 0 seeded with 14 messages from 5 senders.");

// --- Seed Account 1: Price 0.01 BOT ---
console.log("Setting Account 1 price to 0.01 BOT...");
const p1Tx = await wallets[1].writeContract({
  address: contractAddress,
  abi,
  functionName: "setPrice",
  args: [parseEther("0.01")],
  chain: local,
  account: accounts[1],
});
await pub.waitForTransactionReceipt({ hash: p1Tx });

// --- Seed Account 2: Price 0 BOT (free) ---
console.log("Setting Account 2 price to 0 BOT (free)...");
const p2Tx = await wallets[2].writeContract({
  address: contractAddress,
  abi,
  functionName: "setPrice",
  args: [0n],
  chain: local,
  account: accounts[2],
});
await pub.waitForTransactionReceipt({ hash: p2Tx });

// --- Seed Account 3: Block Account 4 ---
console.log("Setting Account 3 to block Account 4...");
const blockTx = await wallets[3].writeContract({
  address: contractAddress,
  abi,
  functionName: "blockSender",
  args: [accounts[4].address, true],
  chain: local,
  account: accounts[3],
});
await pub.waitForTransactionReceipt({ hash: blockTx });

// Write .env.local
const envLocal = `NEXT_PUBLIC_CHAIN_ID=968
NEXT_PUBLIC_RPC_URL_968=${RPC}
NEXT_PUBLIC_CONTRACT_968=${contractAddress}
NEXT_PUBLIC_DEPLOY_BLOCK_968=${deployBlock}
`;
writeFileSync(".env.local", envLocal);
console.log("Wrote .env.local with deployed contract and block number.");

console.log(`
=====================================================
Postbox local stack ready:
  RPC:       ${RPC} (Chain ID: ${CHAIN_ID})
  Contract:  ${contractAddress}
  Seeded:
    - Account 0 (${accounts[0].address}): 14 messages from 5 senders across 3 days, pending fees ready to collect
    - Account 1 (${accounts[1].address}): Price set to 0.01 BOT
    - Account 2 (${accounts[2].address}): Price set to 0 BOT (free)
    - Account 3 (${accounts[3].address}): Blocked Account 4 (${accounts[4].address})
    - Account 5 (${accounts[5].address}): Clean state (no messages)
=====================================================
`);
