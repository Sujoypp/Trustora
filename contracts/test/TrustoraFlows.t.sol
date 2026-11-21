// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {TrustoraFlows} from "../TrustoraFlows.sol";

/// @dev Plain 6-decimals ERC-20 that returns `true` from transfer/transferFrom.
contract MockUSDC {
    string public name = "Mock USDC";
    string public symbol = "mUSDC";
    uint8 public constant decimals = 6;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 a) external {
        balanceOf[to] += a;
        totalSupply += a;
    }

    function approve(address s, uint256 a) external returns (bool) {
        allowance[msg.sender][s] = a;
        return true;
    }

    function transfer(address to, uint256 a) external returns (bool) {
        _move(msg.sender, to, a);
        return true;
    }

    function transferFrom(address from, address to, uint256 a) external virtual returns (bool) {
        _spend(from, a);
        _move(from, to, a);
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

/// @dev Token that reverts on any movement touching a blocklisted address.
contract BlocklistUSDC is MockUSDC {
    mapping(address => bool) public blocked;

    function setBlocked(address a, bool b) external {
        blocked[a] = b;
    }

    function _move(address from, address to, uint256 a) internal override {
        require(!blocked[from] && !blocked[to], "blocked");
        super._move(from, to, a);
    }
}

/// @dev USDT-style token: transferFrom returns no data at all.
contract NoReturnToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 a) external {
        balanceOf[to] += a;
    }

    function approve(address s, uint256 a) external {
        allowance[msg.sender][s] = a;
    }

    function transferFrom(address from, address to, uint256 a) external {
        require(allowance[from][msg.sender] >= a, "allowance");
        require(balanceOf[from] >= a, "balance");
        allowance[from][msg.sender] -= a;
        balanceOf[from] -= a;
        balanceOf[to] += a;
    }
}

/// @dev Token with malformed transferFrom return data. mode 0: false, 1: one byte, 2: uint 2.
contract OddReturnToken {
    uint8 public mode;

    function setMode(uint8 m) external {
        mode = m;
    }

    function transferFrom(address, address, uint256) external view returns (bool) {
        uint8 m = mode;
        assembly {
            if eq(m, 1) {
                mstore(0, 1)
                return(0, 1)
            }
            if eq(m, 2) {
                mstore(0, 2)
                return(0, 32)
            }
        }
        return false;
    }
}

/// @dev Token that calls back into a target during transferFrom (one shot).
contract ReentrantToken is MockUSDC {
    address public target;
    bytes public payload;
    bool public bubble;
    bool public armed;
    bool public attempted;
    bool public innerOk;
    bytes public innerRet;

    function arm(address t, bytes calldata p, bool b) external {
        target = t;
        payload = p;
        bubble = b;
        armed = true;
    }

    function transferFrom(address from, address to, uint256 a) external override returns (bool) {
        if (armed) {
            armed = false;
            attempted = true;
            (bool ok, bytes memory r) = target.call(payload);
            innerOk = ok;
            innerRet = r;
            if (!ok && bubble) revert("reenter");
        }
        _spend(from, a);
        _move(from, to, a);
        return true;
    }
}

