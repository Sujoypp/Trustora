// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {TrustoraPayV2} from "../TrustoraPayV2.sol";

// ───────────────────────────── Mock tokens ─────────────────────────────

abstract contract TP2Base {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 public totalSupply;

    function mint(address to, uint256 a) external {
        balanceOf[to] += a;
        totalSupply += a;
    }

    function approve(address s, uint256 a) external returns (bool) {
        allowance[msg.sender][s] = a;
        return true;
    }

    function _spend(address from, uint256 a) internal {
        uint256 al = allowance[from][msg.sender];
        require(al >= a, "allowance");
        if (al != type(uint256).max) allowance[from][msg.sender] = al - a;
    }

    function _move(address from, address to, uint256 a) internal virtual {
        require(balanceOf[from] >= a, "balance");
        balanceOf[from] -= a;
        balanceOf[to] += a;
    }
}

/// Standard token: returns true.
contract TP2Token is TP2Base {
    function transfer(address to, uint256 a) public virtual returns (bool) {
        _move(msg.sender, to, a);
        return true;
    }

    function transferFrom(address f, address t, uint256 a) public virtual returns (bool) {
        _spend(f, a);
        _move(f, t, a);
        return true;
    }
}

/// USDT-style token: no return data.
contract TP2NoReturn is TP2Base {
    function transfer(address to, uint256 a) external {
        _move(msg.sender, to, a);
    }

    function transferFrom(address f, address t, uint256 a) external {
        _spend(f, a);
        _move(f, t, a);
    }
}

/// Returns false and moves nothing.
contract TP2False is TP2Base {
    function transfer(address, uint256) external pure returns (bool) {
        return false;
    }

    function transferFrom(address, address, uint256) external pure returns (bool) {
        return false;
    }
}

/// Burns 1% of every transfer.
contract TP2Fee is TP2Token {
    function _move(address from, address to, uint256 a) internal override {
        require(balanceOf[from] >= a, "balance");
        uint256 fee = a / 100;
        balanceOf[from] -= a;
        balanceOf[to] += a - fee;
        totalSupply -= fee;
    }
}

/// Reverts on any transfer touching a blocked address.
contract TP2Block is TP2Token {
    mapping(address => bool) public blocked;

    function setBlocked(address a, bool b) external {
        blocked[a] = b;
    }

    function _move(address from, address to, uint256 a) internal override {
        require(!blocked[from] && !blocked[to], "blocked");
        super._move(from, to, a);
    }
}

/// Calls back into `target` with `payload` once (when armed) at the start of transfer/transferFrom.
contract TP2Reentrant is TP2Token {
    address public target;
    bytes public payload;
    bool public armed;
    bool public lastOk;
    bytes public lastRet;
    uint256 public hits;

    function arm(address t, bytes calldata p) external {
        target = t;
        payload = p;
        armed = true;
    }

    function _hook() internal {
        if (armed) {
            armed = false;
            hits++;
            (lastOk, lastRet) = target.call(payload);
        }
    }

    function transfer(address to, uint256 a) public override returns (bool) {
        _hook();
        return super.transfer(to, a);
    }

    function transferFrom(address f, address t, uint256 a) public override returns (bool) {
        _hook();
        return super.transferFrom(f, t, a);
    }
}

/// Native recipient that calls back into `target` once on receive.
contract TP2ReentrantReceiver {
    address public target;
    bytes public payload;
    bool public lastOk;
    bytes public lastRet;
    uint256 public hits;

    function arm(address t, bytes calldata p) external {
        target = t;
        payload = p;
    }

    receive() external payable {
        hits++;
        (lastOk, lastRet) = target.call(payload);
    }
}

/// Deposits fine, but payouts (transfer) return false.
contract TP2PayoutFalse is TP2Token {
    function transfer(address, uint256) public pure override returns (bool) {
        return false;
    }
}

/// Has code but only an empty fallback (balanceOf returns no data).
contract TP2EmptyFallback {
    fallback() external {}
}

// ───────────────────────────── Tests ─────────────────────────────

