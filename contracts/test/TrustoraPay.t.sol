// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {TrustoraPay} from "../TrustoraPay.sol";

// ───────────────────────── Mocks ─────────────────────────

/// Standard ERC-20 style: transferFrom returns true.
contract MockToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amt) external {
        balanceOf[to] += amt;
    }

    function approve(address spender, uint256 amt) external returns (bool) {
        allowance[msg.sender][spender] = amt;
        return true;
    }

    function transferFrom(address from, address to, uint256 amt) external returns (bool) {
        require(allowance[from][msg.sender] >= amt, "allowance");
        require(balanceOf[from] >= amt, "balance");
        allowance[from][msg.sender] -= amt;
        balanceOf[from] -= amt;
        balanceOf[to] += amt;
        return true;
    }
}

/// USDT-style: transferFrom returns no data.
contract NoReturnToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amt) external {
        balanceOf[to] += amt;
    }

    function approve(address spender, uint256 amt) external {
        allowance[msg.sender][spender] = amt;
    }

    function transferFrom(address from, address to, uint256 amt) external {
        require(allowance[from][msg.sender] >= amt, "allowance");
        require(balanceOf[from] >= amt, "balance");
        allowance[from][msg.sender] -= amt;
        balanceOf[from] -= amt;
        balanceOf[to] += amt;
    }
}

/// Returns false without moving anything.
contract FalseToken {
    function transferFrom(address, address, uint256) external pure returns (bool) {
        return false;
    }
}

/// Always reverts.
contract RevertingToken {
    function transferFrom(address, address, uint256) external pure returns (bool) {
        revert("nope");
    }
}

/// Returns a malformed (non-bool-decodable) word: value 2.
contract WeirdReturnToken {
    fallback() external {
        assembly {
            mstore(0, 2)
            return(0, 32)
        }
    }
}

/// Rejects native transfers.
contract RejectingRecipient {
    receive() external payable {
        revert("no thanks");
    }
}

/// Has no receive/fallback.
contract NoReceive {}

/// Malicious recipient that re-enters sendNative from its receive hook.
contract ReentrantRecipient {
    TrustoraPay public router;
    address payable public payee;
    uint256 public mode; // 1: pay payee, 2: target router (SelfRecipient), 3: pay self
    uint256 public hits;
    bool public innerOk;
    bytes public innerErr;

    constructor(TrustoraPay r, address payable p, uint256 m) {
        router = r;
        payee = p;
        mode = m;
    }

    receive() external payable {
        hits++;
        if (hits > 1) return;
        if (mode == 1) {
            router.sendNative{value: (msg.value * 4) / 10}(payee, "inner");
            innerOk = true;
        } else if (mode == 2) {
            try router.sendNative{value: 1}(payable(address(router)), "x") {
                innerOk = true;
            } catch (bytes memory e) {
                innerErr = e;
            }
        } else if (mode == 3) {
            router.sendNative{value: msg.value / 2}(payable(address(this)), "self");
            innerOk = true;
        }
    }
}

// ───────────────────────── Tests ─────────────────────────