contract TrustoraFlowsTest is Test {
    TrustoraFlows internal flows;
    MockUSDC internal usdc;

    address internal alice = makeAddr("alice"); // issuer / payee
    address internal bob = makeAddr("bob"); // payer
    address internal carol = makeAddr("carol");
    address internal dave = makeAddr("dave");

    uint256 internal constant T0 = 1_700_000_000;
    uint256 internal constant FUND = 1_000_000e6;

    function setUp() public {
        vm.warp(T0);
        usdc = new MockUSDC();
        flows = new TrustoraFlows(address(usdc));
        _fund(usdc, flows, bob);
        _fund(usdc, flows, carol);
    }

    // ------------------------------------------------------------------ helpers

    function _fund(MockUSDC t, TrustoraFlows f, address user) internal {
        t.mint(user, FUND);
        vm.prank(user);
        t.approve(address(f), type(uint256).max);
    }

    function _invoice(address payer, uint128 amt) internal returns (uint256) {
        vm.prank(alice);
        return flows.createInvoice(payer, amt, 0, "inv");
    }

    function _two(address a, uint128 x, address b, uint128 y)
        internal
        pure
        returns (address[] memory r, uint128[] memory v)
    {
        r = new address[](2);
        v = new uint128[](2);
        r[0] = a;
        r[1] = b;
        v[0] = x;
        v[1] = y;
    }

    function _many(uint256 n, uint128 amt) internal pure returns (address[] memory r, uint128[] memory v) {
        r = new address[](n);
        v = new uint128[](n);
        for (uint256 i; i < n; ++i) {
            r[i] = address(uint160(0x1000 + i));
            v[i] = amt;
        }
    }

    function _sched(uint128 amt, uint64 interval, uint32 n) internal returns (uint256) {
        vm.prank(bob);
        return flows.createSchedule(alice, amt, interval, 0, n, "rent");
    }

    function _assertNoBalance() internal view {
        assertEq(usdc.balanceOf(address(flows)), 0, "flows holds USDC");
    }

    // ------------------------------------------------------------- constructor

    function test_Constructor_SetsState() public view {
        assertEq(flows.usdc(), address(usdc));
        assertEq(flows.nextInvoiceId(), 1);
        assertEq(flows.nextSplitId(), 1);
        assertEq(flows.nextScheduleId(), 1);
        assertEq(flows.MAX_MEMO_BYTES(), 280);
        assertEq(flows.MAX_SPLIT_RECIPIENTS(), 50);
        assertEq(flows.MIN_INTERVAL(), 1 hours);
        assertEq(flows.MAX_INTERVAL(), 365 days);
        assertEq(flows.MAX_PAYMENTS(), 1000);
    }

    function test_Constructor_RevertsOnZeroToken() public {
        vm.expectRevert(TrustoraFlows.InvalidToken.selector);
        new TrustoraFlows(address(0));
    }

    function test_NonContractToken_PaymentReverts() public {
        TrustoraFlows f = new TrustoraFlows(makeAddr("eoaToken"));
        vm.prank(alice);
        uint256 id = f.createInvoice(address(0), 1, 0, "");
        vm.prank(bob);
        vm.expectRevert(TrustoraFlows.InvalidToken.selector);
        f.payInvoice(id);
    }

    // ----------------------------------------------------------------- invoices

    function test_CreateInvoice_Open() public {
        vm.expectEmit(true, true, true, true, address(flows));
        emit TrustoraFlows.InvoiceCreated(1, alice, address(0), 100e6, uint64(T0 + 1 days), "memo");
        vm.prank(alice);
        uint256 id = flows.createInvoice(address(0), 100e6, uint64(T0 + 1 days), "memo");

        assertEq(id, 1);
        assertEq(flows.nextInvoiceId(), 2);
        TrustoraFlows.Invoice memory inv = flows.getInvoice(1);
        assertEq(inv.issuer, alice);
        assertEq(inv.payer, address(0));
        assertEq(inv.amount, 100e6);
        assertEq(inv.dueAt, T0 + 1 days);
        assertEq(inv.createdAt, T0);
        assertEq(inv.createdBlock, block.number);
        assertEq(inv.paidAt, 0);
        assertEq(inv.paidBy, address(0));
        assertEq(uint8(inv.status), uint8(TrustoraFlows.InvoiceStatus.Open));
        assertEq(inv.memo, "memo");
    }

    function test_CreateInvoice_Designated() public {
        uint256 id = _invoice(bob, 5e6);
        assertEq(flows.getInvoice(id).payer, bob);
    }

    function test_CreateInvoice_RevertsSelfPayer() public {
        vm.prank(alice);
        vm.expectRevert(TrustoraFlows.SelfRecipient.selector);
        flows.createInvoice(alice, 1, 0, "");
    }

    function test_CreateInvoice_RevertsZeroAmount() public {
        vm.prank(alice);
        vm.expectRevert(TrustoraFlows.ZeroAmount.selector);
        flows.createInvoice(bob, 0, 0, "");
    }

    function test_CreateInvoice_RevertsPastOrCurrentDue() public {
        vm.startPrank(alice);
        vm.expectRevert(TrustoraFlows.InvalidTime.selector);
        flows.createInvoice(bob, 1, uint64(T0), "");
        vm.expectRevert(TrustoraFlows.InvalidTime.selector);
        flows.createInvoice(bob, 1, uint64(T0 - 1), "");
        flows.createInvoice(bob, 1, uint64(T0 + 1), ""); // just in the future is OK
        vm.stopPrank();
    }

    function test_CreateInvoice_MemoLimit() public {
        vm.startPrank(alice);
        flows.createInvoice(bob, 1, 0, string(new bytes(280)));
        vm.expectRevert(TrustoraFlows.NoteTooLong.selector);
        flows.createInvoice(bob, 1, 0, string(new bytes(281)));
        vm.stopPrank();
    }

    function test_PayInvoice_OpenPayer() public {
        uint256 id = _invoice(address(0), 100e6);
        vm.warp(T0 + 10);
        vm.expectEmit(true, true, true, true, address(flows));
        emit TrustoraFlows.InvoicePaid(id, alice, carol, 100e6);
        vm.prank(carol);
        flows.payInvoice(id);

        assertEq(usdc.balanceOf(alice), 100e6);
        assertEq(usdc.balanceOf(carol), FUND - 100e6);
        TrustoraFlows.Invoice memory inv = flows.getInvoice(id);
        assertEq(uint8(inv.status), uint8(TrustoraFlows.InvoiceStatus.Paid));
        assertEq(inv.paidBy, carol);
        assertEq(inv.paidAt, T0 + 10);
        _assertNoBalance();
    }

    function test_PayInvoice_DesignatedPayer() public {
        uint256 id = _invoice(bob, 40e6);
        vm.prank(bob);
        flows.payInvoice(id);
        assertEq(usdc.balanceOf(alice), 40e6);
        assertEq(flows.getInvoice(id).paidBy, bob);
        _assertNoBalance();
    }

    function test_PayInvoice_WrongPayerReverts() public {
        uint256 id = _invoice(bob, 40e6);
        vm.prank(carol);
        vm.expectRevert(TrustoraFlows.Unauthorized.selector);
        flows.payInvoice(id);
        assertEq(usdc.balanceOf(alice), 0);
    }

    function test_PayInvoice_IssuerCannotPayOwnOpenInvoice() public {
        uint256 id = _invoice(address(0), 40e6);
        vm.prank(alice);
        vm.expectRevert(TrustoraFlows.SelfRecipient.selector);
        flows.payInvoice(id);
    }

    function test_PayInvoice_IssuerOnDesignatedInvoiceIsUnauthorized() public {
        uint256 id = _invoice(bob, 40e6);
        vm.prank(alice);
        vm.expectRevert(TrustoraFlows.Unauthorized.selector);
        flows.payInvoice(id);
    }

    function test_PayInvoice_DoublePayReverts() public {
        uint256 id = _invoice(address(0), 10e6);
        vm.prank(bob);
        flows.payInvoice(id);
        vm.prank(carol);
        vm.expectRevert(TrustoraFlows.InvalidStatus.selector);
        flows.payInvoice(id);
        assertEq(usdc.balanceOf(alice), 10e6);
    }

    function test_PayInvoice_LatePaymentAllowed() public {
        vm.prank(alice);
        uint256 id = flows.createInvoice(bob, 10e6, uint64(T0 + 1 days), "late");
        vm.warp(T0 + 30 days);
        vm.prank(bob);
        flows.payInvoice(id);
        assertEq(usdc.balanceOf(alice), 10e6);
        assertEq(flows.getInvoice(id).paidAt, T0 + 30 days);
    }

    function test_PayInvoice_InsufficientAllowanceRollsBack() public {
        uint256 id = _invoice(bob, 10e6);
        vm.prank(bob);
        usdc.approve(address(flows), 9e6);
        vm.prank(bob);
        vm.expectRevert(TrustoraFlows.TokenTransferFailed.selector);
        flows.payInvoice(id);
        TrustoraFlows.Invoice memory inv = flows.getInvoice(id);
        assertEq(uint8(inv.status), uint8(TrustoraFlows.InvoiceStatus.Open));
        assertEq(inv.paidBy, address(0));
        assertEq(inv.paidAt, 0);
    }

    function test_PayInvoice_InsufficientBalanceReverts() public {
        uint256 id = _invoice(dave, 10e6); // dave has no funds, no allowance
        vm.prank(dave);
        vm.expectRevert(TrustoraFlows.TokenTransferFailed.selector);
        flows.payInvoice(id);
        assertEq(uint8(flows.getInvoice(id).status), uint8(TrustoraFlows.InvoiceStatus.Open));
    }

    function test_CancelInvoice_ByIssuer() public {
        uint256 id = _invoice(bob, 10e6);
        vm.expectEmit(true, true, false, true, address(flows));
        emit TrustoraFlows.InvoiceCancelled(id, alice);
        vm.prank(alice);
        flows.cancelInvoice(id);
        assertEq(uint8(flows.getInvoice(id).status), uint8(TrustoraFlows.InvoiceStatus.Cancelled));

        vm.prank(bob);
        vm.expectRevert(TrustoraFlows.InvalidStatus.selector);
        flows.payInvoice(id);
    }

    function test_CancelInvoice_NonIssuerReverts() public {
        uint256 id = _invoice(bob, 10e6);
        vm.prank(bob);
        vm.expectRevert(TrustoraFlows.Unauthorized.selector);
        flows.cancelInvoice(id);
        vm.prank(carol);
        vm.expectRevert(TrustoraFlows.Unauthorized.selector);
        flows.cancelInvoice(id);
    }

    function test_CancelInvoice_AfterPayReverts() public {
        uint256 id = _invoice(bob, 10e6);
        vm.prank(bob);
        flows.payInvoice(id);
        vm.prank(alice);
        vm.expectRevert(TrustoraFlows.InvalidStatus.selector);
        flows.cancelInvoice(id);
    }

    function test_CancelInvoice_TwiceReverts() public {
        uint256 id = _invoice(bob, 10e6);
        vm.startPrank(alice);
        flows.cancelInvoice(id);
        vm.expectRevert(TrustoraFlows.InvalidStatus.selector);
        flows.cancelInvoice(id);
        vm.stopPrank();
    }

    function test_Invoice_NotFound() public {
        vm.expectRevert(TrustoraFlows.NotFound.selector);
        flows.getInvoice(0);
        vm.expectRevert(TrustoraFlows.NotFound.selector);
        flows.getInvoice(1);
        vm.expectRevert(TrustoraFlows.NotFound.selector);
        flows.payInvoice(1);
        vm.expectRevert(TrustoraFlows.NotFound.selector);
        flows.cancelInvoice(99);
    }

    function test_InvoiceIdsOf_BothParties() public {
        uint256 a = _invoice(bob, 1e6);
        uint256 b = _invoice(address(0), 1e6);
        uint256 c = _invoice(carol, 1e6);

        uint256[] memory aliceIds = flows.invoiceIdsOf(alice);
        assertEq(aliceIds.length, 3);
        assertEq(aliceIds[0], a);
        assertEq(aliceIds[1], b);
        assertEq(aliceIds[2], c);

        uint256[] memory bobIds = flows.invoiceIdsOf(bob);
        assertEq(bobIds.length, 1);
        assertEq(bobIds[0], a);
        assertEq(flows.invoiceIdsOf(carol).length, 1);
        assertEq(flows.invoiceIdsOf(dave).length, 0);
        assertEq(flows.invoiceIdsOf(address(0)).length, 0); // open invoices not indexed under zero
    }

    function testFuzz_Invoice_PayMovesExactAmount(uint128 amt, address payer) public {
        amt = uint128(bound(amt, 1, FUND));
        vm.assume(payer != alice && payer != address(0) && payer != address(flows) && payer != address(usdc));
        vm.assume(payer != bob && payer != carol);
        usdc.mint(payer, amt);
        vm.prank(payer);
        usdc.approve(address(flows), amt);
        uint256 id = _invoice(address(0), amt);
        vm.prank(payer);
        flows.payInvoice(id);
        assertEq(usdc.balanceOf(alice), amt);
        assertEq(usdc.balanceOf(payer), 0);
        _assertNoBalance();
    }

    // -------------------------------------------------------------------- splits

    function test_Split_EqualLegs() public {
        address[] memory r = new address[](3);
        uint128[] memory v = new uint128[](3);
        r[0] = alice;
        r[1] = carol;
        r[2] = dave;
        for (uint256 i; i < 3; ++i) v[i] = 10e6;

        vm.expectEmit(true, true, false, true, address(flows));
        emit TrustoraFlows.SplitLeg(1, alice, 10e6);
        vm.expectEmit(true, true, false, true, address(flows));
        emit TrustoraFlows.SplitLeg(1, carol, 10e6);
        vm.expectEmit(true, true, false, true, address(flows));
        emit TrustoraFlows.SplitLeg(1, dave, 10e6);
        vm.expectEmit(true, true, false, true, address(flows));
        emit TrustoraFlows.SplitPaid(1, bob, 30e6, 3, "dinner");
        vm.prank(bob);
        uint256 id = flows.split(r, v, "dinner");

        assertEq(id, 1);
        assertEq(usdc.balanceOf(alice), 10e6);
        assertEq(usdc.balanceOf(carol), FUND + 10e6);
        assertEq(usdc.balanceOf(dave), 10e6);
        assertEq(usdc.balanceOf(bob), FUND - 30e6);
        TrustoraFlows.SplitRecord memory s = flows.getSplit(1);
        assertEq(s.sender, bob);
        assertEq(s.total, 30e6);
        assertEq(s.count, 3);
        assertEq(s.createdAt, T0);
        assertEq(s.createdBlock, block.number);
        _assertNoBalance();
    }

    function test_Split_UnequalLegs() public {
        (address[] memory r, uint128[] memory v) = _two(alice, 1e6, dave, 123_456_789);
        vm.prank(bob);
        flows.split(r, v, "");
        assertEq(usdc.balanceOf(alice), 1e6);
        assertEq(usdc.balanceOf(dave), 123_456_789);
        assertEq(flows.getSplit(1).total, 124_456_789);
        _assertNoBalance();
    }

    function test_Split_DuplicateRecipientsAccumulate() public {
        (address[] memory r, uint128[] memory v) = _two(alice, 3e6, alice, 4e6);
        vm.prank(bob);
        flows.split(r, v, "");
        assertEq(usdc.balanceOf(alice), 7e6);
    }

    function test_Split_RevertsEmpty() public {
        address[] memory r = new address[](0);
        uint128[] memory v = new uint128[](0);
        vm.prank(bob);
        vm.expectRevert(TrustoraFlows.InvalidArrayLength.selector);
        flows.split(r, v, "");
    }

    function test_Split_RevertsLengthMismatch() public {
        address[] memory r = new address[](2);
        uint128[] memory v = new uint128[](1);
        r[0] = alice;
        r[1] = dave;
        v[0] = 1;
        vm.prank(bob);
        vm.expectRevert(TrustoraFlows.InvalidArrayLength.selector);
        flows.split(r, v, "");
    }

    function test_Split_FiftyRecipientsOk() public {
        (address[] memory r, uint128[] memory v) = _many(50, 1e6);
        vm.prank(bob);
        flows.split(r, v, "");
        assertEq(flows.getSplit(1).count, 50);
        assertEq(flows.getSplit(1).total, 50e6);
        assertEq(usdc.balanceOf(address(uint160(0x1000))), 1e6);
        assertEq(usdc.balanceOf(address(uint160(0x1000 + 49))), 1e6);
        _assertNoBalance();
    }

    function test_Split_FiftyOneRecipientsReverts() public {
        (address[] memory r, uint128[] memory v) = _many(51, 1e6);
        vm.prank(bob);
        vm.expectRevert(TrustoraFlows.InvalidArrayLength.selector);
        flows.split(r, v, "");
    }

    function test_Split_RevertsZeroRecipient() public {
        (address[] memory r, uint128[] memory v) = _two(alice, 1, address(0), 1);
        vm.prank(bob);
        vm.expectRevert(TrustoraFlows.ZeroRecipient.selector);
        flows.split(r, v, "");
    }

    function test_Split_RevertsSelfRecipient() public {
        (address[] memory r, uint128[] memory v) = _two(alice, 1, bob, 1);
        vm.prank(bob);
        vm.expectRevert(TrustoraFlows.SelfRecipient.selector);
        flows.split(r, v, "");
    }

    function test_Split_RevertsContractRecipient() public {
        (address[] memory r, uint128[] memory v) = _two(alice, 1, address(flows), 1);
        vm.prank(bob);
        vm.expectRevert(TrustoraFlows.SelfRecipient.selector);
        flows.split(r, v, "");
    }

    function test_Split_RevertsZeroAmount() public {
        (address[] memory r, uint128[] memory v) = _two(alice, 1, dave, 0);
        vm.prank(bob);
        vm.expectRevert(TrustoraFlows.ZeroAmount.selector);
        flows.split(r, v, "");
    }

    function test_Split_NoteLimit() public {
        (address[] memory r, uint128[] memory v) = _two(alice, 1, dave, 1);
        vm.startPrank(bob);
        flows.split(r, v, string(new bytes(280)));
        vm.expectRevert(TrustoraFlows.NoteTooLong.selector);
        flows.split(r, v, string(new bytes(281)));
        vm.stopPrank();
    }

    function test_Split_TotalOverflowGuard() public {
        uint128 m = type(uint128).max;
        (address[] memory r, uint128[] memory v) = _two(alice, m, dave, 1);
        vm.prank(bob);
        vm.expectRevert(TrustoraFlows.AmountOverflow.selector);
        flows.split(r, v, "");
    }

    function test_Split_TotalExactlyUint128MaxAccepted() public {
        uint128 m = type(uint128).max;
        usdc.mint(bob, m);
        (address[] memory r, uint128[] memory v) = _two(alice, m - 1, dave, 1);
        vm.prank(bob);
        flows.split(r, v, "");
        assertEq(flows.getSplit(1).total, m);
        assertEq(usdc.balanceOf(alice), m - 1);
    }

    function test_Split_OneLegFailingRevertsAllAndMovesNothing() public {
        BlocklistUSDC bl = new BlocklistUSDC();
        TrustoraFlows f = new TrustoraFlows(address(bl));
        bl.mint(bob, FUND);
        vm.prank(bob);
        bl.approve(address(f), type(uint256).max);
        bl.setBlocked(dave, true);

        address[] memory r = new address[](3);
        uint128[] memory v = new uint128[](3);
        r[0] = alice;
        r[1] = carol;
        r[2] = dave; // last leg fails
        v[0] = 1e6;
        v[1] = 2e6;
        v[2] = 3e6;
        vm.prank(bob);
        vm.expectRevert(TrustoraFlows.TokenTransferFailed.selector);
        f.split(r, v, "x");

        assertEq(bl.balanceOf(bob), FUND);
        assertEq(bl.balanceOf(alice), 0);
        assertEq(bl.balanceOf(carol), 0);
        assertEq(bl.balanceOf(dave), 0);
        assertEq(f.nextSplitId(), 1);
        assertEq(f.splitIdsOf(bob).length, 0);
        vm.expectRevert(TrustoraFlows.NotFound.selector);
        f.getSplit(1);

        // un-block and the very same split succeeds
        bl.setBlocked(dave, false);
        vm.prank(bob);
        f.split(r, v, "x");
        assertEq(bl.balanceOf(dave), 3e6);
        assertEq(bl.balanceOf(address(f)), 0);
    }

    function test_Split_InsufficientBalanceOnLastLegRollsBack() public {
        (address[] memory r, uint128[] memory v) = _two(alice, uint128(FUND), dave, 1);
        vm.prank(bob);
        vm.expectRevert(TrustoraFlows.TokenTransferFailed.selector);
        flows.split(r, v, "");
        assertEq(usdc.balanceOf(bob), FUND);
        assertEq(usdc.balanceOf(alice), 0);
        assertEq(flows.nextSplitId(), 1);
    }

    function test_Split_NotFound() public {
        vm.expectRevert(TrustoraFlows.NotFound.selector);
        flows.getSplit(0);
        vm.expectRevert(TrustoraFlows.NotFound.selector);
        flows.getSplit(1);
    }

    function test_SplitIdsOf_SenderOnly() public {
        (address[] memory r, uint128[] memory v) = _two(alice, 1, dave, 1);
        vm.startPrank(bob);
        flows.split(r, v, "");
        flows.split(r, v, "");
        vm.stopPrank();
        vm.prank(carol);
        flows.split(r, v, "");

        uint256[] memory ids = flows.splitIdsOf(bob);
        assertEq(ids.length, 2);
        assertEq(ids[0], 1);
        assertEq(ids[1], 2);
        assertEq(flows.splitIdsOf(carol).length, 1);
        assertEq(flows.splitIdsOf(alice).length, 0); // recipients are not indexed
    }

    // ---------------------------------------------------------- token variants

    function test_NoReturnToken_AllFlowsWork() public {
        NoReturnToken t = new NoReturnToken();
        TrustoraFlows f = new TrustoraFlows(address(t));
        t.mint(bob, 100e6);
        vm.prank(bob);
        t.approve(address(f), type(uint256).max);

        vm.prank(alice);
        uint256 inv = f.createInvoice(bob, 10e6, 0, "");
        vm.prank(bob);
        f.payInvoice(inv);
        assertEq(t.balanceOf(alice), 10e6);

        (address[] memory r, uint128[] memory v) = _two(carol, 5e6, dave, 6e6);
        vm.prank(bob);
        f.split(r, v, "");
        assertEq(t.balanceOf(carol), 5e6);
        assertEq(t.balanceOf(dave), 6e6);

        vm.prank(bob);
        uint256 sid = f.createSchedule(alice, 7e6, 1 hours, 0, 2, "");
        f.executeSchedule(sid);
        assertEq(t.balanceOf(alice), 17e6);
        assertEq(t.balanceOf(address(f)), 0);
    }

    function test_NoReturnToken_FailureStillReverts() public {
        NoReturnToken t = new NoReturnToken();
        TrustoraFlows f = new TrustoraFlows(address(t));
        vm.prank(alice);
        uint256 inv = f.createInvoice(address(0), 10e6, 0, "");
        vm.prank(bob); // no balance / allowance
        vm.expectRevert(TrustoraFlows.TokenTransferFailed.selector);
        f.payInvoice(inv);
    }

    function test_OddReturnToken_RejectedReturnValues() public {
        OddReturnToken t = new OddReturnToken();
        TrustoraFlows f = new TrustoraFlows(address(t));
        vm.prank(alice);
        uint256 inv = f.createInvoice(address(0), 10e6, 0, "");
        for (uint8 m; m < 3; ++m) {
            t.setMode(m); // false, 1 byte, uint 2
            vm.prank(bob);
            vm.expectRevert(TrustoraFlows.TokenTransferFailed.selector);
            f.payInvoice(inv);
        }
        assertEq(uint8(f.getInvoice(inv).status), uint8(TrustoraFlows.InvoiceStatus.Open));
    }

    // -------------------------------------------------------------- reentrancy

    function _reentSetup() internal returns (ReentrantToken rt, TrustoraFlows f) {
        rt = new ReentrantToken();
        f = new TrustoraFlows(address(rt));
        rt.mint(bob, FUND);
        vm.prank(bob);
        rt.approve(address(f), type(uint256).max);
    }

    function _assertBlocked(ReentrantToken rt) internal view {
        assertTrue(rt.attempted(), "callback not attempted");
        assertFalse(rt.innerOk(), "reentrant call succeeded");
        assertEq(bytes4(rt.innerRet()), TrustoraFlows.Reentrancy.selector);
    }

    function test_Reentrancy_PayInvoiceCannotDoublePay() public {
        (ReentrantToken rt, TrustoraFlows f) = _reentSetup();
        vm.prank(alice);
        uint256 id = f.createInvoice(address(0), 10e6, 0, "");
        rt.arm(address(f), abi.encodeCall(f.payInvoice, (id)), false);
        vm.prank(bob);
        f.payInvoice(id);

        _assertBlocked(rt);
        assertEq(rt.balanceOf(alice), 10e6);
        assertEq(rt.balanceOf(bob), FUND - 10e6);
        assertEq(rt.balanceOf(address(f)), 0);
        // guard released afterwards
        vm.prank(alice);
        f.createInvoice(address(0), 1, 0, "");
    }

    function test_Reentrancy_BubbledRevertRollsBackInvoice() public {
        (ReentrantToken rt, TrustoraFlows f) = _reentSetup();
        vm.prank(alice);
        uint256 id = f.createInvoice(address(0), 10e6, 0, "");
        rt.arm(address(f), abi.encodeCall(f.createInvoice, (address(0), 1, 0, "")), true);
        vm.prank(bob);
        vm.expectRevert(TrustoraFlows.TokenTransferFailed.selector);
        f.payInvoice(id);
        assertEq(uint8(f.getInvoice(id).status), uint8(TrustoraFlows.InvoiceStatus.Open));
        assertEq(f.nextInvoiceId(), 2);
        assertEq(rt.balanceOf(alice), 0);
    }

    function test_Reentrancy_SplitCannotNestSplit() public {
        (ReentrantToken rt, TrustoraFlows f) = _reentSetup();
        (address[] memory r, uint128[] memory v) = _two(alice, 1e6, dave, 2e6);
        rt.arm(address(f), abi.encodeCall(f.split, (r, v, "")), false);
        vm.prank(bob);
        f.split(r, v, "");

        _assertBlocked(rt);
        assertEq(f.nextSplitId(), 2); // only the outer split recorded
        assertEq(rt.balanceOf(alice), 1e6);
        assertEq(rt.balanceOf(dave), 2e6);
        assertEq(rt.balanceOf(bob), FUND - 3e6);
    }

    function test_Reentrancy_ExecuteScheduleCannotDoubleExecute() public {
        (ReentrantToken rt, TrustoraFlows f) = _reentSetup();
        vm.prank(bob);
        uint256 id = f.createSchedule(alice, 5e6, 1 hours, 0, 5, "");
        rt.arm(address(f), abi.encodeCall(f.executeSchedule, (id)), false);
        f.executeSchedule(id);

        _assertBlocked(rt);
        assertEq(rt.balanceOf(alice), 5e6);
        TrustoraFlows.Schedule memory s = f.getSchedule(id);
        assertEq(s.executed, 1);
        assertEq(s.remaining, 4);
    }

    function test_Reentrancy_CancelDuringExecuteBlocked() public {
        (ReentrantToken rt, TrustoraFlows f) = _reentSetup();
        vm.prank(bob);
        uint256 id = f.createSchedule(alice, 5e6, 1 hours, 0, 5, "");
        // the token itself is not the payer so this would be Unauthorized anyway;
        // the guard must fire first.
        rt.arm(address(f), abi.encodeCall(f.cancelSchedule, (id)), false);
        f.executeSchedule(id);
        _assertBlocked(rt);
        assertTrue(f.getSchedule(id).active);
    }

    // ---------------------------------------------------------------- schedules

    function test_CreateSchedule_DefaultsFirstAtToNow() public {
        vm.expectEmit(true, true, true, true, address(flows));
        emit TrustoraFlows.ScheduleCreated(1, bob, alice, 10e6, 1 days, uint64(T0), 3, "rent");
        uint256 id = _sched(10e6, 1 days, 3);

        assertEq(id, 1);
        assertEq(flows.nextScheduleId(), 2);
        TrustoraFlows.Schedule memory s = flows.getSchedule(id);
        assertEq(s.payer, bob);
        assertEq(s.payee, alice);
        assertEq(s.amount, 10e6);
        assertEq(s.interval, 1 days);
        assertEq(s.nextAt, T0);
        assertEq(s.remaining, 3);
        assertEq(s.executed, 0);
        assertTrue(s.active);
        assertEq(s.createdBlock, block.number);
        assertEq(s.note, "rent");
        // creation moves nothing
        assertEq(usdc.balanceOf(bob), FUND);
        assertEq(usdc.balanceOf(alice), 0);
    }

    function test_CreateSchedule_ExplicitFirstAt() public {
        vm.prank(bob);
        uint256 id = flows.createSchedule(alice, 1e6, 1 hours, uint64(T0 + 5 days), 1, "");
        assertEq(flows.getSchedule(id).nextAt, T0 + 5 days);
        // firstAt == now is accepted
        vm.prank(bob);
        id = flows.createSchedule(alice, 1e6, 1 hours, uint64(T0), 1, "");
        assertEq(flows.getSchedule(id).nextAt, T0);
    }

    function test_CreateSchedule_Validation() public {
        vm.startPrank(bob);
        vm.expectRevert(TrustoraFlows.ZeroRecipient.selector);
        flows.createSchedule(address(0), 1, 1 days, 0, 1, "");
        vm.expectRevert(TrustoraFlows.SelfRecipient.selector);
        flows.createSchedule(bob, 1, 1 days, 0, 1, "");
        vm.expectRevert(TrustoraFlows.SelfRecipient.selector);
        flows.createSchedule(address(flows), 1, 1 days, 0, 1, "");
        vm.expectRevert(TrustoraFlows.ZeroAmount.selector);
        flows.createSchedule(alice, 0, 1 days, 0, 1, "");
        vm.expectRevert(TrustoraFlows.InvalidInterval.selector);
        flows.createSchedule(alice, 1, 1 hours - 1, 0, 1, "");
        vm.expectRevert(TrustoraFlows.InvalidInterval.selector);
        flows.createSchedule(alice, 1, 365 days + 1, 0, 1, "");
        vm.expectRevert(TrustoraFlows.InvalidTime.selector);
        flows.createSchedule(alice, 1, 1 days, uint64(T0 - 1), 1, "");
        vm.expectRevert(TrustoraFlows.InvalidPaymentCount.selector);
        flows.createSchedule(alice, 1, 1 days, 0, 0, "");
        vm.expectRevert(TrustoraFlows.InvalidPaymentCount.selector);
        flows.createSchedule(alice, 1, 1 days, 0, 1001, "");
        vm.expectRevert(TrustoraFlows.NoteTooLong.selector);
        flows.createSchedule(alice, 1, 1 days, 0, 1, string(new bytes(281)));
        vm.stopPrank();
    }

    function test_CreateSchedule_BoundariesAccepted() public {
        vm.startPrank(bob);
        flows.createSchedule(alice, 1, 1 hours, 0, 1, "");
        flows.createSchedule(alice, 1, 365 days, 0, 1000, "");
        flows.createSchedule(alice, 1, 1 days, 0, 1, string(new bytes(280)));
        vm.stopPrank();
        assertEq(flows.nextScheduleId(), 4);
    }

    function test_CreateSchedule_TimeOverflowGuard() public {
        vm.startPrank(bob);
        vm.expectRevert(TrustoraFlows.ValueOverflow.selector);
        flows.createSchedule(alice, 1, 1 hours, type(uint64).max, 1, "");
        // nextAt + interval * maxPayments == uint64.max is the last accepted value
        flows.createSchedule(alice, 1, 1 hours, type(uint64).max - 2 hours, 2, "");
        vm.expectRevert(TrustoraFlows.ValueOverflow.selector);
        flows.createSchedule(alice, 1, 1 hours, type(uint64).max - 2 hours + 1, 2, "");
        vm.stopPrank();
    }

    function test_ExecuteSchedule_BeforeDueReverts() public {
        vm.prank(bob);
        uint256 id = flows.createSchedule(alice, 1e6, 1 days, uint64(T0 + 1 days), 2, "");
        vm.expectRevert(TrustoraFlows.InvalidTime.selector);
        flows.executeSchedule(id);
        vm.warp(T0 + 1 days - 1);
        vm.expectRevert(TrustoraFlows.InvalidTime.selector);
        flows.executeSchedule(id);
        vm.warp(T0 + 1 days); // exactly due
        flows.executeSchedule(id);
        assertEq(usdc.balanceOf(alice), 1e6);
    }

    function test_ExecuteSchedule_ThirdPartyPaysPayeeExactly() public {
        uint256 id = _sched(25e6, 7 days, 4);
        vm.expectEmit(true, true, true, true, address(flows));
        emit TrustoraFlows.ScheduleExecuted(id, bob, alice, 25e6, 1, dave);
        vm.prank(dave);
        flows.executeSchedule(id);

        assertEq(usdc.balanceOf(alice), 25e6);
        assertEq(usdc.balanceOf(bob), FUND - 25e6);
        assertEq(usdc.balanceOf(dave), 0); // executor neither pays nor earns
        _assertNoBalance();
    }

    function test_ExecuteSchedule_Bookkeeping() public {
        uint256 id = _sched(1e6, 1 days, 3);
        for (uint256 i = 1; i <= 3; ++i) {
            TrustoraFlows.Schedule memory s = flows.getSchedule(id);
            assertEq(s.executed, i - 1);
            assertEq(s.remaining, 3 - (i - 1));
            assertEq(s.nextAt, T0 + (i - 1) * 1 days);
            assertTrue(s.active);

            vm.warp(T0 + (i - 1) * 1 days);
            vm.prank(carol);
            flows.executeSchedule(id);

            s = flows.getSchedule(id);
            assertEq(s.executed, i);
            assertEq(s.remaining, 3 - i);
            assertEq(s.nextAt, T0 + i * 1 days);
            assertEq(s.active, i < 3); // final payment deactivates
        }
        assertEq(usdc.balanceOf(alice), 3e6);
        vm.warp(T0 + 10 days);
        vm.expectRevert(TrustoraFlows.InvalidStatus.selector);
        flows.executeSchedule(id);
        assertEq(usdc.balanceOf(alice), 3e6);
        _assertNoBalance();
    }

    function test_ExecuteSchedule_SinglePaymentDeactivates() public {
        uint256 id = _sched(1e6, 1 hours, 1);
        flows.executeSchedule(id);
        assertFalse(flows.getSchedule(id).active);
        assertEq(flows.getSchedule(id).remaining, 0);
        vm.prank(bob);
        vm.expectRevert(TrustoraFlows.InvalidStatus.selector); // cancel after completion
        flows.cancelSchedule(id);
    }

    function test_ExecuteSchedule_InsufficientAllowanceRollsBack() public {
        uint256 id = _sched(10e6, 1 days, 1); // final payment: `active=false` must roll back too
        vm.prank(bob);
        usdc.approve(address(flows), 10e6 - 1);
        vm.expectRevert(TrustoraFlows.TokenTransferFailed.selector);
        flows.executeSchedule(id);

        TrustoraFlows.Schedule memory s = flows.getSchedule(id);
        assertEq(s.nextAt, T0);
        assertEq(s.remaining, 1);
        assertEq(s.executed, 0);
        assertTrue(s.active);
        assertEq(usdc.balanceOf(alice), 0);

        // restoring the allowance makes the same call succeed
        vm.prank(bob);
        usdc.approve(address(flows), 10e6);
        flows.executeSchedule(id);
        assertEq(usdc.balanceOf(alice), 10e6);
        assertFalse(flows.getSchedule(id).active);
    }

    function test_ExecuteSchedule_InsufficientBalanceRollsBack() public {
        vm.prank(bob);
        uint256 id = flows.createSchedule(alice, uint128(FUND + 1), 1 days, 0, 3, "");
        vm.expectRevert(TrustoraFlows.TokenTransferFailed.selector);
        flows.executeSchedule(id);
        TrustoraFlows.Schedule memory s = flows.getSchedule(id);
        assertEq(s.executed, 0);
        assertEq(s.remaining, 3);
        assertEq(s.nextAt, T0);
    }

    function test_ExecuteSchedule_CatchUpOneCallAtATime() public {
        uint256 id = _sched(1e6, 1 days, 10);
        vm.warp(T0 + 2 days + 1); // periods at T0, T0+1d, T0+2d are due
        for (uint256 i = 1; i <= 3; ++i) {
            vm.expectEmit(true, true, true, true, address(flows));
            emit TrustoraFlows.ScheduleExecuted(id, bob, alice, 1e6, uint32(i), dave);
            vm.prank(dave);
            flows.executeSchedule(id);
        }
        assertEq(usdc.balanceOf(alice), 3e6);
        assertEq(flows.getSchedule(id).nextAt, T0 + 3 days);
        vm.expectRevert(TrustoraFlows.InvalidTime.selector);
        flows.executeSchedule(id);

        vm.warp(T0 + 3 days);
        flows.executeSchedule(id);
        assertEq(usdc.balanceOf(alice), 4e6);
    }

    function test_ExecuteSchedule_LongIdleDoesNotDriftOrOverpay() public {
        uint256 id = _sched(1e6, 1 days, 5);
        vm.warp(T0 + 100 days);
        for (uint256 i; i < 5; ++i) flows.executeSchedule(id);
        TrustoraFlows.Schedule memory s = flows.getSchedule(id);
        assertEq(s.nextAt, T0 + 5 days);
        assertEq(s.executed, 5);
        assertFalse(s.active);
        vm.expectRevert(TrustoraFlows.InvalidStatus.selector);
        flows.executeSchedule(id);
        assertEq(usdc.balanceOf(alice), 5e6);
    }

    function test_CancelSchedule_PayerOnly() public {
        uint256 id = _sched(1e6, 1 days, 3);
        vm.prank(alice); // payee
        vm.expectRevert(TrustoraFlows.Unauthorized.selector);
        flows.cancelSchedule(id);
        vm.prank(dave);
        vm.expectRevert(TrustoraFlows.Unauthorized.selector);
        flows.cancelSchedule(id);

        vm.expectEmit(true, true, false, true, address(flows));
        emit TrustoraFlows.ScheduleCancelled(id, bob);
        vm.prank(bob);
        flows.cancelSchedule(id);
        assertFalse(flows.getSchedule(id).active);

        vm.expectRevert(TrustoraFlows.InvalidStatus.selector);
        flows.executeSchedule(id);
        vm.prank(bob);
        vm.expectRevert(TrustoraFlows.InvalidStatus.selector);
        flows.cancelSchedule(id);
        assertEq(usdc.balanceOf(alice), 0);
    }

    function test_CancelSchedule_MidwayStopsFurtherPayments() public {
        uint256 id = _sched(1e6, 1 days, 5);
        flows.executeSchedule(id);
        vm.prank(bob);
        flows.cancelSchedule(id);
        vm.warp(T0 + 10 days);
        vm.expectRevert(TrustoraFlows.InvalidStatus.selector);
        flows.executeSchedule(id);
        TrustoraFlows.Schedule memory s = flows.getSchedule(id);
        assertEq(s.executed, 1);
        assertEq(s.remaining, 4);
        assertEq(usdc.balanceOf(alice), 1e6);
    }

    function test_Schedule_NotFound() public {
        vm.expectRevert(TrustoraFlows.NotFound.selector);
        flows.getSchedule(0);
        vm.expectRevert(TrustoraFlows.NotFound.selector);
        flows.executeSchedule(1);
        vm.expectRevert(TrustoraFlows.NotFound.selector);
        flows.cancelSchedule(1);
    }

    function test_ScheduleIdsOf_PayerAndPayee() public {
        uint256 a = _sched(1e6, 1 days, 1);
        vm.prank(carol);
        uint256 b = flows.createSchedule(alice, 1e6, 1 days, 0, 1, "");
        vm.prank(alice);
        uint256 c = flows.createSchedule(bob, 1e6, 1 days, 0, 1, "");

        uint256[] memory aliceIds = flows.scheduleIdsOf(alice);
        assertEq(aliceIds.length, 3);
        assertEq(aliceIds[0], a);
        assertEq(aliceIds[1], b);
        assertEq(aliceIds[2], c);
        uint256[] memory bobIds = flows.scheduleIdsOf(bob);
        assertEq(bobIds.length, 2);
        assertEq(bobIds[0], a);
        assertEq(bobIds[1], c);
        assertEq(flows.scheduleIdsOf(carol).length, 1);
        assertEq(flows.scheduleIdsOf(dave).length, 0);
    }

    // --------------------------------------------------------------------- fuzz

    function testFuzz_Split_MovesExactTotal(uint256 n, uint256 seed) public {
        n = bound(n, 1, 50);
        address[] memory r = new address[](n);
        uint128[] memory v = new uint128[](n);
        uint256 total;
        for (uint256 i; i < n; ++i) {
            r[i] = address(uint160(0x2000 + i));
            v[i] = uint128(bound(uint256(keccak256(abi.encode(seed, i))), 1, 1e9));
            total += v[i];
        }
        address s = makeAddr("splitter");
        usdc.mint(s, total);
        vm.prank(s);
        usdc.approve(address(flows), total);
        vm.prank(s);
        uint256 id = flows.split(r, v, "");

        for (uint256 i; i < n; ++i) assertEq(usdc.balanceOf(r[i]), v[i]);
        assertEq(usdc.balanceOf(s), 0);
        assertEq(flows.getSplit(id).total, total);
        assertEq(flows.getSplit(id).count, n);
        _assertNoBalance();
    }

    function testFuzz_Split_OverflowReverts(uint128 a, uint128 b) public {
        a = uint128(bound(a, 1, type(uint128).max));
        b = uint128(bound(b, uint256(type(uint128).max) - a + 1, type(uint128).max));
        (address[] memory r, uint128[] memory v) = _two(alice, a, dave, b);
        vm.prank(bob);
        vm.expectRevert(TrustoraFlows.AmountOverflow.selector);
        flows.split(r, v, "");
    }

    function testFuzz_Schedule_ExecutionsMatchTimeline(
        uint128 amount,
        uint64 interval,
        uint32 maxPayments,
        uint64 firstOffset,
        uint64 elapsed
    ) public {
        amount = uint128(bound(amount, 1, 1e9));
        interval = uint64(bound(interval, 1 hours, 365 days));
        maxPayments = uint32(bound(maxPayments, 1, 30));
        firstOffset = uint64(bound(firstOffset, 0, 400 days));
        elapsed = uint64(bound(elapsed, 0, 40 * 365 days));

        vm.prank(bob);
        uint256 id = flows.createSchedule(alice, amount, interval, firstOffset == 0 ? 0 : uint64(T0 + firstOffset), maxPayments, "");
        vm.warp(T0 + elapsed);

        uint256 expected;
        if (elapsed >= firstOffset) {
            expected = (uint256(elapsed) - firstOffset) / interval + 1;
            if (expected > maxPayments) expected = maxPayments;
        }
        for (uint256 i; i < expected; ++i) {
            vm.prank(dave);
            flows.executeSchedule(id);
        }
        vm.expectRevert(expected == maxPayments ? TrustoraFlows.InvalidStatus.selector : TrustoraFlows.InvalidTime.selector);
        flows.executeSchedule(id);

        TrustoraFlows.Schedule memory s = flows.getSchedule(id);
        assertEq(s.executed, expected);
        assertEq(s.remaining, maxPayments - expected);
        assertEq(s.nextAt, T0 + firstOffset + expected * interval);
        assertEq(s.active, expected < maxPayments);
        assertEq(usdc.balanceOf(alice), expected * amount);
        assertEq(usdc.balanceOf(bob), FUND - expected * amount);
        _assertNoBalance();
    }
}