contract TrustoraPayV2Test is Test {
    TrustoraPayV2 internal pay;
    TP2Token internal usdc;

    address internal alice = makeAddr("alice"); // sender
    address internal bob = makeAddr("bob"); // recipient
    address internal carol = makeAddr("carol"); // third party

    uint256 internal constant AMT = 100e6;
    uint256 internal constant T0 = 1_700_000_000;
    uint256 internal constant RD = 180 days;

    uint8 internal constant REL = 0;
    uint8 internal constant CLAIM = 1;
    uint8 internal constant CLAIM_TO = 2;
    uint8 internal constant REFUND = 3;
    uint8 internal constant RECOVER = 4;

    event PaymentSent(
        address indexed sender,
        address indexed recipient,
        address indexed token,
        uint256 amount,
        string note,
        uint256 timestamp
    );
    event EscrowCreated(
        uint256 indexed escrowId,
        address indexed sender,
        address indexed recipient,
        address tokenAddress,
        uint256 amount,
        uint256 releaseTime,
        string memo
    );
    event EscrowReleased(uint256 indexed escrowId, address indexed sender, address indexed recipient, uint256 amount);
    event EscrowClaimed(uint256 indexed escrowId, address indexed recipient, uint256 amount);
    event EscrowPayoutRedirected(uint256 indexed escrowId, address indexed to);
    event EscrowRefunded(uint256 indexed escrowId, address indexed sender, uint256 amount);

    function setUp() public virtual {
        vm.warp(T0);
        pay = new TrustoraPayV2();
        usdc = new TP2Token();
        _fund(usdc, alice);
        _fund(usdc, bob);
        _fund(usdc, carol);
        vm.deal(alice, 10 ether);
    }

    // ── helpers ──
    function _fund(TP2Base t, address who) internal {
        t.mint(who, 1_000_000e6);
        vm.prank(who);
        t.approve(address(pay), type(uint256).max);
    }

    function _s(uint256 n) internal pure returns (string memory) {
        bytes memory b = new bytes(n);
        for (uint256 i; i < n; i++) b[i] = "a";
        return string(b);
    }

    function _create() internal returns (uint256) {
        return _createWith(address(usdc), 24);
    }

    function _createWith(address token, uint256 hrs) internal returns (uint256 id) {
        vm.prank(alice);
        id = pay.createEscrow(bob, token, AMT, hrs, "memo");
    }

    function _rt(uint256 id) internal view returns (uint256) {
        return pay.getEscrow(id).releaseTime;
    }

    function _status(uint256 id) internal view returns (TrustoraPayV2.EscrowStatus) {
        return pay.getEscrow(id).status;
    }

    // ═════════════════════════ sendNative ═════════════════════════

    function test_SendNative_SuccessAndEvent() public {
        vm.expectEmit(true, true, true, true, address(pay));
        emit PaymentSent(alice, bob, address(0), 1 ether, "hi", block.timestamp);
        vm.prank(alice);
        pay.sendNative{value: 1 ether}(payable(bob), "hi");
        assertEq(bob.balance, 1 ether);
        assertEq(alice.balance, 9 ether);
        assertEq(address(pay).balance, 0);
    }

    function test_SendNative_EmptyNoteOk() public {
        vm.prank(alice);
        pay.sendNative{value: 1}(payable(bob), "");
        assertEq(bob.balance, 1);
    }

    function test_SendNative_RevertZeroRecipient() public {
        vm.prank(alice);
        vm.expectRevert(TrustoraPayV2.ZeroRecipient.selector);
        pay.sendNative{value: 1}(payable(address(0)), "");
    }

    function test_SendNative_RevertSelfRecipient() public {
        vm.prank(alice);
        vm.expectRevert(TrustoraPayV2.SelfRecipient.selector);
        pay.sendNative{value: 1}(payable(address(pay)), "");
    }

    function test_SendNative_RevertZeroAmount() public {
        vm.prank(alice);
        vm.expectRevert(TrustoraPayV2.ZeroAmount.selector);
        pay.sendNative{value: 0}(payable(bob), "");
    }

    function test_SendNative_NoteLimit() public {
        vm.prank(alice);
        pay.sendNative{value: 1}(payable(bob), _s(280));
        assertEq(bob.balance, 1);
        string memory long = _s(281);
        vm.prank(alice);
        vm.expectRevert(TrustoraPayV2.NoteTooLong.selector);
        pay.sendNative{value: 1}(payable(bob), long);
    }

    function test_SendNative_NoteLimitIsBytesNotChars() public {
        // 141 two-byte characters = 282 bytes
        bytes memory b = new bytes(282);
        for (uint256 i; i < 282; i += 2) {
            b[i] = 0xc3;
            b[i + 1] = 0xa9;
        }
        string memory s = string(b);
        vm.prank(alice);
        vm.expectRevert(TrustoraPayV2.NoteTooLong.selector);
        pay.sendNative{value: 1}(payable(bob), s);
    }

    function test_SendNative_RevertNativeTransferFailed() public {
        // the token mock has no receive() so the value call fails
        vm.prank(alice);
        vm.expectRevert(TrustoraPayV2.NativeTransferFailed.selector);
        pay.sendNative{value: 1}(payable(address(usdc)), "");
        assertEq(alice.balance, 10 ether);
    }

    function test_SendNative_ToContractWithReceive() public {
        TP2ReentrantReceiver r = new TP2ReentrantReceiver();
        r.arm(address(pay), abi.encodeCall(pay.escrowIdsOf, (alice))); // harmless view call
        vm.prank(alice);
        pay.sendNative{value: 5}(payable(address(r)), "");
        assertEq(address(r).balance, 5);
        assertEq(r.hits(), 1);
    }

    // ═════════════════════════ sendToken ═════════════════════════

    function test_SendToken_SuccessAndEvent() public {
        uint256 a0 = usdc.balanceOf(alice);
        vm.expectEmit(true, true, true, true, address(pay));
        emit PaymentSent(alice, carol, address(usdc), 50e6, "note", block.timestamp);
        vm.prank(alice);
        pay.sendToken(address(usdc), carol, 50e6, "note");
        assertEq(usdc.balanceOf(alice), a0 - 50e6);
        assertEq(usdc.balanceOf(carol), 1_000_000e6 + 50e6);
        assertEq(usdc.balanceOf(address(pay)), 0);
    }

    function test_SendToken_NoReturnTokenSucceeds() public {
        TP2NoReturn t = new TP2NoReturn();
        _fund(t, alice);
        vm.expectEmit(true, true, true, true, address(pay));
        emit PaymentSent(alice, bob, address(t), 7, "", block.timestamp);
        vm.prank(alice);
        pay.sendToken(address(t), bob, 7, "");
        assertEq(t.balanceOf(bob), 7);
    }

    function test_SendToken_FalseReturnReverts() public {
        TP2False t = new TP2False();
        vm.prank(alice);
        vm.expectRevert(TrustoraPayV2.TokenTransferFailed.selector);
        pay.sendToken(address(t), bob, 7, "");
    }

    function test_SendToken_FeeOnTransferPassesThrough() public {
        TP2Fee t = new TP2Fee();
        _fund(t, alice);
        vm.prank(alice);
        pay.sendToken(address(t), bob, 100, "");
        assertEq(t.balanceOf(bob), 99);
    }

    function test_SendToken_RevertMissingAllowanceOrBalance() public {
        address dave = makeAddr("dave");
        usdc.mint(dave, 10);
        vm.prank(dave);
        vm.expectRevert(TrustoraPayV2.TokenTransferFailed.selector); // no allowance
        pay.sendToken(address(usdc), bob, 10, "");
        address erin = makeAddr("erin");
        vm.prank(erin);
        usdc.approve(address(pay), type(uint256).max);
        vm.prank(erin);
        vm.expectRevert(TrustoraPayV2.TokenTransferFailed.selector); // no balance
        pay.sendToken(address(usdc), bob, 10, "");
    }

    function test_SendToken_RevertBlockedRecipient() public {
        TP2Block t = new TP2Block();
        _fund(t, alice);
        t.setBlocked(bob, true);
        vm.prank(alice);
        vm.expectRevert(TrustoraPayV2.TokenTransferFailed.selector);
        pay.sendToken(address(t), bob, 1, "");
    }

    function test_SendToken_RevertInvalidToken() public {
        vm.prank(alice);
        vm.expectRevert(TrustoraPayV2.InvalidToken.selector);
        pay.sendToken(address(0), bob, 1, "");
        vm.prank(alice);
        vm.expectRevert(TrustoraPayV2.InvalidToken.selector);
        pay.sendToken(carol, bob, 1, ""); // EOA, no code
    }

    function test_SendToken_RevertZeroRecipient() public {
        vm.prank(alice);
        vm.expectRevert(TrustoraPayV2.ZeroRecipient.selector);
        pay.sendToken(address(usdc), address(0), 1, "");
    }

    function test_SendToken_RevertSelfRecipient() public {
        vm.prank(alice);
        vm.expectRevert(TrustoraPayV2.SelfRecipient.selector);
        pay.sendToken(address(usdc), address(pay), 1, "");
    }

    function test_SendToken_RevertZeroAmount() public {
        vm.prank(alice);
        vm.expectRevert(TrustoraPayV2.ZeroAmount.selector);
        pay.sendToken(address(usdc), bob, 0, "");
    }

    function test_SendToken_NoteLimit() public {
        vm.prank(alice);
        pay.sendToken(address(usdc), bob, 1, _s(280));
        string memory long = _s(281);
        vm.prank(alice);
        vm.expectRevert(TrustoraPayV2.NoteTooLong.selector);
        pay.sendToken(address(usdc), bob, 1, long);
    }

    function test_SendToken_NotPayable() public {
        vm.prank(alice);
        (bool ok,) = address(pay).call{value: 1}(abi.encodeCall(pay.sendToken, (address(usdc), bob, 1, "")));
        assertFalse(ok);
        assertEq(address(pay).balance, 0);
    }

    function test_NoReceiveOrFallback() public {
        vm.prank(alice);
        (bool ok,) = address(pay).call{value: 1}("");
        assertFalse(ok);
        vm.prank(alice);
        (ok,) = address(pay).call("");
        assertFalse(ok);
        vm.prank(alice);
        (ok,) = address(pay).call{value: 1}(hex"deadbeef");
        assertFalse(ok);
        assertEq(address(pay).balance, 0);
    }

    function test_Constants() public view {
        assertEq(pay.MAX_NOTE_BYTES(), 280);
        assertEq(pay.MIN_DURATION_HOURS(), 1);
        assertEq(pay.MAX_DURATION_HOURS(), 8760);
        assertEq(pay.RECOVERY_DELAY(), 180 days);
        assertEq(pay.nextEscrowId(), 1);
    }

    // ═════════════════════════ createEscrow ═════════════════════════

    function test_CreateEscrow_StoresAllFieldsAndEmits() public {
        uint256 a0 = usdc.balanceOf(alice);
        vm.expectEmit(true, true, true, true, address(pay));
        emit EscrowCreated(1, alice, bob, address(usdc), AMT, T0 + 24 hours, "memo");
        vm.prank(alice);
        uint256 id = pay.createEscrow(bob, address(usdc), AMT, 24, "memo");
        assertEq(id, 1);
        assertEq(pay.nextEscrowId(), 2);

        TrustoraPayV2.Escrow memory e = pay.getEscrow(id);
        assertEq(e.escrowId, 1);
        assertEq(e.sender, alice);
        assertEq(e.recipient, bob);
        assertEq(e.tokenAddress, address(usdc));
        assertEq(e.amount, AMT);
        assertEq(e.releaseTime, block.timestamp + 24 hours);
        assertEq(e.memo, "memo");
        assertEq(uint8(e.status), uint8(TrustoraPayV2.EscrowStatus.Active));

        assertEq(usdc.balanceOf(address(pay)), AMT);
        assertEq(usdc.balanceOf(alice), a0 - AMT);
    }

    function test_CreateEscrow_IdsAndEscrowIdsOfForBothParties() public {
        vm.prank(alice);
        uint256 id1 = pay.createEscrow(bob, address(usdc), 1, 1, "");
        vm.prank(carol);
        uint256 id2 = pay.createEscrow(bob, address(usdc), 2, 1, "");
        vm.prank(bob);
        uint256 id3 = pay.createEscrow(alice, address(usdc), 3, 1, "");
        assertEq(id1, 1);
        assertEq(id2, 2);
        assertEq(id3, 3);

        uint256[] memory a = new uint256[](2);
        a[0] = 1;
        a[1] = 3;
        uint256[] memory b = new uint256[](3);
        b[0] = 1;
        b[1] = 2;
        b[2] = 3;
        uint256[] memory c = new uint256[](1);
        c[0] = 2;
        assertEq(pay.escrowIdsOf(alice), a);
        assertEq(pay.escrowIdsOf(bob), b);
        assertEq(pay.escrowIdsOf(carol), c);
        assertEq(pay.escrowIdsOf(makeAddr("nobody")).length, 0);
    }

    function test_CreateEscrow_RevertZeroRecipient() public {
        vm.prank(alice);
        vm.expectRevert(TrustoraPayV2.ZeroRecipient.selector);
        pay.createEscrow(address(0), address(usdc), AMT, 1, "");
    }

    function test_CreateEscrow_RevertSelfRecipient() public {
        vm.prank(alice);
        vm.expectRevert(TrustoraPayV2.SelfRecipient.selector);
        pay.createEscrow(alice, address(usdc), AMT, 1, "");
    }

    function test_CreateEscrow_RevertContractRecipient() public {
        vm.prank(alice);
        vm.expectRevert(TrustoraPayV2.SelfRecipient.selector);
        pay.createEscrow(address(pay), address(usdc), AMT, 1, "");
    }

    function test_CreateEscrow_RevertInvalidToken() public {
        vm.prank(alice);
        vm.expectRevert(TrustoraPayV2.InvalidToken.selector);
        pay.createEscrow(bob, address(0), AMT, 1, "");
        vm.prank(alice);
        vm.expectRevert(TrustoraPayV2.InvalidToken.selector);
        pay.createEscrow(bob, carol, AMT, 1, ""); // EOA
    }

    function test_CreateEscrow_RevertTokenWithoutBalanceOf() public {
        TP2EmptyFallback f = new TP2EmptyFallback();
        vm.prank(alice);
        vm.expectRevert(TrustoraPayV2.TokenTransferFailed.selector);
        pay.createEscrow(bob, address(f), AMT, 1, ""); // balanceOf returns no data
        vm.prank(alice);
        vm.expectRevert(TrustoraPayV2.TokenTransferFailed.selector);
        pay.createEscrow(bob, address(pay), AMT, 1, ""); // balanceOf reverts
    }

    function test_CreateEscrow_RevertZeroAmount() public {
        vm.prank(alice);
        vm.expectRevert(TrustoraPayV2.ZeroAmount.selector);
        pay.createEscrow(bob, address(usdc), 0, 1, "");
    }

    function test_CreateEscrow_DurationBounds() public {
        vm.prank(alice);
        vm.expectRevert(TrustoraPayV2.InvalidDuration.selector);
        pay.createEscrow(bob, address(usdc), AMT, 0, "");
        vm.prank(alice);
        vm.expectRevert(TrustoraPayV2.InvalidDuration.selector);
        pay.createEscrow(bob, address(usdc), AMT, 8761, "");

        vm.prank(alice);
        uint256 lo = pay.createEscrow(bob, address(usdc), AMT, 1, "");
        vm.prank(alice);
        uint256 hi = pay.createEscrow(bob, address(usdc), AMT, 8760, "");
        assertEq(_rt(lo), T0 + 1 hours);
        assertEq(_rt(hi), T0 + 8760 hours);
        assertEq(lo, 1); // failed attempts did not consume ids
        assertEq(hi, 2);
    }

    function test_CreateEscrow_MemoLimit() public {
        vm.prank(alice);
        uint256 id = pay.createEscrow(bob, address(usdc), AMT, 1, _s(280));
        assertEq(bytes(pay.getEscrow(id).memo).length, 280);
        string memory long = _s(281);
        vm.prank(alice);
        vm.expectRevert(TrustoraPayV2.NoteTooLong.selector);
        pay.createEscrow(bob, address(usdc), AMT, 1, long);
    }

    function test_CreateEscrow_RevertMissingAllowance() public {
        address dave = makeAddr("dave");
        usdc.mint(dave, AMT);
        vm.prank(dave);
        vm.expectRevert(TrustoraPayV2.TokenTransferFailed.selector);
        pay.createEscrow(bob, address(usdc), AMT, 1, "");
    }

    function test_CreateEscrow_RevertMissingBalance() public {
        address dave = makeAddr("dave");
        vm.prank(dave);
        usdc.approve(address(pay), type(uint256).max);
        vm.prank(dave);
        vm.expectRevert(TrustoraPayV2.TokenTransferFailed.selector);
        pay.createEscrow(bob, address(usdc), AMT, 1, "");
    }

    function test_CreateEscrow_RevertFeeOnTransferIncorrectDeposit() public {
        TP2Fee t = new TP2Fee();
        _fund(t, alice);
        vm.prank(alice);
        vm.expectRevert(TrustoraPayV2.IncorrectDeposit.selector);
        pay.createEscrow(bob, address(t), 1000, 1, "");
        assertEq(pay.nextEscrowId(), 1);
        assertEq(pay.escrowIdsOf(alice).length, 0);
    }

    function test_CreateEscrow_RevertFalseReturnToken() public {
        TP2False t = new TP2False();
        vm.prank(alice);
        vm.expectRevert(TrustoraPayV2.TokenTransferFailed.selector);
        pay.createEscrow(bob, address(t), AMT, 1, "");
    }

    function test_CreateEscrow_NoReturnTokenWorksEndToEnd() public {
        TP2NoReturn t = new TP2NoReturn();
        _fund(t, alice);
        uint256 id = _createWith(address(t), 2);
        assertEq(t.balanceOf(address(pay)), AMT);
        vm.prank(alice);
        pay.releaseEscrow(id);
        assertEq(t.balanceOf(bob), AMT);
        assertEq(t.balanceOf(address(pay)), 0);
    }

    function test_GetEscrow_UnknownIdReverts() public {
        vm.expectRevert(TrustoraPayV2.EscrowNotFound.selector);
        pay.getEscrow(0);
        vm.expectRevert(TrustoraPayV2.EscrowNotFound.selector);
        pay.getEscrow(1);
        _create();
        pay.getEscrow(1); // now exists
        vm.expectRevert(TrustoraPayV2.EscrowNotFound.selector);
        pay.getEscrow(2);
    }

    // ═════════════════════════ releaseEscrow ═════════════════════════

    function test_Release_BeforeReleaseTime() public {
        uint256 id = _create();
        vm.expectEmit(true, true, true, true, address(pay));
        emit EscrowReleased(id, alice, bob, AMT);
        vm.prank(alice);
        pay.releaseEscrow(id);
        assertEq(uint8(_status(id)), uint8(TrustoraPayV2.EscrowStatus.Released));
        assertEq(usdc.balanceOf(bob), 1_000_000e6 + AMT);
        assertEq(usdc.balanceOf(address(pay)), 0);
    }

    function test_Release_AfterReleaseTimeAndAfterClaimWindow() public {
        uint256 id = _create();
        skip(24 hours + 1);
        vm.prank(alice);
        pay.releaseEscrow(id);
        assertEq(usdc.balanceOf(bob), 1_000_000e6 + AMT);

        uint256 id2 = _create();
        skip(24 hours + RD + 365 days);
        vm.prank(alice);
        pay.releaseEscrow(id2);
        assertEq(usdc.balanceOf(bob), 1_000_000e6 + 2 * AMT);
    }

    function test_Release_OnlySender() public {
        uint256 id = _create();
        vm.prank(bob);
        vm.expectRevert(TrustoraPayV2.NotSender.selector);
        pay.releaseEscrow(id);
        vm.prank(carol);
        vm.expectRevert(TrustoraPayV2.NotSender.selector);
        pay.releaseEscrow(id);
    }

    function test_Release_DoubleReleaseAndWrongStatus() public {
        uint256 id = _create();
        vm.prank(alice);
        pay.releaseEscrow(id);
        vm.prank(alice);
        vm.expectRevert(TrustoraPayV2.NotActive.selector);
        pay.releaseEscrow(id);

        uint256 id2 = _create();
        vm.prank(alice);
        pay.refundEscrow(id2);
        vm.prank(alice);
        vm.expectRevert(TrustoraPayV2.NotActive.selector);
        pay.releaseEscrow(id2);
    }

    function test_Release_UnknownId() public {
        vm.prank(alice);
        vm.expectRevert(TrustoraPayV2.EscrowNotFound.selector);
        pay.releaseEscrow(99);
    }

    function test_Release_BlockedRecipientRevertsAndStaysActive() public {
        TP2Block t = new TP2Block();
        _fund(t, alice);
        uint256 id = _createWith(address(t), 1);
        t.setBlocked(bob, true);
        vm.prank(alice);
        vm.expectRevert(TrustoraPayV2.TokenTransferFailed.selector);
        pay.releaseEscrow(id);
        assertEq(uint8(_status(id)), uint8(TrustoraPayV2.EscrowStatus.Active));
        assertEq(t.balanceOf(address(pay)), AMT);
    }

    function test_Release_FalseReturnOnPayoutReverts() public {
        // token that deposits fine but returns false on transfer (payout)
        TP2PayoutFalse t = new TP2PayoutFalse();
        _fund(t, alice);
        uint256 id = _createWith(address(t), 1);
        vm.prank(alice);
        vm.expectRevert(TrustoraPayV2.TokenTransferFailed.selector);
        pay.releaseEscrow(id);
        assertEq(uint8(_status(id)), uint8(TrustoraPayV2.EscrowStatus.Active));
    }

    // ═════════════════════ claimExpiredEscrow / claimExpiredEscrowTo ═════════════════════

    function test_Claim_OnlyRecipient() public {
        uint256 id = _create();
        vm.warp(_rt(id));
        vm.prank(alice);
        vm.expectRevert(TrustoraPayV2.NotRecipient.selector);
        pay.claimExpiredEscrow(id);
        vm.prank(carol);
        vm.expectRevert(TrustoraPayV2.NotRecipient.selector);
        pay.claimExpiredEscrow(id);
        vm.prank(alice);
        vm.expectRevert(TrustoraPayV2.NotRecipient.selector);
        pay.claimExpiredEscrowTo(id, alice);
        vm.prank(carol);
        vm.expectRevert(TrustoraPayV2.NotRecipient.selector);
        pay.claimExpiredEscrowTo(id, carol);
    }

    function test_Claim_NotYetClaimableOneSecondBefore() public {
        uint256 id = _create();
        vm.warp(_rt(id) - 1);
        vm.prank(bob);
        vm.expectRevert(TrustoraPayV2.NotYetClaimable.selector);
        pay.claimExpiredEscrow(id);
        vm.prank(bob);
        vm.expectRevert(TrustoraPayV2.NotYetClaimable.selector);
        pay.claimExpiredEscrowTo(id, carol);
    }

    function test_Claim_SucceedsExactlyAtReleaseTime() public {
        uint256 id = _create();
        vm.warp(_rt(id));
        vm.expectEmit(true, true, false, true, address(pay));
        emit EscrowClaimed(id, bob, AMT);
        vm.prank(bob);
        pay.claimExpiredEscrow(id);
        assertEq(usdc.balanceOf(bob), 1_000_000e6 + AMT);
        assertEq(usdc.balanceOf(address(pay)), 0);
        assertEq(uint8(_status(id)), uint8(TrustoraPayV2.EscrowStatus.Released));
    }

    function test_ClaimTo_RedirectedPayoutAndEvents() public {
        uint256 id = _create();
        address dest = makeAddr("dest");
        vm.warp(_rt(id));
        vm.expectEmit(true, true, false, true, address(pay));
        emit EscrowClaimed(id, bob, AMT);
        vm.expectEmit(true, true, false, false, address(pay));
        emit EscrowPayoutRedirected(id, dest);
        vm.prank(bob);
        pay.claimExpiredEscrowTo(id, dest);
        assertEq(usdc.balanceOf(dest), AMT);
        assertEq(usdc.balanceOf(bob), 1_000_000e6);
        assertEq(uint8(_status(id)), uint8(TrustoraPayV2.EscrowStatus.Released));
    }

    function test_ClaimTo_ToRecipientEmitsNoRedirectEvent() public {
        uint256 id = _create();
        vm.warp(_rt(id));
        vm.recordLogs();
        vm.prank(bob);
        pay.claimExpiredEscrowTo(id, bob);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 1);
        assertEq(logs[0].topics[0], EscrowClaimed.selector);
        assertEq(usdc.balanceOf(bob), 1_000_000e6 + AMT);
    }

    function test_ClaimTo_RejectsZeroAndContractAddress() public {
        uint256 id = _create();
        vm.warp(_rt(id));
        vm.prank(bob);
        vm.expectRevert(TrustoraPayV2.ZeroRecipient.selector);
        pay.claimExpiredEscrowTo(id, address(0));
        vm.prank(bob);
        vm.expectRevert(TrustoraPayV2.SelfRecipient.selector);
        pay.claimExpiredEscrowTo(id, address(pay));
        assertEq(uint8(_status(id)), uint8(TrustoraPayV2.EscrowStatus.Active));
    }

    function test_Claim_WindowClosedAtReleaseTimePlus180Days() public {
        uint256 id = _create();
        uint256 rt = _rt(id);
        vm.warp(rt + RD - 1);
        vm.prank(bob);
        pay.claimExpiredEscrow(id); // last second still works

        uint256 id2 = _create();
        rt = _rt(id2);
        vm.warp(rt + RD);
        vm.prank(bob);
        vm.expectRevert(TrustoraPayV2.ClaimWindowClosed.selector);
        pay.claimExpiredEscrow(id2);
        vm.prank(bob);
        vm.expectRevert(TrustoraPayV2.ClaimWindowClosed.selector);
        pay.claimExpiredEscrowTo(id2, carol);
        vm.warp(rt + RD + 100 days);
        vm.prank(bob);
        vm.expectRevert(TrustoraPayV2.ClaimWindowClosed.selector);
        pay.claimExpiredEscrow(id2);
    }

    function test_Claim_DoubleClaimAndWrongStatus() public {
        uint256 id = _create();
        vm.warp(_rt(id));
        vm.prank(bob);
        pay.claimExpiredEscrow(id);
        vm.prank(bob);
        vm.expectRevert(TrustoraPayV2.NotActive.selector);
        pay.claimExpiredEscrow(id);
        vm.prank(bob);
        vm.expectRevert(TrustoraPayV2.NotActive.selector);
        pay.claimExpiredEscrowTo(id, carol);
    }

    function test_Claim_UnknownId() public {
        vm.prank(bob);
        vm.expectRevert(TrustoraPayV2.EscrowNotFound.selector);
        pay.claimExpiredEscrow(5);
        vm.prank(bob);
        vm.expectRevert(TrustoraPayV2.EscrowNotFound.selector);
        pay.claimExpiredEscrowTo(5, carol);
    }

    function test_Claim_BlockedRecipientThenClaimToOtherWorks() public {
        TP2Block t = new TP2Block();
        _fund(t, alice);
        uint256 id = _createWith(address(t), 1);
        t.setBlocked(bob, true);
        vm.warp(_rt(id));
        vm.prank(bob);
        vm.expectRevert(TrustoraPayV2.TokenTransferFailed.selector);
        pay.claimExpiredEscrow(id);
        assertEq(uint8(_status(id)), uint8(TrustoraPayV2.EscrowStatus.Active));

        vm.prank(bob);
        pay.claimExpiredEscrowTo(id, carol);
        assertEq(t.balanceOf(carol), AMT); // carol was never funded in this token
        assertEq(t.balanceOf(address(pay)), 0);
        assertEq(uint8(_status(id)), uint8(TrustoraPayV2.EscrowStatus.Released));
    }

    // ═════════════════════════ refundEscrow ═════════════════════════

    function test_Refund_Success() public {
        uint256 id = _create();
        uint256 a0 = usdc.balanceOf(alice);
        vm.expectEmit(true, true, false, true, address(pay));
        emit EscrowRefunded(id, alice, AMT);
        vm.prank(alice);
        pay.refundEscrow(id);
        assertEq(usdc.balanceOf(alice), a0 + AMT);
        assertEq(usdc.balanceOf(address(pay)), 0);
        assertEq(uint8(_status(id)), uint8(TrustoraPayV2.EscrowStatus.Refunded));
    }

    function test_Refund_OnlySender() public {
        uint256 id = _create();
        vm.prank(bob);
        vm.expectRevert(TrustoraPayV2.NotSender.selector);
        pay.refundEscrow(id);
        vm.prank(carol);
        vm.expectRevert(TrustoraPayV2.NotSender.selector);
        pay.refundEscrow(id);
    }

    function test_Refund_OneSecondBeforeReleaseTimeWorksAtReleaseTimeCloses() public {
        uint256 id = _create();
        uint256 rt = _rt(id);
        vm.warp(rt);
        vm.prank(alice);
        vm.expectRevert(TrustoraPayV2.RefundWindowClosed.selector);
        pay.refundEscrow(id);
        vm.warp(rt - 1);
        vm.prank(alice);
        pay.refundEscrow(id);
        assertEq(uint8(_status(id)), uint8(TrustoraPayV2.EscrowStatus.Refunded));
    }

    function test_Refund_ThenReleaseClaimRecoverRefundRevert() public {
        uint256 id = _create();
        vm.prank(alice);
        pay.refundEscrow(id);
        vm.prank(alice);
        vm.expectRevert(TrustoraPayV2.NotActive.selector);
        pay.refundEscrow(id);
        vm.prank(alice);
        vm.expectRevert(TrustoraPayV2.NotActive.selector);
        pay.releaseEscrow(id);
        vm.warp(_rt(id));
        vm.prank(bob);
        vm.expectRevert(TrustoraPayV2.NotActive.selector);
        pay.claimExpiredEscrow(id);
        vm.warp(_rt(id) + RD);
        vm.prank(alice);
        vm.expectRevert(TrustoraPayV2.NotActive.selector);
        pay.recoverUnclaimedEscrow(id);
        assertEq(usdc.balanceOf(address(pay)), 0);
    }

    function test_Refund_UnknownId() public {
        vm.prank(alice);
        vm.expectRevert(TrustoraPayV2.EscrowNotFound.selector);
        pay.refundEscrow(1);
    }

    // ═════════════════════════ recoverUnclaimedEscrow ═════════════════════════

    function test_Recover_OnlySender() public {
        uint256 id = _create();
        vm.warp(_rt(id) + RD);
        vm.prank(bob);
        vm.expectRevert(TrustoraPayV2.NotSender.selector);
        pay.recoverUnclaimedEscrow(id);
        vm.prank(carol);
        vm.expectRevert(TrustoraPayV2.NotSender.selector);
        pay.recoverUnclaimedEscrow(id);
    }

    function test_Recover_NotReadyOneSecondBefore() public {
        uint256 id = _create();
        vm.warp(_rt(id) + RD - 1);
        vm.prank(alice);
        vm.expectRevert(TrustoraPayV2.RecoveryNotReady.selector);
        pay.recoverUnclaimedEscrow(id);
        vm.warp(_rt(id));
        vm.prank(alice);
        vm.expectRevert(TrustoraPayV2.RecoveryNotReady.selector);
        pay.recoverUnclaimedEscrow(id);
    }

    function test_Recover_WorksExactlyAtReleaseTimePlus180Days() public {
        uint256 id = _create();
        uint256 a0 = usdc.balanceOf(alice);
        vm.warp(_rt(id) + RD);
        vm.expectEmit(true, true, false, true, address(pay));
        emit EscrowRefunded(id, alice, AMT);
        vm.prank(alice);
        pay.recoverUnclaimedEscrow(id);
        assertEq(usdc.balanceOf(alice), a0 + AMT);
        assertEq(usdc.balanceOf(address(pay)), 0);
        assertEq(uint8(_status(id)), uint8(TrustoraPayV2.EscrowStatus.Refunded));
    }

    function test_Recover_RecipientCannotClaimAfterwards() public {
        uint256 id = _create();
        vm.warp(_rt(id) + RD);
        vm.prank(alice);
        pay.recoverUnclaimedEscrow(id);
        vm.prank(bob);
        vm.expectRevert(TrustoraPayV2.NotActive.selector);
        pay.claimExpiredEscrow(id);
        vm.prank(bob);
        vm.expectRevert(TrustoraPayV2.NotActive.selector);
        pay.claimExpiredEscrowTo(id, carol);
        vm.prank(alice);
        vm.expectRevert(TrustoraPayV2.NotActive.selector);
        pay.recoverUnclaimedEscrow(id);
        vm.prank(alice);
        vm.expectRevert(TrustoraPayV2.NotActive.selector);
        pay.releaseEscrow(id);
    }

    function test_Recover_UnknownId() public {
        vm.prank(alice);
        vm.expectRevert(TrustoraPayV2.EscrowNotFound.selector);
        pay.recoverUnclaimedEscrow(1);
    }

    // ═════════════════════ no double payout, every ordering ═════════════════════

    function _actor(uint8 k) internal view returns (address) {
        return (k == CLAIM || k == CLAIM_TO) ? bob : alice;
    }

    function _call(uint8 k, uint256 id) internal returns (bool ok) {
        bytes memory d;
        if (k == REL) d = abi.encodeCall(pay.releaseEscrow, (id));
        else if (k == CLAIM) d = abi.encodeCall(pay.claimExpiredEscrow, (id));
        else if (k == CLAIM_TO) d = abi.encodeCall(pay.claimExpiredEscrowTo, (id, carol));
        else if (k == REFUND) d = abi.encodeCall(pay.refundEscrow, (id));
        else d = abi.encodeCall(pay.recoverUnclaimedEscrow, (id));
        vm.prank(_actor(k));
        (ok,) = address(pay).call(d);
    }

    function _dest(uint8 k) internal view returns (address) {
        if (k == REL || k == CLAIM) return bob;
        if (k == CLAIM_TO) return carol;
        return alice;
    }

    /// Model of when each action is permitted for an Active escrow.
    function _allowed(uint8 k, uint256 t, uint256 rt) internal pure returns (bool) {
        if (k == REL) return true;
        if (k == CLAIM || k == CLAIM_TO) return t >= rt && t < rt + RD;
        if (k == REFUND) return t < rt;
        return t >= rt + RD;
    }

    function _total() internal view returns (uint256) {
        return usdc.balanceOf(alice) + usdc.balanceOf(bob) + usdc.balanceOf(carol) + usdc.balanceOf(address(pay));
    }

    function test_NoDoublePayout_AllOrderingsAndTimes() public {
        uint256 id = _create();
        uint256 rt = _rt(id);
        uint256 total0 = _total();
        uint256[4] memory times = [rt - 1, rt, rt + RD - 1, rt + RD];

        for (uint8 a = 0; a < 5; a++) {
            for (uint8 b = 0; b < 5; b++) {
                for (uint256 i = 0; i < 4; i++) {
                    for (uint256 j = i; j < 4; j++) {
                        uint256 snap = vm.snapshotState();
                        _runPair(id, a, b, times[i], times[j], rt, total0);
                        vm.revertToState(snap);
                    }
                }
            }
        }
    }

    function _runPair(uint256 id, uint8 a, uint8 b, uint256 tA, uint256 tB, uint256 rt, uint256 total0) internal {
        uint256 destA = usdc.balanceOf(_dest(a));
        vm.warp(tA);
        bool okA = _call(a, id);
        assertEq(okA, _allowed(a, tA, rt), "first action permission");
        if (okA) {
            assertEq(usdc.balanceOf(_dest(a)), destA + AMT, "first payout destination");
            assertEq(uint8(_status(id)) != 0, true);
        }
        assertEq(usdc.balanceOf(address(pay)), okA ? 0 : AMT);

        vm.warp(tB);
        bool okB = _call(b, id);
        if (okA) {
            assertFalse(okB, "second action must fail after payout");
            assertEq(usdc.balanceOf(address(pay)), 0);
        } else {
            assertEq(okB, _allowed(b, tB, rt), "second action permission");
            assertEq(usdc.balanceOf(address(pay)), okB ? 0 : AMT);
        }
        assertEq(_total(), total0, "tokens conserved");
        // exactly one payout of AMT left the contract in total (or none)
        bool paid = okA || okB;
        assertEq(_status(id) != TrustoraPayV2.EscrowStatus.Active, paid);
    }

    function test_Sequence_ReleaseThenClaimRevertsAndViceVersa() public {
        uint256 id = _create();
        vm.prank(alice);
        pay.releaseEscrow(id);
        vm.warp(_rt(id));
        vm.prank(bob);
        vm.expectRevert(TrustoraPayV2.NotActive.selector);
        pay.claimExpiredEscrow(id);

        uint256 id2 = _create();
        vm.warp(_rt(id2));
        vm.prank(bob);
        pay.claimExpiredEscrow(id2);
        vm.prank(alice);
        vm.expectRevert(TrustoraPayV2.NotActive.selector);
        pay.releaseEscrow(id2);
        vm.warp(_rt(id2) + RD);
        vm.prank(alice);
        vm.expectRevert(TrustoraPayV2.NotActive.selector);
        pay.recoverUnclaimedEscrow(id2);
    }

    // ═════════════════════════ fuzz ═════════════════════════

    function testFuzz_Duration(uint256 hrs) public {
        hrs = bound(hrs, 1, 8760);
        vm.prank(alice);
        uint256 id = pay.createEscrow(bob, address(usdc), AMT, hrs, "");
        assertEq(_rt(id), block.timestamp + hrs * 1 hours);
    }

    function testFuzz_InvalidDuration(uint256 hrs) public {
        vm.assume(hrs == 0 || hrs > 8760);
        vm.prank(alice);
        vm.expectRevert(TrustoraPayV2.InvalidDuration.selector);
        pay.createEscrow(bob, address(usdc), AMT, hrs, "");
    }

    function testFuzz_AmountRoundTripRelease(uint256 amt) public {
        amt = bound(amt, 1, 1_000_000e6);
        vm.prank(alice);
        uint256 id = pay.createEscrow(bob, address(usdc), amt, 1, "");
        assertEq(usdc.balanceOf(address(pay)), amt);
        uint256 b0 = usdc.balanceOf(bob);
        vm.prank(alice);
        pay.releaseEscrow(id);
        assertEq(usdc.balanceOf(bob), b0 + amt);
        assertEq(usdc.balanceOf(address(pay)), 0);
    }

    function testFuzz_AmountAboveBalanceReverts(uint256 amt) public {
        amt = bound(amt, 1_000_000e6 + 1, type(uint256).max);
        vm.prank(alice);
        vm.expectRevert(TrustoraPayV2.TokenTransferFailed.selector);
        pay.createEscrow(bob, address(usdc), amt, 1, "");
    }

    function testFuzz_FeeTokenAlwaysRejected(uint256 amt) public {
        amt = bound(amt, 100, 1_000_000e6); // fee = amt/100 >= 1
        TP2Fee t = new TP2Fee();
        _fund(t, alice);
        vm.prank(alice);
        vm.expectRevert(TrustoraPayV2.IncorrectDeposit.selector);
        pay.createEscrow(bob, address(t), amt, 1, "");
    }

    function testFuzz_SendNativeAmount(uint256 amt) public {
        amt = bound(amt, 1, 10 ether);
        vm.prank(alice);
        pay.sendNative{value: amt}(payable(bob), "x");
        assertEq(bob.balance, amt);
        assertEq(address(pay).balance, 0);
    }

    function testFuzz_NoteLength(uint256 n) public {
        n = bound(n, 0, 600);
        string memory s = _s(n);
        vm.prank(alice);
        (bool ok,) = address(pay).call(abi.encodeCall(pay.sendToken, (address(usdc), bob, 1, s)));
        assertEq(ok, n <= 280);
        vm.prank(alice);
        (ok,) = address(pay).call(abi.encodeCall(pay.createEscrow, (bob, address(usdc), 1, 1, s)));
        assertEq(ok, n <= 280);
        vm.prank(alice);
        (ok,) = address(pay).call{value: 1}(abi.encodeCall(pay.sendNative, (payable(bob), s)));
        assertEq(ok, n <= 280);
    }

    function testFuzz_TimingWindows(uint256 hrs, uint256 delta, uint8 kind) public {
        hrs = bound(hrs, 1, 8760);
        kind = uint8(bound(kind, 0, 4));
        uint256 id = _createWith(address(usdc), hrs);
        uint256 rt = _rt(id);
        delta = bound(delta, 0, hrs * 1 hours + RD + 400 days);
        uint256 t = T0 + delta;
        vm.warp(t);
        uint256 dest0 = usdc.balanceOf(_dest(kind));
        bool ok = _call(kind, id);
        assertEq(ok, _allowed(kind, t, rt));
        assertEq(usdc.balanceOf(_dest(kind)), ok ? dest0 + AMT : dest0);
        assertEq(usdc.balanceOf(address(pay)), ok ? 0 : AMT);
    }

    function testFuzz_BoundaryTimingExact(uint256 hrs, uint8 kind) public {
        hrs = bound(hrs, 1, 8760);
        kind = uint8(bound(kind, 0, 4));
        uint256 id = _createWith(address(usdc), hrs);
        uint256 rt = _rt(id);
        uint256[4] memory edges = [rt - 1, rt, rt + RD - 1, rt + RD];
        for (uint256 i; i < 4; i++) {
            uint256 snap = vm.snapshotState();
            vm.warp(edges[i]);
            assertEq(_call(kind, id), _allowed(kind, edges[i], rt));
            vm.revertToState(snap);
        }
    }

    // ═════════════════════════ reentrancy ═════════════════════════

    uint8 internal constant O_SEND = 5;
    uint8 internal constant O_CREATE = 6;

    function _payloads() internal view returns (bytes[] memory p) {
        p = new bytes[](8);
        p[0] = abi.encodeCall(pay.sendNative, (payable(bob), "x"));
        p[1] = abi.encodeCall(pay.sendToken, (address(usdc), bob, 1, "x"));
        p[2] = abi.encodeCall(pay.createEscrow, (bob, address(usdc), 1, 1, "x"));
        p[3] = abi.encodeCall(pay.releaseEscrow, (1));
        p[4] = abi.encodeCall(pay.claimExpiredEscrow, (1));
        p[5] = abi.encodeCall(pay.claimExpiredEscrowTo, (1, carol));
        p[6] = abi.encodeCall(pay.refundEscrow, (1));
        p[7] = abi.encodeCall(pay.recoverUnclaimedEscrow, (1));
    }

    function _assertBlocked(TP2Reentrant t, uint256 n) internal view {
        assertEq(t.hits(), n, "callback fired");
        assertFalse(t.lastOk(), "reentrant call must fail");
        assertEq(bytes4(t.lastRet()), TrustoraPayV2.Reentrancy.selector, "Reentrancy error");
    }

    function _reenterOuter(uint8 outer) internal {
        TP2Reentrant t = new TP2Reentrant();
        _fund(t, alice);
        bytes[] memory ps = _payloads();
        for (uint256 i; i < ps.length; i++) {
            if (outer == O_SEND) {
                t.arm(address(pay), ps[i]);
                vm.prank(alice);
                pay.sendToken(address(t), bob, 1, "");
            } else if (outer == O_CREATE) {
                t.arm(address(pay), ps[i]);
                vm.prank(alice);
                pay.createEscrow(bob, address(t), AMT, 1, "");
            } else {
                uint256 id = _createWith(address(t), 1);
                uint256 rt = _rt(id);
                t.arm(address(pay), ps[i]);
                if (outer == REL) {
                    vm.prank(alice);
                    pay.releaseEscrow(id);
                } else if (outer == CLAIM) {
                    vm.warp(rt);
                    vm.prank(bob);
                    pay.claimExpiredEscrow(id);
                } else if (outer == CLAIM_TO) {
                    vm.warp(rt);
                    vm.prank(bob);
                    pay.claimExpiredEscrowTo(id, carol);
                } else if (outer == REFUND) {
                    vm.prank(alice);
                    pay.refundEscrow(id);
                } else {
                    vm.warp(rt + RD);
                    vm.prank(alice);
                    pay.recoverUnclaimedEscrow(id);
                }
                assertTrue(_status(id) != TrustoraPayV2.EscrowStatus.Active, "outer call completed");
            }
            _assertBlocked(t, i + 1);
        }
        // guard released: a normal call afterwards still works
        vm.prank(alice);
        pay.sendToken(address(t), bob, 1, "");
    }

    function test_Reentrancy_SendNative() public {
        TP2ReentrantReceiver r = new TP2ReentrantReceiver();
        bytes[] memory ps = _payloads();
        for (uint256 i; i < ps.length; i++) {
            r.arm(address(pay), ps[i]);
            vm.prank(alice);
            pay.sendNative{value: 1}(payable(address(r)), "");
            assertEq(r.hits(), i + 1);
            assertFalse(r.lastOk());
            assertEq(bytes4(r.lastRet()), TrustoraPayV2.Reentrancy.selector);
        }
        assertEq(address(r).balance, ps.length);
        assertEq(address(pay).balance, 0);
    }

    function test_Reentrancy_SendToken() public {
        _reenterOuter(O_SEND);
    }

    function test_Reentrancy_CreateEscrow() public {
        _reenterOuter(O_CREATE);
    }

    function test_Reentrancy_ReleaseEscrow() public {
        _reenterOuter(REL);
    }

    function test_Reentrancy_ClaimExpiredEscrow() public {
        _reenterOuter(CLAIM);
    }

    function test_Reentrancy_ClaimExpiredEscrowTo() public {
        _reenterOuter(CLAIM_TO);
    }

    function test_Reentrancy_RefundEscrow() public {
        _reenterOuter(REFUND);
    }

    function test_Reentrancy_RecoverUnclaimedEscrow() public {
        _reenterOuter(RECOVER);
    }
}

