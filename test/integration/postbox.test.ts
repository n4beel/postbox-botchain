import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  BaseError,
  createPublicClient,
  createWalletClient,
  defineChain,
  getAddress,
  http,
  parseEther,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { postboxAbi } from "@/lib/botchain/abi";
import {
  byteLength,
  loadInbox,
  loadSent,
  validateMessage,
} from "@/lib/postbox";
import { DEFAULT_PRICE, MAX_MESSAGE_BYTES, MAX_PAGE } from "@/lib/limits";

const PORT = 8605;
const RPC = `http://127.0.0.1:${PORT}`;
const CHAIN_ID = 968 as const;

const MNEMONIC = "test test test test test test test test test test test junk";
const accounts = Array.from({ length: 8 }, (_, i) =>
  mnemonicToAccount(MNEMONIC, { addressIndex: i })
);

const local = defineChain({
  id: CHAIN_ID,
  name: "anvil",
  nativeCurrency: { name: "Test BOT", symbol: "tBOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

let node: ChildProcess;
let publicClient: PublicClient;
let wallets: WalletClient[];
let contractAddress: Address;

function revertDetails(err: unknown): { errorName?: string; args?: readonly unknown[] } | undefined {
  if (!(err instanceof BaseError)) return undefined;
  const found = err.walk(
    (e) =>
      typeof e === "object" &&
      e !== null &&
      "data" in e &&
      Boolean((e as { data?: { errorName?: string } }).data?.errorName)
  ) as { data?: { errorName?: string; args?: readonly unknown[] } } | null;
  return found?.data;
}

beforeAll(async () => {
  node = spawn("anvil", ["--port", String(PORT), "--chain-id", String(CHAIN_ID), "--silent"], {
    stdio: ["ignore", "ignore", "inherit"],
  });

  publicClient = createPublicClient({ chain: local, transport: http() }) as PublicClient;
  wallets = accounts.map((acc) =>
    createWalletClient({ account: acc, chain: local, transport: http() })
  );

  for (let i = 0; ; i++) {
    try {
      await publicClient.getBlockNumber();
      break;
    } catch {
      if (i > 100) throw new Error(`anvil never answered on ${RPC}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  const artifact = JSON.parse(
    readFileSync("contracts/out/Postbox.sol/Postbox.json", "utf8")
  ) as { abi: any; bytecode: { object: Hex } };

  const hash = await wallets[0].deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode.object,
    args: [],
    chain: local,
    account: accounts[0],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  contractAddress = receipt.contractAddress!;
});

afterAll(async () => {
  if (node) {
    node.kill("SIGTERM");
  }
});

describe("Postbox integration suite", () => {
  it("deploys cleanly", async () => {
    expect(contractAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
    const code = await publicClient.getBytecode({ address: contractAddress });
    expect(code).toBeDefined();
    expect(code!.length).toBeGreaterThan(2);
  });

  it("sends a message, returns meta via inboxPage, and loads log content", async () => {
    const to = accounts[1].address;
    const from = accounts[0].address;
    const text = "Hello from account 0!";

    const hash = await wallets[0].writeContract({
      address: contractAddress,
      abi: postboxAbi,
      functionName: "send",
      args: [to, text],
      value: DEFAULT_PRICE,
      chain: local,
      account: accounts[0],
    });
    await publicClient.waitForTransactionReceipt({ hash });

    const total = (await publicClient.readContract({
      address: contractAddress,
      abi: postboxAbi,
      functionName: "inboxCount",
      args: [to],
    })) as bigint;
    expect(total).toBe(1n);

    const { messages, firstIndex } = await loadInbox(
      publicClient,
      contractAddress,
      to,
      0,
      10
    );
    expect(firstIndex).toBe(0n);
    expect(messages.length).toBe(1);
    expect(messages[0].to.toLowerCase()).toBe(to.toLowerCase());
    expect(messages[0].from.toLowerCase()).toBe(from.toLowerCase());
    expect(messages[0].index).toBe(0);
    expect(messages[0].message).toBe(text);
    expect(messages[0].paid).toBe(DEFAULT_PRICE);
  });

  it("resolves exact text when multiple messages share a single block", async () => {
    const recipient = accounts[2].address;

    // Turn automine off
    await (publicClient as any).request({ method: "evm_setAutomine", params: [false] });

    // Send 3 messages in the same block from different accounts
    const m1 = "First in block";
    const m2 = "Second in block";
    const m3 = "Third in block";

    const h1 = await wallets[0].writeContract({
      address: contractAddress,
      abi: postboxAbi,
      functionName: "send",
      args: [recipient, m1],
      value: DEFAULT_PRICE,
      chain: local,
      account: accounts[0],
    });
    const h2 = await wallets[1].writeContract({
      address: contractAddress,
      abi: postboxAbi,
      functionName: "send",
      args: [recipient, m2],
      value: DEFAULT_PRICE,
      chain: local,
      account: accounts[1],
    });
    const h3 = await wallets[3].writeContract({
      address: contractAddress,
      abi: postboxAbi,
      functionName: "send",
      args: [recipient, m3],
      value: DEFAULT_PRICE,
      chain: local,
      account: accounts[3],
    });

    // Mine one block containing all 3 transactions
    await (publicClient as any).request({ method: "evm_mine", params: [] });
    // Turn automine back on
    await (publicClient as any).request({ method: "evm_setAutomine", params: [true] });

    const [r1, r2, r3] = await Promise.all([
      publicClient.waitForTransactionReceipt({ hash: h1 }),
      publicClient.waitForTransactionReceipt({ hash: h2 }),
      publicClient.waitForTransactionReceipt({ hash: h3 }),
    ]);

    expect(r1.blockNumber).toBe(r2.blockNumber);
    expect(r2.blockNumber).toBe(r3.blockNumber);

    const { messages, total, firstIndex } = await loadInbox(
      publicClient,
      contractAddress,
      recipient,
      0,
      10
    );

    expect(total).toBe(3n);
    expect(firstIndex).toBe(2n);
    expect(messages.length).toBe(3);

    // Newest first: index 2 should be m3, index 1 m2, index 0 m1
    expect(messages[0].index).toBe(2);
    expect(messages[0].message).toBe(m3);
    expect(messages[0].from.toLowerCase()).toBe(accounts[3].address.toLowerCase());

    expect(messages[1].index).toBe(1);
    expect(messages[1].message).toBe(m2);
    expect(messages[1].from.toLowerCase()).toBe(accounts[1].address.toLowerCase());

    expect(messages[2].index).toBe(0);
    expect(messages[2].message).toBe(m1);
    expect(messages[2].from.toLowerCase()).toBe(accounts[0].address.toLowerCase());
  });

  it("respects pagination offsets and firstIndex ordering", async () => {
    const recipient = accounts[2].address;

    // Load with offset 1, count 1
    const { messages, firstIndex } = await loadInbox(
      publicClient,
      contractAddress,
      recipient,
      1,
      1
    );

    expect(messages.length).toBe(1);
    expect(firstIndex).toBe(1n);
    expect(messages[0].index).toBe(1);
    expect(messages[0].message).toBe("Second in block");
  });

  it("handles custom prices and reverts PriceNotMet with args", async () => {
    const creator = accounts[4];
    const customPrice = parseEther("0.05");

    // Account 4 sets custom price
    const hash = await wallets[4].writeContract({
      address: contractAddress,
      abi: postboxAbi,
      functionName: "setPrice",
      args: [customPrice],
      chain: local,
      account: creator,
    });
    await publicClient.waitForTransactionReceipt({ hash });

    const currentPrice = (await publicClient.readContract({
      address: contractAddress,
      abi: postboxAbi,
      functionName: "priceOf",
      args: [creator.address],
    })) as bigint;
    expect(currentPrice).toBe(customPrice);

    // Sender offers default price (0.001) instead of 0.05 -> reverts PriceNotMet(price, sent)
    await expect(
      wallets[0].writeContract({
        address: contractAddress,
        abi: postboxAbi,
        functionName: "send",
        args: [creator.address, "Underpriced message"],
        value: DEFAULT_PRICE,
        chain: local,
        account: accounts[0],
      })
    ).rejects.toSatisfy((err: unknown) => {
      const rev = revertDetails(err);
      expect(rev?.errorName).toBe("PriceNotMet");
      expect(BigInt(rev?.args?.[0] as string)).toBe(customPrice);
      expect(BigInt(rev?.args?.[1] as string)).toBe(DEFAULT_PRICE);
      return true;
    });

    // Sender pays full custom price -> succeeds
    const sendHash = await wallets[0].writeContract({
      address: contractAddress,
      abi: postboxAbi,
      functionName: "send",
      args: [creator.address, "Paid full price"],
      value: customPrice,
      chain: local,
      account: accounts[0],
    });
    const sendReceipt = await publicClient.waitForTransactionReceipt({ hash: sendHash });
    expect(sendReceipt.status).toBe("success");
  });

  it("enforces sender blocking and reverts SenderBlocked with args", async () => {
    const recipient = accounts[5];
    const blockedSender = accounts[6];

    // Recipient blocks sender
    const blockHash = await wallets[5].writeContract({
      address: contractAddress,
      abi: postboxAbi,
      functionName: "blockSender",
      args: [blockedSender.address, true],
      chain: local,
      account: recipient,
    });
    await publicClient.waitForTransactionReceipt({ hash: blockHash });

    const isBlocked = (await publicClient.readContract({
      address: contractAddress,
      abi: postboxAbi,
      functionName: "isBlocked",
      args: [recipient.address, blockedSender.address],
    })) as boolean;
    expect(isBlocked).toBe(true);

    // Blocked sender attempts to send
    await expect(
      wallets[6].writeContract({
        address: contractAddress,
        abi: postboxAbi,
        functionName: "send",
        args: [recipient.address, "Spam message"],
        value: DEFAULT_PRICE,
        chain: local,
        account: blockedSender,
      })
    ).rejects.toSatisfy((err: unknown) => {
      const rev = revertDetails(err);
      expect(rev?.errorName).toBe("SenderBlocked");
      expect(getAddress(rev?.args?.[0] as string)).toBe(getAddress(recipient.address));
      return true;
    });

    // Unblock sender
    const unblockHash = await wallets[5].writeContract({
      address: contractAddress,
      abi: postboxAbi,
      functionName: "blockSender",
      args: [blockedSender.address, false],
      chain: local,
      account: recipient,
    });
    await publicClient.waitForTransactionReceipt({ hash: unblockHash });

    // Now message succeeds
    const okHash = await wallets[6].writeContract({
      address: contractAddress,
      abi: postboxAbi,
      functionName: "send",
      args: [recipient.address, "Unblocked message"],
      value: DEFAULT_PRICE,
      chain: local,
      account: blockedSender,
    });
    const okReceipt = await publicClient.waitForTransactionReceipt({ hash: okHash });
    expect(okReceipt.status).toBe("success");
  });

  it("credits overpayment to pending balance and allows withdraw", async () => {
    const recipient = accounts[7];
    const initialPending = (await publicClient.readContract({
      address: contractAddress,
      abi: postboxAbi,
      functionName: "pending",
      args: [recipient.address],
    })) as bigint;
    expect(initialPending).toBe(0n);

    const tipAmount = parseEther("0.02"); // default price is 0.001 ether, sending 0.02 is overpayment
    const sendHash = await wallets[0].writeContract({
      address: contractAddress,
      abi: postboxAbi,
      functionName: "send",
      args: [recipient.address, "Generous tip!"],
      value: tipAmount,
      chain: local,
      account: accounts[0],
    });
    await publicClient.waitForTransactionReceipt({ hash: sendHash });

    const pendingAfter = (await publicClient.readContract({
      address: contractAddress,
      abi: postboxAbi,
      functionName: "pending",
      args: [recipient.address],
    })) as bigint;
    expect(pendingAfter).toBe(tipAmount);

    // Recipient withdraws
    const recipientBalBefore = await publicClient.getBalance({ address: recipient.address });

    const withdrawHash = await wallets[7].writeContract({
      address: contractAddress,
      abi: postboxAbi,
      functionName: "withdraw",
      args: [],
      chain: local,
      account: recipient,
    });
    const withdrawReceipt = await publicClient.waitForTransactionReceipt({ hash: withdrawHash });
    const gasUsed = withdrawReceipt.gasUsed * withdrawReceipt.effectiveGasPrice;

    const recipientBalAfter = await publicClient.getBalance({ address: recipient.address });
    expect(recipientBalAfter + gasUsed - recipientBalBefore).toBe(tipAmount);

    const pendingFinal = (await publicClient.readContract({
      address: contractAddress,
      abi: postboxAbi,
      functionName: "pending",
      args: [recipient.address],
    })) as bigint;
    expect(pendingFinal).toBe(0n);

    // Second withdraw reverts NothingToWithdraw
    await expect(
      wallets[7].writeContract({
        address: contractAddress,
        abi: postboxAbi,
        functionName: "withdraw",
        args: [],
        chain: local,
        account: recipient,
      })
    ).rejects.toSatisfy((err: unknown) => {
      const rev = revertDetails(err);
      expect(rev?.errorName).toBe("NothingToWithdraw");
      return true;
    });
  });

  it("reverts on CannotMessageSelf and BadMessage bounds", async () => {
    // Cannot message self
    await expect(
      wallets[0].writeContract({
        address: contractAddress,
        abi: postboxAbi,
        functionName: "send",
        args: [accounts[0].address, "Talking to myself"],
        value: DEFAULT_PRICE,
        chain: local,
        account: accounts[0],
      })
    ).rejects.toSatisfy((err: unknown) => {
      const rev = revertDetails(err);
      expect(rev?.errorName).toBe("CannotMessageSelf");
      return true;
    });

    // Empty message
    await expect(
      wallets[0].writeContract({
        address: contractAddress,
        abi: postboxAbi,
        functionName: "send",
        args: [accounts[1].address, ""],
        value: DEFAULT_PRICE,
        chain: local,
        account: accounts[0],
      })
    ).rejects.toSatisfy((err: unknown) => {
      const rev = revertDetails(err);
      expect(rev?.errorName).toBe("BadMessage");
      expect(Number(rev?.args?.[0])).toBe(0);
      expect(Number(rev?.args?.[1])).toBe(MAX_MESSAGE_BYTES);
      return true;
    });

    // 281-byte message
    const tooLong = "x".repeat(281);
    await expect(
      wallets[0].writeContract({
        address: contractAddress,
        abi: postboxAbi,
        functionName: "send",
        args: [accounts[1].address, tooLong],
        value: DEFAULT_PRICE,
        chain: local,
        account: accounts[0],
      })
    ).rejects.toSatisfy((err: unknown) => {
      const rev = revertDetails(err);
      expect(rev?.errorName).toBe("BadMessage");
      expect(Number(rev?.args?.[0])).toBe(281);
      expect(Number(rev?.args?.[1])).toBe(MAX_MESSAGE_BYTES);
      return true;
    });
  });

  it("queries sent messages via loadSent", async () => {
    const sent = await loadSent(publicClient, contractAddress, accounts[0].address);
    expect(sent.length).toBeGreaterThan(0);
    expect(sent[0].from.toLowerCase()).toBe(accounts[0].address.toLowerCase());
  });

  it("confirms constants agreement between TS and contract", () => {
    expect(MAX_MESSAGE_BYTES).toBe(280);
    expect(DEFAULT_PRICE).toBe(1_000_000_000_000_000n);
    expect(MAX_PAGE).toBe(50);
  });
});
