/**
 * Hand-written, `as const` ABI for the Postbox contract.
 */
export const postboxAbi = [
  // --- Functions ---
  {
    type: "function",
    name: "send",
    stateMutability: "payable",
    inputs: [
      { name: "to", type: "address" },
      { name: "message", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "setPrice",
    stateMutability: "nonpayable",
    inputs: [{ name: "price", type: "uint96" }],
    outputs: [],
  },
  {
    type: "function",
    name: "blockSender",
    stateMutability: "nonpayable",
    inputs: [
      { name: "who", type: "address" },
      { name: "blocked", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "priceOf",
    stateMutability: "view",
    inputs: [{ name: "who", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "inboxCount",
    stateMutability: "view",
    inputs: [{ name: "who", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "inboxPage",
    stateMutability: "view",
    inputs: [
      { name: "to", type: "address" },
      { name: "offset", type: "uint256" },
      { name: "count", type: "uint256" },
    ],
    outputs: [
      {
        name: "items",
        type: "tuple[]",
        components: [
          { name: "from", type: "address" },
          { name: "blockNumber", type: "uint32" },
          { name: "sentAt", type: "uint64" },
        ],
      },
      { name: "firstIndex", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "isBlocked",
    stateMutability: "view",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "sender", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "pending",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "MAX_MESSAGE_BYTES",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "DEFAULT_PRICE",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "MAX_PAGE",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },

  // --- Events ---
  {
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
  {
    type: "event",
    name: "PriceSet",
    inputs: [
      { name: "who", type: "address", indexed: true },
      { name: "price", type: "uint96", indexed: false },
    ],
  },
  {
    type: "event",
    name: "BlockSet",
    inputs: [
      { name: "recipient", type: "address", indexed: true },
      { name: "sender", type: "address", indexed: true },
      { name: "blocked", type: "bool", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Withdrawn",
    inputs: [
      { name: "who", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },

  // --- Errors ---
  {
    type: "error",
    name: "ZeroAddress",
    inputs: [],
  },
  {
    type: "error",
    name: "CannotMessageSelf",
    inputs: [],
  },
  {
    type: "error",
    name: "BadMessage",
    inputs: [
      { name: "length", type: "uint256" },
      { name: "max", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "SenderBlocked",
    inputs: [
      { name: "to", type: "address" },
      { name: "sender", type: "address" },
    ],
  },
  {
    type: "error",
    name: "PriceNotMet",
    inputs: [
      { name: "price", type: "uint256" },
      { name: "sent", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "NothingToWithdraw",
    inputs: [],
  },
  {
    type: "error",
    name: "TransferFailed",
    inputs: [],
  },
] as const;

export const contractAbi = postboxAbi;