// ───────────────────────────── Invariant ─────────────────────────────

contract TP2Handler is Test {
    TrustoraPayV2 public pay;
    TP2Token public token;
    address[3] public actors;
    uint256 public created;
    uint256 public payouts;

    constructor(TrustoraPayV2 _pay, TP2Token _token, address[3] memory _actors) {
        pay = _pay;
        token = _token;
        actors = _actors;
    }

    function _id(uint256 seed) internal view returns (uint256) {
        uint256 n = pay.nextEscrowId();
        if (n <= 1) return 0;
        return 1 + (seed % (n - 1));
    }

    function create(uint256 s, uint256 r, uint256 amt, uint256 hrs) external {
        address from = actors[s % 3];
        address to = actors[(s % 3 + 1 + (r % 2)) % 3];
        amt = bound(amt, 1, 1e9);
        hrs = bound(hrs, 1, 8760);
        vm.prank(from);
        try pay.createEscrow(to, address(token), amt, hrs, "") { created++; } catch {}
    }

    function release(uint256 seed) external {
        uint256 id = _id(seed);
        if (id == 0) return;
        address who = pay.getEscrow(id).sender;
        vm.prank(who);
        try pay.releaseEscrow(id) { payouts++; } catch {}
    }

    function claim(uint256 seed, uint256 toSeed, bool redirect) external {
        uint256 id = _id(seed);
        if (id == 0) return;
        address who = pay.getEscrow(id).recipient;
        vm.prank(who);
        if (redirect) {
            try pay.claimExpiredEscrowTo(id, actors[toSeed % 3]) { payouts++; } catch {}
        } else {
            try pay.claimExpiredEscrow(id) { payouts++; } catch {}
        }
    }

    function refund(uint256 seed) external {
        uint256 id = _id(seed);
        if (id == 0) return;
        address who = pay.getEscrow(id).sender;
        vm.prank(who);
        try pay.refundEscrow(id) { payouts++; } catch {}
    }

    function recover(uint256 seed) external {
        uint256 id = _id(seed);
        if (id == 0) return;
        address who = pay.getEscrow(id).sender;
        vm.prank(who);
        try pay.recoverUnclaimedEscrow(id) { payouts++; } catch {}
    }

    function warp(uint256 s) external {
        skip(bound(s, 0, 90 days));
    }
}