/// @dev Drives random sequences of flows between three funded actors.
contract FlowsHandler is Test {
    TrustoraFlows public flows;
    MockUSDC public usdc;
    address[3] public actors;

    constructor(TrustoraFlows f, MockUSDC t, address[3] memory a) {
        flows = f;
        usdc = t;
        actors = a;
    }

    function payInvoice(uint256 iSeed, uint256 pSeed, uint128 amt) external {
        address issuer = actors[iSeed % 3];
        address payer = actors[pSeed % 3];
        if (issuer == payer) return;
        amt = uint128(bound(amt, 1, 1e6));
        vm.prank(issuer);
        uint256 id = flows.createInvoice(address(0), amt, 0, "");
        vm.prank(payer);
        flows.payInvoice(id);
    }

    function split(uint256 seed, uint256 n, uint128 amt) external {
        n = bound(n, 1, 6);
        amt = uint128(bound(amt, 1, 1e5));
        address sender = actors[seed % 3];
        address[] memory r = new address[](n);
        uint128[] memory v = new uint128[](n);
        for (uint256 i; i < n; ++i) {
            r[i] = actors[(seed + 1 + (i % 2)) % 3];
            v[i] = amt;
        }
        vm.prank(sender);
        flows.split(r, v, "");
    }

    function schedule(uint256 seed, uint256 count, uint256 dt) external {
        count = bound(count, 1, 5);
        dt = bound(dt, 0, 10 days);
        address payer = actors[seed % 3];
        address payee = actors[(seed + 1) % 3];
        vm.prank(payer);
        uint256 id = flows.createSchedule(payee, 1000, 1 hours, 0, uint32(count), "");
        skip(dt);
        for (uint256 i; i < count; ++i) {
            if (block.timestamp < flows.getSchedule(id).nextAt) break;
            flows.executeSchedule(id);
        }
    }
}

contract TrustoraFlowsInvariantTest is Test {
    TrustoraFlows internal flows;
    MockUSDC internal usdc;
    FlowsHandler internal handler;
    address[3] internal actors;
    uint256 internal constant SEED_BAL = 1_000_000_000e6;

    function setUp() public {
        vm.warp(1_700_000_000);
        usdc = new MockUSDC();
        flows = new TrustoraFlows(address(usdc));
        actors = [makeAddr("a0"), makeAddr("a1"), makeAddr("a2")];
        for (uint256 i; i < 3; ++i) {
            usdc.mint(actors[i], SEED_BAL);
            vm.prank(actors[i]);
            usdc.approve(address(flows), type(uint256).max);
        }
        handler = new FlowsHandler(flows, usdc, actors);
        targetContract(address(handler));
    }

    /// The contract never holds USDC.
    function invariant_FlowsHoldsNoUSDC() public view {
        assertEq(usdc.balanceOf(address(flows)), 0);
    }

    /// Payments only move funds between actors: their total is conserved.
    function invariant_ActorFundsConserved() public view {
        uint256 sum;
        for (uint256 i; i < 3; ++i) sum += usdc.balanceOf(actors[i]);
        assertEq(sum, usdc.totalSupply());
    }
}
