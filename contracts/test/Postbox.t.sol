// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Test} from "forge-std/Test.sol";
import {Postbox} from "../src/Postbox.sol";

contract RevertingRecipient {
  Postbox internal postbox;

  constructor(Postbox _postbox) {
    postbox = _postbox;
  }

  function withdraw() external {
    postbox.withdraw();
  }

  receive() external payable {
    revert("reject payment");
  }
}

contract ReentrantRecipient {
  Postbox internal postbox;
  bool public reentered;
  bytes public attackRevertData;

  constructor(Postbox _postbox) {
    postbox = _postbox;
  }

  function withdraw() external {
    postbox.withdraw();
  }

  receive() external payable {
    if (!reentered) {
      reentered = true;
      (bool ok, bytes memory data) = address(postbox).call(abi.encodeWithSignature("withdraw()"));
      if (!ok) {
        attackRevertData = data;
      }
    }
  }
}

contract PostboxHandler is Test {
  Postbox public postbox;
  address[] public actors;

  constructor(Postbox _postbox) {
    postbox = _postbox;
    actors.push(address(0x101));
    actors.push(address(0x102));
    actors.push(address(0x103));
    actors.push(address(0x104));
    actors.push(address(0x105));

    for (uint256 i = 0; i < actors.length; i++) {
      vm.deal(actors[i], 100 ether);
    }
  }

  function sendMsg(uint8 fromIdx, uint8 toIdx, uint96 tip) external {
    address from = actors[fromIdx % actors.length];
    address to = actors[toIdx % actors.length];
    if (from == to) return;

    uint256 price = postbox.priceOf(to);
    uint256 value = price + (uint256(tip) % 0.1 ether);

    vm.prank(from);
    try postbox.send{value: value}(to, "ping") {} catch {}
  }

  function setPrice(uint8 actorIdx, uint96 newPrice) external {
    address actor = actors[actorIdx % actors.length];
    vm.prank(actor);
    postbox.setPrice(newPrice % 0.05 ether);
  }

  function withdraw(uint8 actorIdx) external {
    address actor = actors[actorIdx % actors.length];
    vm.prank(actor);
    try postbox.withdraw() {} catch {}
  }
}