contract TrustoraPayV2InvariantTest is Test {
    TrustoraPayV2 internal pay;
    TP2Token internal token;
    TP2Handler internal handler;
    address[3] internal actors;
    uint256 internal constant MINT = 1_000_000e6;

    function setUp() public {
        vm.warp(1_700_000_000);
        pay = new TrustoraPayV2();
        token = new TP2Token();
        actors = [makeAddr("a0"), makeAddr("a1"), makeAddr("a2")];
        for (uint256 i; i < 3; i++) {
            token.mint(actors[i], MINT);
            vm.prank(actors[i]);
            token.approve(address(pay), type(uint256).max);
        }
        handler = new TP2Handler(pay, token, actors);
        targetContract(address(handler));
    }

    function afterInvariant() public view {
        console2.log("created", handler.created());
        console2.log("payouts", handler.payouts());
    }

    /// Contract token balance == sum of Active escrow amounts.
    function invariant_BalanceEqualsSumOfActiveEscrows() public view {
        uint256 n = pay.nextEscrowId();
        uint256 sum;
        for (uint256 id = 1; id < n; id++) {
            TrustoraPayV2.Escrow memory e = pay.getEscrow(id);
            if (e.status == TrustoraPayV2.EscrowStatus.Active) sum += e.amount;
        }
        assertEq(token.balanceOf(address(pay)), sum);
    }

    /// Tokens are conserved: nothing is minted/burned/stuck outside actors + contract.
    function invariant_TokensConserved() public view {
        uint256 total = token.balanceOf(address(pay));
        for (uint256 i; i < 3; i++) total += token.balanceOf(actors[i]);
        assertEq(total, 3 * MINT);
    }

    /// Every escrow id is retrievable and keeps its own id / non-zero fields.
    function invariant_EscrowRecordsConsistent() public view {
        uint256 n = pay.nextEscrowId();
        for (uint256 id = 1; id < n; id++) {
            TrustoraPayV2.Escrow memory e = pay.getEscrow(id);
            assertEq(e.escrowId, id);
            assertTrue(e.sender != e.recipient);
            assertGt(e.amount, 0);
        }
    }
}