contract TrustoraPayTest is Test {
    TrustoraPay internal router;
    MockToken internal token;
    NoReturnToken internal noRet;

    address internal alice = makeAddr("alice");
    address payable internal bob = payable(makeAddr("bob"));

    function setUp() public {
        router = new TrustoraPay();
        token = new MockToken();
        noRet = new NoReturnToken();
        vm.deal(alice, 100 ether);
        token.mint(alice, 1_000e6);
        noRet.mint(alice, 1_000e6);
        vm.startPrank(alice);
        token.approve(address(router), type(uint256).max);
        noRet.approve(address(router), type(uint256).max);
        vm.stopPrank();
    }

    function _note(uint256 len) internal pure returns (string memory) {
        bytes memory b = new bytes(len);
        for (uint256 i; i < len; i++) b[i] = "a";
        return string(b);
    }

    // ───── constants ─────

    function test_MaxNoteBytesConstant() public view {
        assertEq(router.MAX_NOTE_BYTES(), 280);
    }

    // ───── sendNative: happy path ─────

    function test_SendNative_MovesFundsAndLeavesRouterEmpty() public {
        uint256 bobBefore = bob.balance;
        vm.prank(alice);
        router.sendNative{value: 1 ether}(bob, "hi");
        assertEq(bob.balance, bobBefore + 1 ether);
        assertEq(alice.balance, 99 ether);
        assertEq(address(router).balance, 0);
    }

    function test_SendNative_EmitsPaymentSent() public {
        vm.warp(1_700_000_000);
        vm.expectEmit(true, true, true, true, address(router));
        emit TrustoraPay.PaymentSent(alice, bob, address(0), 2 ether, "lunch", 1_700_000_000);
        vm.prank(alice);
        router.sendNative{value: 2 ether}(bob, "lunch");
    }

    function test_SendNative_EmptyNoteAllowed() public {
        vm.prank(alice);
        router.sendNative{value: 1}(bob, "");
        assertEq(bob.balance, 1);
    }

    function test_SendNative_Note280BytesPasses() public {
        vm.prank(alice);
        router.sendNative{value: 1 ether}(bob, _note(280));
        assertEq(bob.balance, 1 ether);
    }

    function test_SendNative_Note281BytesReverts() public {
        vm.prank(alice);
        vm.expectRevert(TrustoraPay.NoteTooLong.selector);
        router.sendNative{value: 1 ether}(bob, _note(281));
    }

    function test_SendNative_NoteLimitIsBytesNotChars() public {
        // 140 x "é" (2 bytes each) = 280 bytes passes; 141 = 282 bytes reverts.
        bytes memory ok = new bytes(280);
        for (uint256 i; i < 140; i++) {
            ok[2 * i] = 0xC3;
            ok[2 * i + 1] = 0xA9;
        }
        vm.prank(alice);
        router.sendNative{value: 1}(bob, string(ok));

        bytes memory bad = new bytes(282);
        for (uint256 i; i < 141; i++) {
            bad[2 * i] = 0xC3;
            bad[2 * i + 1] = 0xA9;
        }
        vm.prank(alice);
        vm.expectRevert(TrustoraPay.NoteTooLong.selector);
        router.sendNative{value: 1}(bob, string(bad));
    }

    // ───── sendNative: reverts ─────

    function test_SendNative_RevertsZeroRecipient() public {
        vm.prank(alice);
        vm.expectRevert(TrustoraPay.ZeroRecipient.selector);
        router.sendNative{value: 1 ether}(payable(address(0)), "x");
    }

    function test_SendNative_RevertsSelfRecipient() public {
        vm.prank(alice);
        vm.expectRevert(TrustoraPay.SelfRecipient.selector);
        router.sendNative{value: 1 ether}(payable(address(router)), "x");
    }

    function test_SendNative_RevertsZeroAmount() public {
        vm.prank(alice);
        vm.expectRevert(TrustoraPay.ZeroAmount.selector);
        router.sendNative{value: 0}(bob, "x");
    }

    function test_SendNative_RejectingRecipientReverts() public {
        RejectingRecipient r = new RejectingRecipient();
        vm.prank(alice);
        vm.expectRevert(TrustoraPay.NativeTransferFailed.selector);
        router.sendNative{value: 1 ether}(payable(address(r)), "x");
        assertEq(alice.balance, 100 ether);
        assertEq(address(router).balance, 0);
    }

    function test_SendNative_RecipientWithoutReceiveReverts() public {
        NoReceive r = new NoReceive();
        vm.prank(alice);
        vm.expectRevert(TrustoraPay.NativeTransferFailed.selector);
        router.sendNative{value: 1 ether}(payable(address(r)), "x");
    }

    function test_SendNative_ZeroRecipientCheckedBeforeZeroAmount() public {
        vm.prank(alice);
        vm.expectRevert(TrustoraPay.ZeroRecipient.selector);
        router.sendNative{value: 0}(payable(address(0)), _note(281));
    }

    // ───── plain ETH / unknown calls ─────

    function test_PlainEthTransferReverts() public {
        vm.prank(alice);
        (bool ok,) = address(router).call{value: 1 ether}("");
        assertFalse(ok);
        assertEq(address(router).balance, 0);
    }

    function test_UnknownSelectorWithEthReverts() public {
        vm.prank(alice);
        (bool ok,) = address(router).call{value: 1 ether}(hex"deadbeef");
        assertFalse(ok);
        assertEq(address(router).balance, 0);
    }

    function test_SendTokenIsNotPayable() public {
        vm.prank(alice);
        (bool ok,) = address(router).call{value: 1}(
            abi.encodeCall(TrustoraPay.sendToken, (address(token), bob, 1, ""))
        );
        assertFalse(ok);
    }

    // ───── sendToken: happy paths ─────

    function test_SendToken_StandardToken() public {
        vm.prank(alice);
        router.sendToken(address(token), bob, 250e6, "rent");
        assertEq(token.balanceOf(bob), 250e6);
        assertEq(token.balanceOf(alice), 750e6);
        assertEq(token.balanceOf(address(router)), 0);
        assertEq(token.allowance(alice, address(router)), type(uint256).max - 250e6);
    }

    function test_SendToken_EmitsPaymentSent() public {
        vm.warp(1_800_000_000);
        vm.expectEmit(true, true, true, true, address(router));
        emit TrustoraPay.PaymentSent(alice, bob, address(token), 5e6, "tip", 1_800_000_000);
        vm.prank(alice);
        router.sendToken(address(token), bob, 5e6, "tip");
    }

    function test_SendToken_NoReturnDataTokenSucceeds() public {
        vm.expectEmit(true, true, true, true, address(router));
        emit TrustoraPay.PaymentSent(alice, bob, address(noRet), 10e6, "usdt", block.timestamp);
        vm.prank(alice);
        router.sendToken(address(noRet), bob, 10e6, "usdt");
        assertEq(noRet.balanceOf(bob), 10e6);
        assertEq(noRet.balanceOf(alice), 990e6);
    }

    function test_SendToken_Note280Passes_281Reverts() public {
        vm.prank(alice);
        router.sendToken(address(token), bob, 1, _note(280));
        assertEq(token.balanceOf(bob), 1);

        vm.prank(alice);
        vm.expectRevert(TrustoraPay.NoteTooLong.selector);
        router.sendToken(address(token), bob, 1, _note(281));
    }

    // ───── sendToken: reverts ─────

    function test_SendToken_RevertsZeroTokenAddress() public {
        vm.prank(alice);
        vm.expectRevert(TrustoraPay.InvalidToken.selector);
        router.sendToken(address(0), bob, 1, "");
    }

    function test_SendToken_RevertsNoCodeToken() public {
        vm.prank(alice);
        vm.expectRevert(TrustoraPay.InvalidToken.selector);
        router.sendToken(makeAddr("eoa"), bob, 1, "");
    }

    function test_SendToken_RevertsZeroRecipient() public {
        vm.prank(alice);
        vm.expectRevert(TrustoraPay.ZeroRecipient.selector);
        router.sendToken(address(token), address(0), 1, "");
    }

    function test_SendToken_RevertsSelfRecipient() public {
        vm.prank(alice);
        vm.expectRevert(TrustoraPay.SelfRecipient.selector);
        router.sendToken(address(token), address(router), 1, "");
    }

    function test_SendToken_RevertsZeroAmount() public {
        vm.prank(alice);
        vm.expectRevert(TrustoraPay.ZeroAmount.selector);
        router.sendToken(address(token), bob, 0, "");
    }

    function test_SendToken_InvalidTokenCheckedFirst() public {
        vm.prank(alice);
        vm.expectRevert(TrustoraPay.InvalidToken.selector);
        router.sendToken(address(0), address(0), 0, _note(281));
    }

    function test_SendToken_FalseReturningTokenReverts() public {
        FalseToken f = new FalseToken();
        vm.prank(alice);
        vm.expectRevert(TrustoraPay.TokenTransferFailed.selector);
        router.sendToken(address(f), bob, 1, "");
    }

    function test_SendToken_RevertingTokenReverts() public {
        RevertingToken t = new RevertingToken();
        vm.prank(alice);
        vm.expectRevert(TrustoraPay.TokenTransferFailed.selector);
        router.sendToken(address(t), bob, 1, "");
    }

    function test_SendToken_WeirdReturnValueReverts() public {
        // returndata word == 2 is not a valid bool -> abi.decode panics/reverts.
        WeirdReturnToken w = new WeirdReturnToken();
        vm.prank(alice);
        vm.expectRevert();
        router.sendToken(address(w), bob, 1, "");
    }

    function test_SendToken_InsufficientAllowanceReverts() public {
        address carol = makeAddr("carol");
        token.mint(carol, 100e6);
        vm.prank(carol);
        token.approve(address(router), 10e6);
        vm.prank(carol);
        vm.expectRevert(TrustoraPay.TokenTransferFailed.selector);
        router.sendToken(address(token), bob, 11e6, "");
        assertEq(token.balanceOf(carol), 100e6);
        assertEq(token.balanceOf(bob), 0);
    }

    function test_SendToken_NoAllowanceNoReturnTokenReverts() public {
        address carol = makeAddr("carol");
        noRet.mint(carol, 100e6);
        vm.prank(carol);
        vm.expectRevert(TrustoraPay.TokenTransferFailed.selector);
        router.sendToken(address(noRet), bob, 1, "");
    }

    function test_SendToken_InsufficientBalanceReverts() public {
        vm.prank(alice);
        vm.expectRevert(TrustoraPay.TokenTransferFailed.selector);
        router.sendToken(address(token), bob, 1_000e6 + 1, "");
        assertEq(token.balanceOf(alice), 1_000e6);
    }

    // ───── reentrancy ─────

    function test_Reentrancy_NestedPaymentKeepsAccountingExact() public {
        ReentrantRecipient atk = new ReentrantRecipient(router, bob, 1);
        vm.recordLogs();
        vm.prank(alice);
        router.sendNative{value: 10 ether}(payable(address(atk)), "outer");

        assertTrue(atk.innerOk());
        assertEq(atk.hits(), 1);
        assertEq(bob.balance, 4 ether);
        assertEq(address(atk).balance, 6 ether);
        assertEq(alice.balance, 90 ether);
        assertEq(address(router).balance, 0);
        // inner event is emitted first, then the outer one
        assertEq(vm.getRecordedLogs().length, 2);
    }

    function test_Reentrancy_SelfRecipientReentryRejectedOuterSucceeds() public {
        ReentrantRecipient atk = new ReentrantRecipient(router, bob, 2);
        vm.prank(alice);
        router.sendNative{value: 1 ether}(payable(address(atk)), "outer");
        assertFalse(atk.innerOk());
        assertEq(bytes4(atk.innerErr()), TrustoraPay.SelfRecipient.selector);
        assertEq(address(atk).balance, 1 ether);
        assertEq(address(router).balance, 0);
    }

    function test_Reentrancy_PayingItselfConservesFunds() public {
        ReentrantRecipient atk = new ReentrantRecipient(router, bob, 3);
        vm.prank(alice);
        router.sendNative{value: 1 ether}(payable(address(atk)), "outer");
        assertTrue(atk.innerOk());
        assertEq(address(atk).balance, 1 ether);
        assertEq(address(router).balance, 0);
        assertEq(alice.balance, 99 ether);
    }

    // ───── fuzz ─────

    function _validRecipient(address r) internal view {
        vm.assume(uint160(r) > 0xFFFF);
        vm.assume(r != address(router) && r != address(this) && r != alice);
        vm.assume(r.code.length == 0);
    }

    function testFuzz_SendNative_ForwardsExactAmount(address recipient, uint96 amount, uint16 noteLen) public {
        _validRecipient(recipient);
        amount = uint96(bound(amount, 1, 100 ether));
        uint256 len = bound(noteLen, 0, 280);
        uint256 before = recipient.balance;
        uint256 aliceBefore = alice.balance;

        vm.expectEmit(true, true, true, true, address(router));
        emit TrustoraPay.PaymentSent(alice, recipient, address(0), amount, _note(len), block.timestamp);
        vm.prank(alice);
        router.sendNative{value: amount}(payable(recipient), _note(len));

        assertEq(recipient.balance, before + amount);
        assertEq(alice.balance, aliceBefore - amount);
        assertEq(address(router).balance, 0);
    }

    function testFuzz_SendNative_NoteTooLongAlwaysReverts(uint16 extra) public {
        uint256 len = 281 + bound(extra, 0, 2000);
        vm.prank(alice);
        vm.expectRevert(TrustoraPay.NoteTooLong.selector);
        router.sendNative{value: 1}(bob, _note(len));
    }

    function testFuzz_SendToken_MovesExactAmount(address recipient, uint256 amount, uint16 noteLen) public {
        _validRecipient(recipient);
        amount = bound(amount, 1, 1_000e6);
        uint256 len = bound(noteLen, 0, 280);

        vm.expectEmit(true, true, true, true, address(router));
        emit TrustoraPay.PaymentSent(alice, recipient, address(token), amount, _note(len), block.timestamp);
        vm.prank(alice);
        router.sendToken(address(token), recipient, amount, _note(len));

        assertEq(token.balanceOf(recipient), amount);
        assertEq(token.balanceOf(alice), 1_000e6 - amount);
        assertEq(token.balanceOf(address(router)), 0);
    }

    function testFuzz_SendToken_NoReturnTokenMovesExactAmount(uint256 amount) public {
        amount = bound(amount, 1, 1_000e6);
        vm.prank(alice);
        router.sendToken(address(noRet), bob, amount, "");
        assertEq(noRet.balanceOf(bob), amount);
        assertEq(noRet.balanceOf(address(router)), 0);
    }

    function testFuzz_SendToken_OverBalanceReverts(uint256 amount) public {
        amount = bound(amount, 1_000e6 + 1, type(uint256).max);
        vm.prank(alice);
        vm.expectRevert(TrustoraPay.TokenTransferFailed.selector);
        router.sendToken(address(token), bob, amount, "");
    }
}
