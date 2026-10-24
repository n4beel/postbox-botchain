"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  formatEther,
  isAddress,
  parseEther,
  type Address,
  type Hex,
} from "viem";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { postboxAbi } from "@/lib/botchain/abi";
import { isBotChainId } from "@/lib/botchain/chain";
import { getDeployment } from "@/lib/botchain/deployment";
import { describeError } from "@/lib/errors";
import { DEFAULT_PRICE, MAX_MESSAGE_BYTES } from "@/lib/limits";
import {
  byteLength,
  shortAddr,
  validateMessage,
  type MessageItem,
} from "@/lib/postbox";

interface ComposerProps {
  fixedRecipient?: Address;
  onOptimisticSend?: (msg: MessageItem, txHash: Hex) => void;
  onDelivered?: (txHash: Hex) => void;
  onFailed?: (txHash: Hex) => void;
}

export default function Composer({
  fixedRecipient,
  onOptimisticSend,
  onDelivered,
  onFailed,
}: ComposerProps) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const deployment = isBotChainId(chainId) ? getDeployment(chainId) : undefined;
  const { toast } = useToast();

  const [toInput, setToInput] = useState<string>(fixedRecipient || "");
  const [text, setText] = useState<string>("");
  const [tipInput, setTipInput] = useState<string>("");
  const [showTip, setShowTip] = useState(false);
  const [stage, setStage] = useState<"idle" | "wallet" | "mining">("idle");
  const [activeHash, setActiveHash] = useState<Hex | null>(null);

  // Bottom offset for mobile virtual keyboards
  const [bottomOffset, setBottomOffset] = useState<number>(0);

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    const viewport = window.visualViewport;

    const handleResize = () => {
      const offset = window.innerHeight - viewport.height;
      setBottomOffset(Math.max(0, offset));
    };

    viewport.addEventListener("resize", handleResize);
    viewport.addEventListener("scroll", handleResize);
    return () => {
      viewport.removeEventListener("resize", handleResize);
      viewport.removeEventListener("scroll", handleResize);
    };
  }, []);

  const recipient = useMemo<Address | null>(() => {
    const raw = fixedRecipient || toInput.trim();
    return isAddress(raw) ? (raw as Address) : null;
  }, [fixedRecipient, toInput]);

  // Read recipient's required price
  const { data: priceData, refetch: refetchPrice } = useReadContract({
    address: deployment?.address,
    abi: postboxAbi,
    functionName: "priceOf",
    args: recipient ? [recipient] : undefined,
    query: {
      enabled: Boolean(deployment?.address && recipient),
    },
  });

  // Read whether sender is blocked by recipient
  const { data: isBlockedData, refetch: refetchBlocked } = useReadContract({
    address: deployment?.address,
    abi: postboxAbi,
    functionName: "isBlocked",
    args: recipient && address ? [recipient, address] : undefined,
    query: {
      enabled: Boolean(deployment?.address && recipient && address),
    },
  });

  const basePrice = (priceData as bigint) ?? DEFAULT_PRICE;
  const isBlocked = Boolean(isBlockedData);
  const isSelf = Boolean(
    recipient && address && recipient.toLowerCase() === address.toLowerCase()
  );

  const { length: curBytes, valid: msgValid } = validateMessage(text);
  const remaining = MAX_MESSAGE_BYTES - curBytes;

  const totalValue = useMemo<bigint>(() => {
    let val = basePrice;
    if (tipInput.trim()) {
      try {
        const extra = parseEther(tipInput.trim());
        if (extra > 0n) {
          val = basePrice + extra;
        }
      } catch {
        // Invalid tip input, keep base
      }
    }
    return val;
  }, [basePrice, tipInput]);

  const { writeContractAsync } = useWriteContract();
  const {
    data: receipt,
    isLoading: isMining,
    isSuccess: isMined,
    isError: isMineError,
  } = useWaitForTransactionReceipt({
    hash: activeHash ?? undefined,
  });

  const settledHashRef = useRef<Hex | null>(null);

  useEffect(() => {
    if (!activeHash) return;
    if (settledHashRef.current === activeHash) return;

    if (isMined && receipt?.status === "success") {
      settledHashRef.current = activeHash;
      setStage("idle");
      setActiveHash(null);
      setText("");
      setTipInput("");
      onDelivered?.(activeHash);
      toast("success", "Message delivered to postbox");
    } else if (isMineError || (receipt && receipt.status === "reverted")) {
      settledHashRef.current = activeHash;
      setStage("idle");
      setActiveHash(null);
      onFailed?.(activeHash);
      toast("error", "Transaction reverted on chain");
    }
  }, [
    activeHash,
    isMined,
    isMineError,
    receipt?.status,
    onDelivered,
    onFailed,
    toast,
  ]);

  const handlePost = async () => {
    if (!recipient || !msgValid || !deployment?.address || !isConnected) return;
    if (isBlocked || isSelf) return;

    try {
      setStage("wallet");

      const hash = await writeContractAsync({
        address: deployment.address,
        abi: postboxAbi,
        functionName: "send",
        args: [recipient, text],
        value: totalValue,
      });

      setStage("mining");
      setActiveHash(hash);

      // Create optimistic card in feed
      const optimisticMsg: MessageItem = {
        to: recipient,
        from: address!,
        index: -1,
        paid: totalValue,
        message: text,
        sentAt: Math.floor(Date.now() / 1000),
        blockNumber: 0,
        optimistic: true,
      };
      onOptimisticSend?.(optimisticMsg, hash);
    } catch (err) {
      setStage("idle");
      const errSentence = describeError(err);
      toast("error", errSentence);
    }
  };

  if (isBlocked && recipient) {
    return (
      <div
        className="sticky bottom-0 z-30 w-full pt-3 pb-4 bg-[#A8201A]/95 backdrop-blur-md border-t border-[#7C140F]"
        style={{ bottom: `${bottomOffset}px` }}
      >
        <div className="p-4 rounded-xl bg-[#5E0F0C] border border-[#7C140F] text-center text-sm text-[#FFBABA]">
          {shortAddr(recipient)} isn't taking messages from this address.
        </div>
      </div>
    );
  }

  return (
    <div
      className="sticky bottom-0 z-30 w-full pt-2 pb-3 bg-[#A8201A]/95 backdrop-blur-md border-t border-[#7C140F]"
      style={{ bottom: `${bottomOffset}px` }}
    >
      <div className="flex flex-col gap-2">
        {/* Recipient Input (only if not fixed) */}
        {!fixedRecipient && (
          <div className="flex items-center gap-2">
            <label
              htmlFor="recipient-input"
              className="text-xs font-serif text-[#E9C7BC] flex-shrink-0"
            >
              To:
            </label>
            <input
              id="recipient-input"
              type="text"
              value={toInput}
              onChange={(e) => setToInput(e.target.value)}
              placeholder="0x… (recipient address)"
              className="flex-1 px-3 py-1.5 text-xs bg-[#7C140F]/80 text-[#FFF6E8] placeholder-[#E9C7BC]/50 rounded-lg border border-[#6B100B] outline-none focus:border-[#FFD36B]"
            />
          </div>
        )}

        {isSelf && (
          <p className="text-xs text-[#FFD36B] px-1">
            That's your own address.
          </p>
        )}

        {/* Textarea + Live Byte Counter + Send Button */}
        <div className="relative flex items-end gap-2 bg-[#F8EEDD] rounded-2xl p-2.5 sm:p-3 border border-[#E8DCC8] shadow-md">
          <div className="flex-1 flex flex-col">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
              maxLength={350}
              placeholder={
                recipient
                  ? `Write to ${shortAddr(recipient)}. It will be public and permanent.`
                  : "Write a message. It will be public and permanent."
              }
              className="w-full text-sm sm:text-[15px] bg-transparent text-[#2B0F0D] placeholder-[#7A5A52]/60 resize-none outline-none leading-relaxed"
            />

            {/* Bottom info row inside composer: Cost chip & Byte counter */}
            <div className="flex items-center justify-between gap-2 mt-1 text-[11px] text-[#7A5A52]">
              <div className="flex items-center gap-2">
                {recipient && (
                  <span className="px-1.5 py-0.5 rounded bg-[#FFD36B]/60 text-[#2B0F0D] font-medium text-[10px]">
                    Costs {formatEther(basePrice)} BOT · goes to them
                  </span>
                )}
                {recipient && (
                  <button
                    type="button"
                    onClick={() => setShowTip(!showTip)}
                    className="text-[10px] text-[#2B0F0D] underline hover:text-black cursor-pointer"
                  >
                    {showTip ? "Cancel tip" : "+ Tip"}
                  </button>
                )}
              </div>

              <span
                className={[
                  "font-mono text-[10px]",
                  remaining < 0
                    ? "text-red-600 font-bold"
                    : remaining <= 20
                    ? "text-amber-700 font-medium"
                    : "text-[#7A5A52]",
                ].join(" ")}
              >
                {curBytes}/{MAX_MESSAGE_BYTES}
              </span>
            </div>

            {/* Optional extra tip field */}
            {showTip && (
              <div className="mt-2 pt-2 border-t border-[#E8DCC8] flex items-center gap-2">
                <span className="text-[11px] text-[#7A5A52]">Add tip:</span>
                <input
                  type="text"
                  value={tipInput}
                  onChange={(e) => setTipInput(e.target.value)}
                  placeholder="0.005"
                  className="w-20 px-2 py-0.5 text-xs bg-white text-[#2B0F0D] rounded border border-[#E8DCC8] outline-none"
                />
                <span className="text-[11px] text-[#7A5A52]">BOT</span>
              </div>
            )}
          </div>

          {/* Round Send Button */}
          <Button
            type="button"
            variant="round"
            size="md"
            disabled={
              !isConnected ||
              !recipient ||
              !msgValid ||
              isBlocked ||
              isSelf ||
              stage !== "idle"
            }
            loading={stage !== "idle"}
            onClick={handlePost}
            aria-label="Post message"
            className="flex-shrink-0"
          >
            Post
          </Button>
        </div>

        {/* Limits reminder */}
        <p className="text-[10px] text-center text-[#E9C7BC]/60">
          Public and permanent. No encryption, no delete. 280 bytes.
        </p>
      </div>
    </div>
  );
}
