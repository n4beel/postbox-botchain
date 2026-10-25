import { BaseError, ContractFunctionRevertedError, formatEther } from "viem";

export interface RevertDetails {
  errorName?: string;
  args?: readonly unknown[];
}

export function shortAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/**
 * Traverses an error to extract the custom revert error name and arguments.
 */
export function extractRevert(err: unknown): RevertDetails | undefined {
  if (typeof err !== "object" || err === null) return undefined;

  // Direct property check
  if (
    "data" in err &&
    (err as any).data &&
    typeof (err as any).data === "object" &&
    (err as any).data.errorName
  ) {
    return {
      errorName: (err as any).data.errorName,
      args: (err as any).data.args,
    };
  }
  if ("errorName" in err && typeof (err as any).errorName === "string") {
    return {
      errorName: (err as any).errorName,
      args: (err as any).args,
    };
  }

  // If it's a viem BaseError, use walk
  if (err instanceof BaseError) {
    const reverted = err.walk((e) => {
      if (e instanceof ContractFunctionRevertedError) return true;
      if (
        typeof e === "object" &&
        e !== null &&
        "data" in e &&
        Boolean((e as any).data?.errorName)
      )
        return true;
      if (
        typeof e === "object" &&
        e !== null &&
        "errorName" in e &&
        Boolean((e as any).errorName)
      )
        return true;
      return false;
    });

    if (reverted) {
      const errorObj = reverted as any;
      if (errorObj.data?.errorName) {
        return {
          errorName: errorObj.data.errorName,
          args: errorObj.data.args,
        };
      }
      if (errorObj.errorName) {
        return {
          errorName: errorObj.errorName,
          args: errorObj.args,
        };
      }
    }
  }

  return undefined;
}

/**
 * Checks whether an error represents the user rejecting the prompt in their wallet.
 */
export function isUserRejection(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("User rejected") ||
    msg.includes("User denied") ||
    msg.includes("user rejected") ||
    msg.includes("ACTION_REJECTED") ||
    (typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: number }).code === 4001)
  );
}

/**
 * Translates an error into user-facing copy for Postbox.
 */
export function describeError(err: unknown): string {
  if (isUserRejection(err)) {
    return "Transaction cancelled in wallet.";
  }

  const rev = extractRevert(err);
  if (rev?.errorName) {
    switch (rev.errorName) {
      case "PriceNotMet": {
        const price = rev.args?.[0];
        const sent = rev.args?.[1];
        if (price !== undefined && sent !== undefined) {
          return `They charge ${formatEther(BigInt(price as string | number | bigint))} BOT to reach them. You offered ${formatEther(BigInt(sent as string | number | bigint))} BOT.`;
        }
        return "Offered value does not meet the recipient's required fee.";
      }
      case "SenderBlocked": {
        const to = rev.args?.[0];
        return to
          ? `${shortAddress(to as string)} isn't taking messages from this address.`
          : "Recipient isn't taking messages from this address.";
      }
      case "CannotMessageSelf":
        return "That's your own address.";
      case "BadMessage": {
        const len = rev.args?.[0];
        const max = rev.args?.[1] ?? 280;
        return len !== undefined
          ? `Messages run to ${max} bytes; this one is ${len}.`
          : "Message length is out of bounds.";
      }
      case "NothingToWithdraw":
        return "No fees to collect yet.";
      case "TransferFailed":
        return "Your wallet didn't accept the transfer.";
      case "Reentrancy":
        return "Reentrancy guard triggered.";
      case "ZeroAddress":
        return "Invalid recipient address.";
    }
  }

  if (err instanceof Error) {
    const m = err.message;
    if (m.includes("CannotMessageSelf")) {
      return "That's your own address.";
    }
    if (m.includes("SenderBlocked")) {
      return "Recipient isn't taking messages from this address.";
    }
    if (m.includes("PriceNotMet")) {
      return "Offered value does not meet the recipient's required fee.";
    }
    if (m.includes("NothingToWithdraw")) {
      return "No fees to collect yet.";
    }
    if (m.includes("connector not connected")) {
      return "Please connect your wallet.";
    }
    return m.length < 120 ? m : `${m.slice(0, 117)}…`;
  }

  return "An unexpected error occurred. Please try again.";
}
