// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

/// @title Postbox
/// @notice An inbox that pays you to read it.
///
/// Every address has a public inbox and a price. To leave a message in someone's inbox you
/// pay their price (default 0.001 BOT); the payment goes to the recipient, who collects it
/// whenever they like. Recipients set their own price (including free), block senders they
/// don't want, and read their inbox in a feed.
///
/// What it deliberately cannot do:
/// - Everything is public and permanent: messages are plaintext on-chain; no encryption,
///   no delete, and no edit.
/// - It cannot verify who a wallet belongs to: messages are from an address, not a human.
/// - Setting the price to zero allows flooding; blocking is per address.
/// - Messages are limited to 280 bytes.
contract Postbox {
  // --- Constants ---
  uint256 public constant MAX_MESSAGE_BYTES = 280;
  uint256 public constant DEFAULT_PRICE = 0.001 ether;
  uint256 public constant MAX_PAGE = 50;

  // --- Structs ---
  struct Meta {
    address from; // 20 bytes
    uint32 blockNumber; // 4 bytes: block of the MessageSent log (~4.29B blocks, ~100 yrs at 0.75s)
    uint64 sentAt; // 8 bytes: block.timestamp
  }

  struct Profile {
    uint96 price; // 12 bytes
    bool priceSet; // 1 byte
  }

  // --- Storage ---
  mapping(address => Meta[]) private _inbox;
  mapping(address => Profile) private _profiles;
  mapping(address => mapping(address => bool)) private _blocked; // recipient -> sender -> blocked
  mapping(address => uint256) public pending; // collectable fees per recipient

  // --- Events ---
  event MessageSent(
    address indexed to,
    address indexed from,
    uint256 index,
    uint256 paid,
    string message
  );
  event PriceSet(address indexed who, uint96 price);
  event BlockSet(address indexed recipient, address indexed sender, bool blocked);
  event Withdrawn(address indexed who, uint256 amount);

  // --- Errors ---
  error ZeroAddress();
  error CannotMessageSelf();
  error BadMessage(uint256 length, uint256 max);
  error SenderBlocked(address to, address sender);
  error PriceNotMet(uint256 price, uint256 sent);
  error NothingToWithdraw();
  error TransferFailed();
  error Reentrancy();

  uint256 private _lock = 1;

  // --- Functions ---

  /// @notice Send a paid message to an address's public postbox
  /// @param to Recipient address
  /// @param message Text content (1 to 280 UTF-8 bytes)
  function send(address to, string calldata message) external payable {
    if (to == address(0)) {
      revert ZeroAddress();
    }
    if (to == msg.sender) {
      revert CannotMessageSelf();
    }

    uint256 len = bytes(message).length;
    if (len == 0 || len > MAX_MESSAGE_BYTES) {
      revert BadMessage(len, MAX_MESSAGE_BYTES);
    }

    if (_blocked[to][msg.sender]) {
      revert SenderBlocked(to, msg.sender);
    }

    uint256 requiredPrice = priceOf(to);
    if (msg.value < requiredPrice) {
      revert PriceNotMet(requiredPrice, msg.value);
    }

    // All of msg.value credited to recipient; overpayment is a voluntary tip
    pending[to] += msg.value;

    uint256 index = _inbox[to].length;
    // forge-lint: disable-next-line(unsafe-typecast)
    uint32 blockNum = uint32(block.number);
    // forge-lint: disable-next-line(unsafe-typecast)
    uint64 timestamp = uint64(block.timestamp);

    _inbox[to].push(Meta({from: msg.sender, blockNumber: blockNum, sentAt: timestamp}));

    emit MessageSent(to, msg.sender, index, msg.value, message);
  }

  /// @notice Set the price required to message your address
  /// @param price Cost in wei (0 is allowed)
  function setPrice(uint96 price) external {
    _profiles[msg.sender] = Profile({price: price, priceSet: true});
    emit PriceSet(msg.sender, price);
  }

  /// @notice Block or unblock a sender from leaving messages in your postbox
  /// @param who Sender address
  /// @param blocked True to block, false to unblock
  function blockSender(address who, bool blocked) external {
    _blocked[msg.sender][who] = blocked;
    emit BlockSet(msg.sender, who, blocked);
  }

  /// @notice Collect accumulated messaging fees
  function withdraw() external {
    if (_lock != 1) {
      revert Reentrancy();
    }
    _lock = 2;

    uint256 amount = pending[msg.sender];
    if (amount == 0) {
      _lock = 1;
      revert NothingToWithdraw();
    }

    pending[msg.sender] = 0; // effects before interactions

    emit Withdrawn(msg.sender, amount);

    (bool ok, ) = msg.sender.call{value: amount}("");
    if (!ok) {
      revert TransferFailed();
    }

    _lock = 1;
  }

  /// @notice Price required to message an address in wei
  /// @param who Address to check
  function priceOf(address who) public view returns (uint256) {
    Profile storage p = _profiles[who];
    return p.priceSet ? p.price : DEFAULT_PRICE;
  }

  /// @notice Total count of messages received by an address
  /// @param who Address to check
  function inboxCount(address who) external view returns (uint256) {
    return _inbox[who].length;
  }

  /// @notice Read a slice of an inbox newest-first
  /// @param to Recipient address
  /// @param offset Offset from the newest message (0 = newest)
  /// @param count Maximum number of items to return (clamped to MAX_PAGE)
  /// @return items Array of metadata entries
  /// @return firstIndex The inbox index of items[0]; position p has index (firstIndex - p)
  function inboxPage(
    address to,
    uint256 offset,
    uint256 count
  ) external view returns (Meta[] memory items, uint256 firstIndex) {
    uint256 total = _inbox[to].length;
    if (offset >= total) {
      return (new Meta[](0), 0);
    }

    firstIndex = (total - 1) - offset;
    uint256 available = firstIndex + 1;
    uint256 clampedCount = count > MAX_PAGE ? MAX_PAGE : count;
    uint256 actualCount = clampedCount > available ? available : clampedCount;

    items = new Meta[](actualCount);
    for (uint256 p = 0; p < actualCount; p++) {
      items[p] = _inbox[to][firstIndex - p];
    }

    return (items, firstIndex);
  }

  /// @notice Check if a sender is blocked by a recipient
  /// @param recipient Address whose inbox is being checked
  /// @param sender Address trying to send
  function isBlocked(address recipient, address sender) external view returns (bool) {
    return _blocked[recipient][sender];
  }
}
