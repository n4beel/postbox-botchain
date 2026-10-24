import {
  getAddress,
  isAddress,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { postboxAbi } from "./botchain/abi";
import { MAX_MESSAGE_BYTES } from "./limits";

export interface MessageMeta {
  from: Address;
  blockNumber: number;
  sentAt: number;
}

export interface MessageItem {
  to: Address;
  from: Address;
  index: number;
  paid: bigint;
  message: string;
  sentAt: number;
  blockNumber: number;
  optimistic?: boolean;
}

/**
 * In-memory cache for message texts keyed by `${to.toLowerCase()}:${index}`.
 * Since messages on-chain are immutable, caching by (recipient, index) is always safe.
 */
const messageCache = new Map<string, { message: string; paid: bigint }>();

/**
 * Returns exact UTF-8 byte length matching Solidity's `bytes(s).length`.
 */
export function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

/**
 * Validates message length against contract limits.
 */
export function validateMessage(s: string): { valid: boolean; length: number; error?: string } {
  const len = byteLength(s);
  if (len === 0) {
    return { valid: false, length: 0, error: "Message cannot be empty." };
  }
  if (len > MAX_MESSAGE_BYTES) {
    return {
      valid: false,
      length: len,
      error: `Message is ${len} bytes; maximum allowed is ${MAX_MESSAGE_BYTES} bytes.`,
    };
  }
  return { valid: true, length: len };
}

export function shortAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function relativeTime(timestampSecs: number | bigint): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - Number(timestampSecs);

  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(Number(timestampSecs) * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function formatDayLabel(timestampSecs: number | bigint): string {
  const date = new Date(Number(timestampSecs) * 1000);
  const now = new Date();

  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) return "Today";

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (isYesterday) return "Yesterday";

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

/**
 * Groups an array of messages into day buckets ("Today", "Yesterday", "Oct 24").
 */
export function groupByDay(messages: MessageItem[]): Map<string, MessageItem[]> {
  const groups = new Map<string, MessageItem[]>();

  for (const msg of messages) {
    const label = formatDayLabel(msg.sentAt);
    const existing = groups.get(label);
    if (existing) {
      existing.push(msg);
    } else {
      groups.set(label, [msg]);
    }
  }

  return groups;
}

/**
 * Loads a slice of an address's inbox newest-first from contract and single-block event logs.
 */
export async function loadInbox(
  client: PublicClient,
  contractAddress: Address,
  to: Address,
  offset: bigint | number,
  count: bigint | number
): Promise<{ messages: MessageItem[]; total: bigint; firstIndex: bigint }> {
  const total = (await client.readContract({
    address: contractAddress,
    abi: postboxAbi,
    functionName: "inboxCount",
    args: [to],
  })) as bigint;

  if (total === 0n || BigInt(offset) >= total) {
    return { messages: [], total, firstIndex: 0n };
  }

  const [items, firstIndex] = (await client.readContract({
    address: contractAddress,
    abi: postboxAbi,
    functionName: "inboxPage",
    args: [to, BigInt(offset), BigInt(count)],
  })) as readonly [{ from: Address; blockNumber: number; sentAt: bigint }[], bigint];

  const messages: MessageItem[] = [];

  for (let p = 0; p < items.length; p++) {
    const meta = items[p];
    const index = Number(firstIndex) - p;
    const cacheKey = `${to.toLowerCase()}:${index}`;

    let text = "";
    let paid = 0n;

    if (messageCache.has(cacheKey)) {
      const cached = messageCache.get(cacheKey)!;
      text = cached.message;
      paid = cached.paid;
    } else {
      // Query single-block log using Meta.blockNumber
      const logs = await client.getLogs({
        address: contractAddress,
        event: {
          type: "event",
          name: "MessageSent",
          inputs: [
            { name: "to", type: "address", indexed: true },
            { name: "from", type: "address", indexed: true },
            { name: "index", type: "uint256", indexed: false },
            { name: "paid", type: "uint256", indexed: false },
            { name: "message", type: "string", indexed: false },
          ],
        },
        args: {
          to,
        },
        fromBlock: BigInt(meta.blockNumber),
        toBlock: BigInt(meta.blockNumber),
      });

      // Match the specific message with matching index
      for (const log of logs) {
        const args = (log as any).args;
        if (args && Number(args.index) === index) {
          text = (args.message as string) || "";
          paid = BigInt(args.paid || 0n);
          messageCache.set(cacheKey, { message: text, paid });
          break;
        }
      }
    }

    messages.push({
      to,
      from: meta.from,
      index,
      paid,
      message: text,
      sentAt: Number(meta.sentAt),
      blockNumber: meta.blockNumber,
    });
  }

  return { messages, total, firstIndex };
}

/**
 * Loads messages sent by an address by querying MessageSent events filtered by `from`.
 */
export async function loadSent(
  client: PublicClient,
  contractAddress: Address,
  from: Address,
  fromBlock?: bigint
): Promise<MessageItem[]> {
  const logs = await client.getLogs({
    address: contractAddress,
    event: {
      type: "event",
      name: "MessageSent",
      inputs: [
        { name: "to", type: "address", indexed: true },
        { name: "from", type: "address", indexed: true },
        { name: "index", type: "uint256", indexed: false },
        { name: "paid", type: "uint256", indexed: false },
        { name: "message", type: "string", indexed: false },
      ],
    },
    args: {
      from,
    },
    fromBlock: fromBlock ?? 1n,
  });

  const sentList: MessageItem[] = [];

  for (const log of logs) {
    const args = (log as any).args;
    if (args) {
      sentList.push({
        to: args.to,
        from,
        index: Number(args.index),
        paid: BigInt(args.paid || 0n),
        message: args.message || "",
        sentAt: Math.floor(Date.now() / 1000), // fallback or read block if needed
        blockNumber: Number(log.blockNumber || 0n),
      });
    }
  }

  return sentList.reverse(); // newest first
}