contract PostboxTest is Test {
  Postbox internal postbox;
  PostboxHandler internal handler;

  address internal alice = address(0xA11CE);
  address internal bob = address(0xB0B);
  address internal charlie = address(0xCAFE);

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

  function setUp() public {
    postbox = new Postbox();
    vm.warp(1_760_000_000);

    vm.deal(alice, 10 ether);
    vm.deal(bob, 10 ether);
    vm.deal(charlie, 10 ether);

    handler = new PostboxHandler(postbox);
    targetContract(address(handler));
  }

  function test_SendCreditsRecipientAndStoresMeta() public {
    vm.prank(alice);
    postbox.send{value: 0.001 ether}(bob, "Hello Bob");

    assertEq(postbox.pending(bob), 0.001 ether);
    assertEq(postbox.inboxCount(bob), 1);

    (Postbox.Meta[] memory items, uint256 firstIndex) = postbox.inboxPage(bob, 0, 10);
    assertEq(items.length, 1);
    assertEq(firstIndex, 0);
    assertEq(items[0].from, alice);
    assertEq(items[0].blockNumber, uint32(block.number));
    assertEq(items[0].sentAt, uint64(block.timestamp));
  }

  function test_SendEmitsTextAndIndex() public {
    vm.expectEmit(true, true, false, true, address(postbox));
    emit MessageSent(bob, alice, 0, 0.001 ether, "First message");

    vm.prank(alice);
    postbox.send{value: 0.001 ether}(bob, "First message");

    vm.expectEmit(true, true, false, true, address(postbox));
    emit MessageSent(bob, alice, 1, 0.002 ether, "Second message");

    vm.prank(alice);
    postbox.send{value: 0.002 ether}(bob, "Second message");
  }

  function test_DefaultPriceApplies() public view {
    assertEq(postbox.priceOf(bob), 0.001 ether);
  }

  function test_SetPriceZero_AllowsFreeSend() public {
    vm.prank(bob);
    vm.expectEmit(true, false, false, true, address(postbox));
    emit PriceSet(bob, 0);
    postbox.setPrice(0);

    assertEq(postbox.priceOf(bob), 0);

    vm.prank(alice);
    postbox.send{value: 0}(bob, "Free message");

    assertEq(postbox.inboxCount(bob), 1);
    assertEq(postbox.pending(bob), 0);
  }

  function test_PriceNotMet_Args() public {
    vm.prank(bob);
    postbox.setPrice(0.005 ether);

    vm.prank(alice);
    vm.expectRevert(
      abi.encodeWithSelector(Postbox.PriceNotMet.selector, 0.005 ether, 0.002 ether)
    );
    postbox.send{value: 0.002 ether}(bob, "Underpaid");
  }

  function test_Overpay_IsTipToRecipient() public {
    vm.prank(alice);
    postbox.send{value: 0.01 ether}(bob, "Keep the change");

    assertEq(postbox.pending(bob), 0.01 ether);
  }

  function test_CannotMessageSelf() public {
    vm.prank(alice);
    vm.expectRevert(Postbox.CannotMessageSelf.selector);
    postbox.send{value: 0.001 ether}(alice, "Self reflection");
  }

  function test_ZeroAddress() public {
    vm.prank(alice);
    vm.expectRevert(Postbox.ZeroAddress.selector);
    postbox.send{value: 0.001 ether}(address(0), "Void");
  }

  function test_MessageBounds_0_1_280_281() public {
    // 0 bytes reverts
    vm.prank(alice);
    vm.expectRevert(abi.encodeWithSelector(Postbox.BadMessage.selector, 0, 280));
    postbox.send{value: 0.001 ether}(bob, "");

    // 1 byte succeeds
    vm.prank(alice);
    postbox.send{value: 0.001 ether}(bob, "a");
    assertEq(postbox.inboxCount(bob), 1);

    // 280 bytes succeeds
    bytes memory exact280 = new bytes(280);
    for (uint256 i = 0; i < 280; i++) {
      exact280[i] = "x";
    }
    vm.prank(alice);
    postbox.send{value: 0.001 ether}(bob, string(exact280));
    assertEq(postbox.inboxCount(bob), 2);

    // 281 bytes reverts
    bytes memory over281 = new bytes(281);
    for (uint256 i = 0; i < 281; i++) {
      over281[i] = "y";
    }
    vm.prank(alice);
    vm.expectRevert(abi.encodeWithSelector(Postbox.BadMessage.selector, 281, 280));
    postbox.send{value: 0.001 ether}(bob, string(over281));
  }

  function test_BlockedSenderReverts_UnblockWorks() public {
    vm.prank(bob);
    vm.expectEmit(true, true, false, true, address(postbox));
    emit BlockSet(bob, alice, true);
    postbox.blockSender(alice, true);

    assertTrue(postbox.isBlocked(bob, alice));

    vm.prank(alice);
    vm.expectRevert(abi.encodeWithSelector(Postbox.SenderBlocked.selector, bob, alice));
    postbox.send{value: 0.001 ether}(bob, "Can you hear me?");

    // Unblock
    vm.prank(bob);
    vm.expectEmit(true, true, false, true, address(postbox));
    emit BlockSet(bob, alice, false);
    postbox.blockSender(alice, false);

    assertFalse(postbox.isBlocked(bob, alice));

    vm.prank(alice);
    postbox.send{value: 0.001 ether}(bob, "Now I hear you");
    assertEq(postbox.inboxCount(bob), 1);
  }

  function test_BlockIsPerRecipient() public {
    vm.prank(bob);
    postbox.blockSender(alice, true);

    // Alice is blocked by Bob, but Charlie did not block Alice
    vm.prank(alice);
    postbox.send{value: 0.001 ether}(charlie, "Hi Charlie");
    assertEq(postbox.inboxCount(charlie), 1);
  }

  function test_Withdraw_Pays() public {
    vm.prank(alice);
    postbox.send{value: 0.05 ether}(bob, "Generous note");

    assertEq(postbox.pending(bob), 0.05 ether);

    uint256 balBefore = bob.balance;
    vm.prank(bob);
    vm.expectEmit(true, false, false, true, address(postbox));
    emit Withdrawn(bob, 0.05 ether);
    postbox.withdraw();

    assertEq(postbox.pending(bob), 0);
    assertEq(bob.balance - balBefore, 0.05 ether);
  }

  function test_Withdraw_Nothing() public {
    vm.prank(bob);
    vm.expectRevert(Postbox.NothingToWithdraw.selector);
    postbox.withdraw();
  }

  function test_Withdraw_RevertingRecipient_DoesNotBlockSenders() public {
    RevertingRecipient revRecv = new RevertingRecipient(postbox);

    // Senders can send to it without problem
    vm.prank(alice);
    postbox.send{value: 0.01 ether}(address(revRecv), "Will fail on withdraw");
    assertEq(postbox.pending(address(revRecv)), 0.01 ether);

    // When recipient attempts withdraw, contract reverts with TransferFailed, but contract is safe
    vm.expectRevert(Postbox.TransferFailed.selector);
    revRecv.withdraw();

    // Alice can still send another message
    vm.prank(alice);
    postbox.send{value: 0.01 ether}(address(revRecv), "Another message");
    assertEq(postbox.pending(address(revRecv)), 0.02 ether);
  }

  function test_Withdraw_Reentrancy_Reverts() public {
    ReentrantRecipient attacker = new ReentrantRecipient(postbox);
    vm.prank(alice);
    postbox.send{value: 0.01 ether}(address(attacker), "Attack target");
    assertEq(postbox.pending(address(attacker)), 0.01 ether);

    attacker.withdraw();
    assertTrue(attacker.reentered());
    assertEq(bytes4(attacker.attackRevertData()), Postbox.Reentrancy.selector);
  }

  function test_InboxPage_NewestFirst_Offsets_Clamp_Empty() public {
    // Send 10 messages from alice to bob
    for (uint256 i = 0; i < 10; i++) {
      vm.prank(alice);
      postbox.send{value: 0.001 ether}(bob, "Message");
    }

    assertEq(postbox.inboxCount(bob), 10);

    // Offset 0, count 3 -> items 9, 8, 7. firstIndex = 9
    (Postbox.Meta[] memory page1, uint256 firstIndex1) = postbox.inboxPage(bob, 0, 3);
    assertEq(page1.length, 3);
    assertEq(firstIndex1, 9);

    // Offset 3, count 3 -> items 6, 5, 4. firstIndex = 6
    (Postbox.Meta[] memory page2, uint256 firstIndex2) = postbox.inboxPage(bob, 3, 3);
    assertEq(page2.length, 3);
    assertEq(firstIndex2, 6);

    // Offset 8, count 5 -> items 1, 0. Available is 2 items. Clamps to 2. firstIndex = 1
    (Postbox.Meta[] memory page3, uint256 firstIndex3) = postbox.inboxPage(bob, 8, 5);
    assertEq(page3.length, 2);
    assertEq(firstIndex3, 1);

    // Offset >= total (10) -> returns empty array
    (Postbox.Meta[] memory pageEmpty, uint256 firstIndexEmpty) = postbox.inboxPage(bob, 10, 5);
    assertEq(pageEmpty.length, 0);
    assertEq(firstIndexEmpty, 0);
  }

  function test_FirstIndexMath() public {
    // 5 messages: indices 0..4
    for (uint256 i = 0; i < 5; i++) {
      vm.prank(alice);
      postbox.send{value: 0.001 ether}(bob, "Index test");
    }

    (Postbox.Meta[] memory page, uint256 firstIndex) = postbox.inboxPage(bob, 1, 2);
    // Offset 1 means skip newest (index 4), so firstIndex = 3
    assertEq(firstIndex, 3);
    assertEq(page.length, 2);
    // position p = 0 has index firstIndex - 0 = 3
    // position p = 1 has index firstIndex - 1 = 2
  }

  function test_GasSnapshot_Send() public {
    // First message initializes pending storage slot (cold write ~97k)
    vm.prank(alice);
    postbox.send{value: 0.001 ether}(bob, "First message (cold write)");

    // Second message measures warm write
    vm.prank(alice);
    uint256 g0 = gasleft();
    postbox.send{value: 0.001 ether}(bob, "Second message (warm write)");
    uint256 used = g0 - gasleft();

    // Target ~70k–85k
    assertLt(used, 85_000, "Warm send gas exceeded 85k budget");
  }

  function invariant_BalanceEqualsPending() public view {
    uint256 sum = 0;
    for (uint256 i = 0; i < 5; i++) {
      sum += postbox.pending(handler.actors(i));
    }
    assertEq(address(postbox).balance, sum);
  }

  function testFuzz_ManySendersManyRecipients_Conserves(uint8 senderIdx, uint8 recipientIdx, uint96 value) public {
    address sender = address(uint160(0x2000 + (senderIdx % 10)));
    address recipient = address(uint160(0x3000 + (recipientIdx % 10)));

    vm.assume(sender != recipient);
    uint256 price = postbox.priceOf(recipient);
    vm.assume(value >= price);
    vm.assume(value < 100 ether);

    vm.deal(sender, value);

    uint256 balBefore = address(postbox).balance;
    uint256 pendingBefore = postbox.pending(recipient);

    vm.prank(sender);
    postbox.send{value: value}(recipient, "Fuzz message");

    assertEq(address(postbox).balance, balBefore + value);
    assertEq(postbox.pending(recipient), pendingBefore + value);
  }
}
