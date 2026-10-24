"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatEther, isAddress, parseEther, type Address, type Hex } from "viem";
import {
  useAccount,
  useChainId,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import PageShell from "@/components/layout/PageShell";
import BotChainGate from "@/components/botchain/BotChainGate";
import Button from "@/components/ui/Button";
import Panel from "@/components/ui/Panel";
import { useToast } from "@/components/ui/Toast";
import { postboxAbi } from "@/lib/botchain/abi";
import { isBotChainId, txUrl } from "@/lib/botchain/chain";
import { getDeployment } from "@/lib/botchain/deployment";
import { describeError } from "@/lib/errors";
import { DEFAULT_PRICE } from "@/lib/limits";
import { shortAddr } from "@/lib/postbox";

export default function SettingsPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const deployment = isBotChainId(chainId) ? getDeployment(chainId) : undefined;
  const { toast } = useToast();

  // --- Price Management State ---
  const [customPriceInput, setCustomPriceInput] = useState("");
  const [selectedPreset, setSelectedPreset] = useState<string>("default");
  const [priceTxHash, setPriceTxHash] = useState<Hex | null>(null);
  const [priceStage, setPriceStage] = useState<"idle" | "signing" | "mining" | "confirmed">("idle");
  const priceSettledRef = useRef<Hex | null>(null);

  // --- Block Management State ---
  const [blockAddrInput, setBlockAddrInput] = useState("");
  const [blockError, setBlockError] = useState("");
  const [blockTxHash, setBlockTxHash] = useState<Hex | null>(null);
  const [blockStage, setBlockStage] = useState<"idle" | "signing" | "mining" | "confirmed">("idle");
  const blockSettledRef = useRef<Hex | null>(null);

  // --- Collect Fees State ---
  const [collectTxHash, setCollectTxHash] = useState<Hex | null>(null);
  const [collectStage, setCollectStage] = useState<"idle" | "signing" | "mining" | "confirmed">("idle");
  const collectSettledRef = useRef<Hex | null>(null);

  // Read current price
  const { data: currentPriceData, refetch: refetchPrice } = useReadContract({
    address: deployment?.address,
    abi: postboxAbi,
    functionName: "priceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(deployment?.address && address && isConnected),
    },
  });

  // Read current pending balance
  const { data: pendingBalanceData, refetch: refetchPending } = useReadContract({
    address: deployment?.address,
    abi: postboxAbi,
    functionName: "pending",
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(deployment?.address && address && isConnected),
    },
  });

  // Check if target address in block field is currently blocked
  const checkBlockTarget = isAddress(blockAddrInput.trim())
    ? (blockAddrInput.trim() as Address)
    : undefined;

  const { data: isTargetBlockedData, refetch: refetchTargetBlocked } = useReadContract({
    address: deployment?.address,
    abi: postboxAbi,
    functionName: "isBlocked",
    args: address && checkBlockTarget ? [address, checkBlockTarget] : undefined,
    query: {
      enabled: Boolean(deployment?.address && address && checkBlockTarget),
    },
  });

  const currentPrice = (currentPriceData as bigint) ?? DEFAULT_PRICE;
  const pendingBalance = (pendingBalanceData as bigint) ?? 0n;
  const isTargetBlocked = Boolean(isTargetBlockedData);

  const { writeContractAsync } = useWriteContract();

  // Price receipt watcher
  const {
    data: priceReceipt,
    isSuccess: isPriceSuccess,
    isError: isPriceError,
  } = useWaitForTransactionReceipt({
    hash: priceTxHash ?? undefined,
  });

  useEffect(() => {
    if (!priceTxHash) return;
    if (priceSettledRef.current === priceTxHash) return;

    if (isPriceSuccess && priceReceipt?.status === "success") {
      priceSettledRef.current = priceTxHash;
      setPriceStage("confirmed");
      refetchPrice();
      toast("success", "Fee updated successfully");
    } else if (isPriceError || (priceReceipt && priceReceipt.status === "reverted")) {
      priceSettledRef.current = priceTxHash;
      setPriceStage("idle");
      setPriceTxHash(null);
      toast("error", "Failed to update fee");
    }
  }, [priceTxHash, isPriceSuccess, isPriceError, priceReceipt, refetchPrice, toast]);

  // Block receipt watcher
  const {
    data: blockReceipt,
    isSuccess: isBlockSuccess,
    isError: isBlockError,
  } = useWaitForTransactionReceipt({
    hash: blockTxHash ?? undefined,
  });

  useEffect(() => {
    if (!blockTxHash) return;
    if (blockSettledRef.current === blockTxHash) return;

    if (isBlockSuccess && blockReceipt?.status === "success") {
      blockSettledRef.current = blockTxHash;
      setBlockStage("confirmed");
      refetchTargetBlocked();
      toast("success", "Block list updated");
    } else if (isBlockError || (blockReceipt && blockReceipt.status === "reverted")) {
      blockSettledRef.current = blockTxHash;
      setBlockStage("idle");
      setBlockTxHash(null);
      toast("error", "Block list update reverted");
    }
  }, [blockTxHash, isBlockSuccess, isBlockError, blockReceipt, refetchTargetBlocked, toast]);

  // Collect receipt watcher
  const {
    data: collectReceipt,
    isSuccess: isCollectSuccess,
    isError: isCollectError,
  } = useWaitForTransactionReceipt({
    hash: collectTxHash ?? undefined,
  });

  useEffect(() => {
    if (!collectTxHash) return;
    if (collectSettledRef.current === collectTxHash) return;

    if (isCollectSuccess && collectReceipt?.status === "success") {
      collectSettledRef.current = collectTxHash;
      setCollectStage("confirmed");
      refetchPending();
      toast("success", "Fees collected successfully");
    } else if (isCollectError || (collectReceipt && collectReceipt.status === "reverted")) {
      collectSettledRef.current = collectTxHash;
      setCollectStage("idle");
      setCollectTxHash(null);
      toast("error", "Withdrawal failed");
    }
  }, [collectTxHash, isCollectSuccess, isCollectError, collectReceipt, refetchPending, toast]);

  // Handle Set Price
  const handleSavePrice = async () => {
    if (!deployment?.address || !isConnected) return;

    let targetPrice = DEFAULT_PRICE;
    if (selectedPreset === "free") {
      targetPrice = 0n;
    } else if (selectedPreset === "0.001") {
      targetPrice = parseEther("0.001");
    } else if (selectedPreset === "0.01") {
      targetPrice = parseEther("0.01");
    } else if (selectedPreset === "custom") {
      try {
        targetPrice = parseEther(customPriceInput.trim());
      } catch {
        toast("error", "Please enter a valid BOT amount.");
        return;
      }
    }

    try {
      setPriceStage("signing");
      const hash = await writeContractAsync({
        address: deployment.address,
        abi: postboxAbi,
        functionName: "setPrice",
        args: [targetPrice],
      });
      setPriceTxHash(hash);
      setPriceStage("mining");
    } catch (err) {
      setPriceStage("idle");
      toast("error", describeError(err));
    }
  };

  // Handle Block / Unblock
  const handleToggleBlock = async (shouldBlock: boolean) => {
    if (!deployment?.address || !isConnected) return;
    if (!checkBlockTarget) {
      setBlockError("Please enter a valid 0x Ethereum address.");
      return;
    }
    setBlockError("");

    try {
      setBlockStage("signing");
      const hash = await writeContractAsync({
        address: deployment.address,
        abi: postboxAbi,
        functionName: "blockSender",
        args: [checkBlockTarget, shouldBlock],
      });
      setBlockTxHash(hash);
      setBlockStage("mining");
    } catch (err) {
      setBlockStage("idle");
      toast("error", describeError(err));
    }
  };

  // Handle Collect
  const handleCollect = async () => {
    if (!deployment?.address || !isConnected || pendingBalance === 0n) return;

    try {
      setCollectStage("signing");
      const hash = await writeContractAsync({
        address: deployment.address,
        abi: postboxAbi,
        functionName: "withdraw",
        args: [],
      });
      setCollectTxHash(hash);
      setCollectStage("mining");
    } catch (err) {
      setCollectStage("idle");
      toast("error", describeError(err));
    }
  };

  return (
    <PageShell>
      <BotChainGate noWalletNote="Connect your wallet to configure your postbox price and blocked senders.">
        <div className="flex flex-col gap-6 py-2">
          {/* Section 1: Collect Pending Fees */}
          <Panel variant="cream" className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="font-serif font-bold text-base text-[#2B0F0D]">
                  Collected Fees
                </h2>
                <p className="text-xs text-[#7A5A52]">
                  Funds sent by visitors to your inbox, held safely until you withdraw.
                </p>
              </div>
              <span className="px-3 py-1 rounded-full bg-[#FFD36B] text-[#2B0F0D] font-mono text-sm font-bold shadow-xs">
                {formatEther(pendingBalance)} BOT
              </span>
            </div>

            {collectStage === "confirmed" && collectTxHash ? (
              <div className="p-3 rounded-xl bg-emerald-100 text-emerald-900 text-xs border border-emerald-300 flex items-center justify-between">
                <span>Withdrawn {formatEther(pendingBalance)} BOT to your wallet!</span>
                <a
                  href={txUrl(chainId, collectTxHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="underline font-medium"
                >
                  View tx
                </a>
              </div>
            ) : (
              <div className="pt-2 flex justify-end">
                <Button
                  variant="primary"
                  size="md"
                  disabled={pendingBalance === 0n || collectStage !== "idle"}
                  loading={collectStage !== "idle"}
                  onClick={handleCollect}
                >
                  {pendingBalance > 0n
                    ? `Collect ${formatEther(pendingBalance)} BOT`
                    : "No fees to collect yet"}
                </Button>
              </div>
            )}
          </Panel>

          {/* Section 2: Pricing Settings */}
          <Panel variant="cream" className="flex flex-col gap-3">
            <div>
              <h2 className="font-serif font-bold text-base text-[#2B0F0D]">
                Required Fee
              </h2>
              <p className="text-xs text-[#7A5A52] mt-0.5">
                Set what it costs to reach you. Free is allowed; so is a lot.
              </p>
            </div>

            <div className="text-xs text-[#2B0F0D] flex items-center gap-1.5 font-medium">
              <span>Current rate:</span>
              <span className="font-bold font-mono text-[#2B0F0D]">
                {formatEther(currentPrice)} BOT
              </span>
            </div>

            {/* Presets Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              {[
                { key: "free", label: "Free (0 BOT)" },
                { key: "0.001", label: "0.001 BOT" },
                { key: "0.01", label: "0.01 BOT" },
                { key: "custom", label: "Custom" },
              ].map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => setSelectedPreset(preset.key)}
                  className={[
                    "py-2 px-3 text-xs rounded-xl font-medium border transition-all cursor-pointer",
                    selectedPreset === preset.key
                      ? "bg-[#FFD36B] text-[#2B0F0D] border-[#E5B842] shadow-xs font-semibold"
                      : "bg-[#F8EEDD] text-[#7A5A52] border-[#E8DCC8] hover:border-[#7A5A52]",
                  ].join(" ")}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {selectedPreset === "custom" && (
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="text"
                  value={customPriceInput}
                  onChange={(e) => setCustomPriceInput(e.target.value)}
                  placeholder="e.g. 0.05"
                  className="flex-1 px-3 py-1.5 text-xs bg-white text-[#2B0F0D] placeholder-[#7A5A52]/50 rounded-xl border border-[#E8DCC8] outline-none"
                />
                <span className="text-xs text-[#7A5A52]">BOT</span>
              </div>
            )}

            {priceStage === "confirmed" && priceTxHash ? (
              <div className="p-3 rounded-xl bg-emerald-100 text-emerald-900 text-xs border border-emerald-300 flex items-center justify-between">
                <span>Fee updated on-chain!</span>
                <a
                  href={txUrl(chainId, priceTxHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="underline font-medium"
                >
                  View tx
                </a>
              </div>
            ) : (
              <div className="pt-2 flex justify-end">
                <Button
                  variant="primary"
                  size="md"
                  disabled={priceStage !== "idle"}
                  loading={priceStage !== "idle"}
                  onClick={handleSavePrice}
                >
                  Update Fee
                </Button>
              </div>
            )}
          </Panel>

          {/* Section 3: Block List Management */}
          <Panel variant="cream" className="flex flex-col gap-3">
            <div>
              <h2 className="font-serif font-bold text-base text-[#2B0F0D]">
                Blocked Senders
              </h2>
              <p className="text-xs text-[#7A5A52] mt-0.5">
                Blocked addresses cannot write to your inbox. They will see a blocked message before posting.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="block-target" className="text-xs font-medium text-[#2B0F0D]">
                Sender Address
              </label>
              <input
                id="block-target"
                type="text"
                value={blockAddrInput}
                onChange={(e) => {
                  setBlockAddrInput(e.target.value);
                  if (blockError) setBlockError("");
                }}
                placeholder="0x… (address to block or unblock)"
                className="px-3 py-2 text-xs bg-white text-[#2B0F0D] placeholder-[#7A5A52]/50 rounded-xl border border-[#E8DCC8] outline-none"
              />
              {blockError && (
                <p className="text-xs text-red-600">{blockError}</p>
              )}
            </div>

            {checkBlockTarget && (
              <div className="text-xs text-[#7A5A52] flex items-center gap-1.5">
                <span>Status for {shortAddr(checkBlockTarget)}:</span>
                <span
                  className={[
                    "font-bold px-1.5 py-0.5 rounded text-[10px]",
                    isTargetBlocked
                      ? "bg-red-100 text-red-800"
                      : "bg-emerald-100 text-emerald-800",
                  ].join(" ")}
                >
                  {isTargetBlocked ? "BLOCKED" : "NOT BLOCKED"}
                </span>
              </div>
            )}

            {blockStage === "confirmed" && blockTxHash ? (
              <div className="p-3 rounded-xl bg-emerald-100 text-emerald-900 text-xs border border-emerald-300 flex items-center justify-between">
                <span>Block list updated!</span>
                <a
                  href={txUrl(chainId, blockTxHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="underline font-medium"
                >
                  View tx
                </a>
              </div>
            ) : (
              <div className="pt-2 flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="md"
                  disabled={!checkBlockTarget || blockStage !== "idle" || !isTargetBlocked}
                  loading={blockStage !== "idle" && !isTargetBlocked}
                  onClick={() => handleToggleBlock(false)}
                  className="text-[#2B0F0D] border-[#E8DCC8] hover:bg-black/5"
                >
                  Unblock
                </Button>
                <Button
                  variant="danger"
                  size="md"
                  disabled={!checkBlockTarget || blockStage !== "idle" || isTargetBlocked}
                  loading={blockStage !== "idle" && isTargetBlocked}
                  onClick={() => handleToggleBlock(true)}
                >
                  Block Sender
                </Button>
              </div>
            )}
          </Panel>
        </div>
      </BotChainGate>
    </PageShell>
  );
}
