import { describe, expect, it } from "vitest";
import { describeError, extractRevert, isUserRejection, shortAddress } from "../errors";

describe("errors helper", () => {
  describe("shortAddress", () => {
    it("shortens normal 42-char addresses", () => {
      expect(shortAddress("0x1234567890123456789012345678901234567890")).toBe("0x1234…7890");
    });

    it("returns short string as is", () => {
      expect(shortAddress("0x123")).toBe("0x123");
      expect(shortAddress("")).toBe("");
    });
  });

  describe("isUserRejection", () => {
    it("detects user rejection messages", () => {
      expect(isUserRejection(new Error("User rejected the request."))).toBe(true);
      expect(isUserRejection(new Error("User denied transaction signature."))).toBe(true);
      expect(isUserRejection({ code: 4001, message: "Rejected" })).toBe(true);
      expect(isUserRejection(new Error("Network timeout"))).toBe(false);
      expect(isUserRejection(null)).toBe(false);
    });
  });

  describe("describeError", () => {
    it("handles user rejections", () => {
      expect(describeError(new Error("User rejected the transaction."))).toBe(
        "Transaction cancelled in wallet."
      );
    });

    it("handles PriceNotMet custom error", () => {
      const err = {
        data: {
          errorName: "PriceNotMet",
          args: [1000000000000000n, 500000000000000n],
        },
      };
      expect(describeError(err)).toContain("They charge 0.001 BOT to reach them. You offered 0.0005 BOT.");

      const errNoArgs = {
        data: {
          errorName: "PriceNotMet",
        },
      };
      expect(describeError(errNoArgs)).toBe("Offered value does not meet the recipient's required fee.");
    });

    it("handles SenderBlocked custom error", () => {
      const err = {
        data: {
          errorName: "SenderBlocked",
          args: ["0x1234567890123456789012345678901234567890"],
        },
      };
      expect(describeError(err)).toBe("0x1234…7890 isn't taking messages from this address.");

      const errNoArgs = {
        data: {
          errorName: "SenderBlocked",
        },
      };
      expect(describeError(errNoArgs)).toBe("Recipient isn't taking messages from this address.");
    });

    it("handles CannotMessageSelf custom error", () => {
      const err = { data: { errorName: "CannotMessageSelf" } };
      expect(describeError(err)).toBe("That's your own address.");
    });

    it("handles BadMessage custom error", () => {
      const err = { data: { errorName: "BadMessage", args: [300, 280] } };
      expect(describeError(err)).toBe("Messages run to 280 bytes; this one is 300.");

      const errNoArgs = { data: { errorName: "BadMessage" } };
      expect(describeError(errNoArgs)).toBe("Message length is out of bounds.");
    });

    it("handles NothingToWithdraw custom error", () => {
      const err = { data: { errorName: "NothingToWithdraw" } };
      expect(describeError(err)).toBe("No fees to collect yet.");
    });

    it("handles TransferFailed custom error", () => {
      const err = { data: { errorName: "TransferFailed" } };
      expect(describeError(err)).toBe("Your wallet didn't accept the transfer.");
    });

    it("handles Reentrancy custom error", () => {
      const err = { data: { errorName: "Reentrancy" } };
      expect(describeError(err)).toBe("Reentrancy guard triggered.");
    });

    it("handles ZeroAddress custom error", () => {
      const err = { data: { errorName: "ZeroAddress" } };
      expect(describeError(err)).toBe("Invalid recipient address.");
    });

    it("handles message substrings in general errors", () => {
      expect(describeError(new Error("connector not connected"))).toBe("Please connect your wallet.");
      expect(describeError(new Error("reverted: CannotMessageSelf"))).toBe("That's your own address.");
      expect(describeError(new Error("reverted: SenderBlocked"))).toBe("Recipient isn't taking messages from this address.");
      expect(describeError(new Error("reverted: PriceNotMet"))).toBe("Offered value does not meet the recipient's required fee.");
      expect(describeError(new Error("reverted: NothingToWithdraw"))).toBe("No fees to collect yet.");
    });

    it("truncates very long unknown errors", () => {
      const longMsg = "A".repeat(150);
      const res = describeError(new Error(longMsg));
      expect(res.length).toBeLessThan(125);
      expect(res.endsWith("…")).toBe(true);
    });

    it("falls back to generic message on non-error", () => {
      expect(describeError(null)).toBe("An unexpected error occurred. Please try again.");
    });
  });
});
