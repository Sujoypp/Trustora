// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {TrustoraEscrow} from "../TrustoraEscrow.sol";

// ───────────────────────────── Mock tokens (6 decimals) ─────────────────────────────

interface IMockToken {
    function mint(address to, uint256 amount) external;
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/// @dev Normal, well-behaved ERC-20.
contract MockERC20 {
    string public name = "Mock USDC";
    string public symbol = "mUSDC";
    uint8 public constant decimals = 6;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 a) public virtual {
        balanceOf[to] += a;
        totalSupply += a;
    }

    function approve(address s, uint256 a) public virtual returns (bool) {
        allowance[msg.sender][s] = a;
        return true;
    }

    function transfer(address to, uint256 a) public virtual returns (bool) {
        _move(msg.sender, to, a);
        return true;
    }

    function transferFrom(address f, address t, uint256 a) public virtual returns (bool) {
        _spend(f, a);
        _move(f, t, a);
        return true;
    }

    function _spend(address f, uint256 a) internal {
        uint256 al = allowance[f][msg.sender];
        if (al != type(uint256).max) {
            require(al >= a, "allowance");
            allowance[f][msg.sender] = al - a;
        }
    }

    function _move(address f, address t, uint256 a) internal virtual {
        require(balanceOf[f] >= a, "balance");
        balanceOf[f] -= a;
        balanceOf[t] += a;
    }
}

/// @dev USDT-style token: transfer/transferFrom return no data at all.
contract NoReturnERC20 {
    uint8 public constant decimals = 6;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 a) external {
        balanceOf[to] += a;
    }

    function approve(address s, uint256 a) external returns (bool) {
        allowance[msg.sender][s] = a;
        return true;
    }

    function transfer(address to, uint256 a) external {
        _move(msg.sender, to, a);
    }

    function transferFrom(address f, address t, uint256 a) external {
        uint256 al = allowance[f][msg.sender];
        if (al != type(uint256).max) {
            require(al >= a, "allowance");
            allowance[f][msg.sender] = al - a;
        }
        _move(f, t, a);
    }

    function _move(address f, address t, uint256 a) internal {
        require(balanceOf[f] >= a, "balance");
        balanceOf[f] -= a;
        balanceOf[t] += a;
    }
}

/// @dev Returns `false` (moving nothing) from transferFrom and/or transfer when the flags are set.
contract FalseERC20 is MockERC20 {
    bool public falseFrom;
    bool public falseTo;

    function setFalse(bool from_, bool to_) external {
        falseFrom = from_;
        falseTo = to_;
    }

    function transfer(address to, uint256 a) public override returns (bool) {
        if (falseTo) return false;
        return super.transfer(to, a);
    }

    function transferFrom(address f, address t, uint256 a) public override returns (bool) {
        if (falseFrom) return false;
        return super.transferFrom(f, t, a);
    }
}

/// @dev Reverts on any transfer to a blocked address, or on every transfer when paused.
contract BlockableERC20 is MockERC20 {
    mapping(address => bool) public blocked;
    bool public paused;

    function setBlocked(address who, bool b) external {
        blocked[who] = b;
    }

    function setPaused(bool p) external {
        paused = p;
    }

    function _move(address f, address t, uint256 a) internal override {
        require(!paused, "paused");
        require(!blocked[t], "blocked");
        super._move(f, t, a);
    }
}

/// @dev Burns 1% on transferFrom, so the receiver gets less than the requested amount.
contract FeeERC20 is MockERC20 {
    function transferFrom(address f, address t, uint256 a) public override returns (bool) {
        _spend(f, a);
        require(balanceOf[f] >= a, "balance");
        uint256 fee = a / 100;
        balanceOf[f] -= a;
        balanceOf[t] += a - fee;
        totalSupply -= fee;
        return true;
    }
}

/// @dev Malicious token: re-enters `target` with `payload` during transfer / transferFrom.
contract ReentrantERC20 is MockERC20 {
    mapping(address => bool) public blocked;
    address public target;
    bytes public payload;
    bool public armed;
    bool public onFrom;
    bool private inHook;
    uint256 public hookCalls;
    bool public lastOk;
    bytes public lastRet;

    function setBlocked(address who, bool b) external {
        blocked[who] = b;
    }

    function arm(address t, bytes calldata p, bool onTransferFrom) external {
        target = t;
        payload = p;
        armed = true;
        onFrom = onTransferFrom;
    }

    function disarm() external {
        armed = false;
    }

    function _hook() internal {
        if (!armed || inHook) return;
        inHook = true;
        (bool ok, bytes memory ret) = target.call(payload);
        lastOk = ok;
        lastRet = ret;
        hookCalls++;
        inHook = false;
    }

    function transfer(address to, uint256 a) public override returns (bool) {
        require(!blocked[to], "blocked");
        if (!onFrom) _hook();
        return super.transfer(to, a);
    }

    function transferFrom(address f, address t, uint256 a) public override returns (bool) {
        if (onFrom) _hook();
        return super.transferFrom(f, t, a);
    }
}

// ───────────────────────────── Shared base ─────────────────────────────

abstract contract TrustoraEscrowBase is Test {
    TrustoraEscrow internal escrow;
    IMockToken internal token;
    BlockableERC20 internal bt;

    address internal payer = makeAddr("payer");
    address internal payee = makeAddr("payee");
    address internal arbiter = makeAddr("arbiter");
    address internal stranger = makeAddr("stranger");

    uint256 internal constant T0 = 1_700_000_000;
    uint256 internal constant PAYER_FUNDS = 1_000_000e6;

    function setUp() public virtual {
        vm.warp(T0);
        bt = new BlockableERC20();
        _useToken(address(bt));
    }

    /// @dev Deploys a fresh escrow on `t`, funds + approves the payer.
    function _useToken(address t) internal {
        token = IMockToken(t);
        escrow = new TrustoraEscrow(t);
        token.mint(payer, PAYER_FUNDS);
        vm.prank(payer);
        token.approve(address(escrow), type(uint256).max);
    }

    function _arr1(uint128 a) internal pure returns (uint128[] memory r) {
        r = new uint128[](1);
        r[0] = a;
    }

    function _due1(uint64 d) internal pure returns (uint64[] memory r) {
        r = new uint64[](1);
        r[0] = d;
    }

    function _createAs(address arb, uint128[] memory amts, uint64[] memory dues, uint64 acceptBy, uint64 auto_)
        internal
        returns (uint256 id)
    {
        vm.prank(payer);
        id = escrow.create(payee, arb, amts, dues, acceptBy, auto_, "terms");
    }

    /// @dev One accepted milestone, with arbiter, no due date, no auto-release.
    function _one(uint128 amount) internal returns (uint256) {
        return _createAs(arbiter, _arr1(amount), _due1(0), 0, 0);
    }

    function _oneNoArb(uint128 amount) internal returns (uint256) {
        return _createAs(address(0), _arr1(amount), _due1(0), 0, 0);
    }

    function _oneAuto(uint128 amount, uint64 auto_) internal returns (uint256) {
        return _createAs(arbiter, _arr1(amount), _due1(0), 0, auto_);
    }

    function _two(uint128 a, uint128 b) internal returns (uint256) {
        uint128[] memory amts = new uint128[](2);
        amts[0] = a;
        amts[1] = b;
        uint64[] memory dues = new uint64[](2);
        return _createAs(arbiter, amts, dues, 0, 0);
    }

    function _ms(uint256 id, uint256 i) internal view returns (TrustoraEscrow.Milestone memory) {
        return escrow.getMilestones(id)[i];
    }

    function _st(uint256 id, uint256 i) internal view returns (TrustoraEscrow.State) {
        return escrow.getMilestones(id)[i].state;
    }

    /// @dev Reads the private pendingPayouts mapping (slot 6) — test-only accounting helper.
    function _pending(uint256 id, uint256 index) internal view returns (uint128 payeeAmt, uint128 payerAmt) {
        bytes32 outer = keccak256(abi.encode(id, uint256(6)));
        bytes32 slot = keccak256(abi.encode(index, outer));
        uint256 v = uint256(vm.load(address(escrow), slot));
        return (uint128(v), uint128(v >> 128));
    }

    function _deliver(uint256 id, uint256 i) internal {
        vm.prank(payee);
        escrow.markDelivered(id, i);
    }

    function _dispute(uint256 id, uint256 i) internal {
        vm.prank(payer);
        escrow.dispute(id, i);
    }

    function _bal(address a) internal view returns (uint256) {
        return token.balanceOf(a);
    }
}

// ───────────────────────────── Deployment + create() ─────────────────────────────

contract TrustoraEscrowTest is TrustoraEscrowBase {
    function _expectCreateRevert(
        bytes4 sel,
        address p,
        address arb,
        uint128[] memory amts,
        uint64[] memory dues,
        uint64 acceptBy,
        uint64 auto_,
        string memory terms
    ) internal {
        vm.prank(payer);
        vm.expectRevert(sel);
        escrow.create(p, arb, amts, dues, acceptBy, auto_, terms);
    }

    // ---- constructor ----

    function test_Constructor_StoresUsdcAndDefaults() public view {
        assertEq(escrow.usdc(), address(bt));
        assertEq(escrow.nextId(), 1);
        assertEq(escrow.MAX_MILESTONES(), 20);
        assertEq(escrow.MAX_TERMS_BYTES(), 1000);
        assertEq(escrow.MIN_AUTO_RELEASE(), 1 hours);
        assertEq(escrow.MAX_AUTO_RELEASE(), 365 days);
        assertEq(escrow.DISPUTE_TIMEOUT(), 30 days);
        assertEq(escrow.RECOVERY_DELAY(), 180 days);
    }

    function test_Constructor_RevertsOnZeroToken() public {
        vm.expectRevert(TrustoraEscrow.ZeroAddress.selector);
        new TrustoraEscrow(address(0));
    }

    // ---- create happy path ----

    function test_Create_HappyPath_StoresAgreementAndPullsExactFunds() public {
        uint128[] memory amts = new uint128[](3);
        amts[0] = 100e6;
        amts[1] = 250e6;
        amts[2] = 1;
        uint64[] memory dues = new uint64[](3);
        dues[0] = uint64(T0 + 1 days);
        dues[2] = uint64(T0 + 2 days);
        uint256 total = 350e6 + 1;

        vm.prank(payer);
        uint256 id = escrow.create(payee, arbiter, amts, dues, uint64(T0 + 3 days), 2 days, "hello");

        assertEq(id, 1);
        assertEq(escrow.nextId(), 2);
        assertEq(_bal(address(escrow)), total);
        assertEq(_bal(payer), PAYER_FUNDS - total);

        TrustoraEscrow.Agreement memory a = escrow.getAgreement(id);
        assertEq(a.payer, payer);
        assertEq(a.payee, payee);
        assertEq(a.arbiter, arbiter);
        assertFalse(a.accepted);
        assertFalse(a.cancelled);
        assertEq(a.createdAt, T0);
        assertEq(a.createdBlock, block.number);
        assertEq(a.acceptBy, T0 + 3 days);
        assertEq(a.autoReleaseAfter, 2 days);
        assertEq(a.milestoneCount, 3);
        assertEq(a.total, total);
        assertEq(a.termsHash, keccak256("hello"));

        TrustoraEscrow.Milestone[] memory ms = escrow.getMilestones(id);
        assertEq(ms.length, 3);
        for (uint256 i; i < 3; ++i) {
            assertEq(ms[i].amount, amts[i]);
            assertEq(ms[i].dueAt, dues[i]);
            assertEq(ms[i].deliveredAt, 0);
            assertEq(ms[i].stateAt, 0);
            assertTrue(ms[i].state == TrustoraEscrow.State.Funded);
        }
        assertEq(escrow.idsOf(payer).length, 1);
        assertEq(escrow.idsOf(payee).length, 1);
        assertEq(escrow.idsOf(payee)[0], 1);
        assertEq(escrow.idsOf(stranger).length, 0);
    }

    function test_Create_EmitsAgreementCreated() public {
        vm.expectEmit(true, true, true, true, address(escrow));
        emit TrustoraEscrow.AgreementCreated(1, payer, payee, arbiter, 5e6, 1, keccak256("my terms"), "my terms");
        vm.prank(payer);
        escrow.create(payee, arbiter, _arr1(5e6), _due1(0), 0, 0, "my terms");
    }

    function test_Create_ZeroAcceptByStartsAccepted() public {
        uint256 id = _one(1e6);
        assertTrue(escrow.getAgreement(id).accepted);
    }

    function test_Create_NoArbiterAllowed() public {
        uint256 id = _oneNoArb(1e6);
        assertEq(escrow.getAgreement(id).arbiter, address(0));
    }

    function test_Create_ExactApprovalFullyConsumed() public {
        address p2 = makeAddr("p2");
        token.mint(p2, 10e6);
        vm.prank(p2);
        token.approve(address(escrow), 7e6);
        vm.prank(p2);
        escrow.create(payee, address(0), _arr1(7e6), _due1(0), 0, 0, "");
        assertEq(MockERC20(address(token)).allowance(p2, address(escrow)), 0);
        assertEq(_bal(p2), 3e6);
        assertEq(_bal(address(escrow)), 7e6);
    }

    function test_Create_TwentyMilestonesAllowed() public {
        uint128[] memory amts = new uint128[](20);
        uint64[] memory dues = new uint64[](20);
        for (uint256 i; i < 20; ++i) amts[i] = uint128(i + 1);
        uint256 id = _createAs(arbiter, amts, dues, 0, 0);
        assertEq(escrow.getMilestones(id).length, 20);
        assertEq(escrow.getAgreement(id).total, 210);
    }

    // ---- create validation ----

    function test_Create_RevertsZeroPayee() public {
        _expectCreateRevert(TrustoraEscrow.InvalidPayee.selector, address(0), arbiter, _arr1(1), _due1(0), 0, 0, "");
    }

    function test_Create_RevertsSelfPayee() public {
        _expectCreateRevert(TrustoraEscrow.InvalidPayee.selector, payer, arbiter, _arr1(1), _due1(0), 0, 0, "");
    }

    function test_Create_RevertsPayeeIsContract() public {
        _expectCreateRevert(
            TrustoraEscrow.InvalidPayee.selector, address(escrow), arbiter, _arr1(1), _due1(0), 0, 0, ""
        );
    }

    function test_Create_RevertsArbiterIsPayer() public {
        _expectCreateRevert(TrustoraEscrow.InvalidArbiter.selector, payee, payer, _arr1(1), _due1(0), 0, 0, "");
    }

    function test_Create_RevertsArbiterIsPayee() public {
        _expectCreateRevert(TrustoraEscrow.InvalidArbiter.selector, payee, payee, _arr1(1), _due1(0), 0, 0, "");
    }

    function test_Create_RevertsArbiterIsContract() public {
        _expectCreateRevert(
            TrustoraEscrow.InvalidArbiter.selector, payee, address(escrow), _arr1(1), _due1(0), 0, 0, ""
        );
    }

    function test_Create_RevertsEmptyMilestones() public {
        _expectCreateRevert(
            TrustoraEscrow.InvalidMilestones.selector, payee, arbiter, new uint128[](0), new uint64[](0), 0, 0, ""
        );
    }

    function test_Create_Reverts21Milestones() public {
        _expectCreateRevert(
            TrustoraEscrow.InvalidMilestones.selector, payee, arbiter, new uint128[](21), new uint64[](21), 0, 0, ""
        );
    }

    function test_Create_RevertsLengthMismatch() public {
        _expectCreateRevert(
            TrustoraEscrow.InvalidMilestones.selector, payee, arbiter, new uint128[](2), new uint64[](1), 0, 0, ""
        );
    }

    function test_Create_RevertsZeroAmount() public {
        uint128[] memory amts = new uint128[](2);
        amts[0] = 5;
        uint64[] memory dues = new uint64[](2);
        _expectCreateRevert(TrustoraEscrow.ZeroAmount.selector, payee, arbiter, amts, dues, 0, 0, "");
    }

    function test_Create_RevertsPastOrCurrentDueAt() public {
        _expectCreateRevert(
            TrustoraEscrow.InvalidDeadline.selector, payee, arbiter, _arr1(1), _due1(uint64(T0 - 1)), 0, 0, ""
        );
        _expectCreateRevert(
            TrustoraEscrow.InvalidDeadline.selector, payee, arbiter, _arr1(1), _due1(uint64(T0)), 0, 0, ""
        );
        // T0 + 1 is the earliest valid dueAt
        _createAs(arbiter, _arr1(1), _due1(uint64(T0 + 1)), 0, 0);
    }

    function test_Create_RevertsPastOrCurrentAcceptBy() public {
        _expectCreateRevert(
            TrustoraEscrow.InvalidDeadline.selector, payee, arbiter, _arr1(1), _due1(0), uint64(T0 - 1), 0, ""
        );
        _expectCreateRevert(
            TrustoraEscrow.InvalidDeadline.selector, payee, arbiter, _arr1(1), _due1(0), uint64(T0), 0, ""
        );
        uint256 id = _createAs(arbiter, _arr1(1), _due1(0), uint64(T0 + 1), 0);
        assertFalse(escrow.getAgreement(id).accepted);
    }

    function test_Create_AutoReleaseBounds() public {
        _expectCreateRevert(
            TrustoraEscrow.InvalidAutoRelease.selector, payee, arbiter, _arr1(1), _due1(0), 0, 1 hours - 1, ""
        );
        _expectCreateRevert(
            TrustoraEscrow.InvalidAutoRelease.selector, payee, arbiter, _arr1(1), _due1(0), 0, 365 days + 1, ""
        );
        _createAs(arbiter, _arr1(1), _due1(0), 0, 1 hours);
        _createAs(arbiter, _arr1(1), _due1(0), 0, 365 days);
        _createAs(arbiter, _arr1(1), _due1(0), 0, 0);
    }

    function test_Create_TermsLimit() public {
        bytes memory ok = new bytes(1000);
        bytes memory tooLong = new bytes(1001);
        vm.prank(payer);
        escrow.create(payee, arbiter, _arr1(1), _due1(0), 0, 0, string(ok));
        _expectCreateRevert(
            TrustoraEscrow.TermsTooLong.selector, payee, arbiter, _arr1(1), _due1(0), 0, 0, string(tooLong)
        );
    }

    function test_Create_RevertsWithoutAllowanceOrBalance() public {
        vm.prank(payer);
        token.approve(address(escrow), 0);
        _expectCreateRevert(TrustoraEscrow.TokenTransferFailed.selector, payee, arbiter, _arr1(1), _due1(0), 0, 0, "");
        vm.prank(payer);
        token.approve(address(escrow), type(uint256).max);
        _expectCreateRevert(
            TrustoraEscrow.TokenTransferFailed.selector,
            payee,
            arbiter,
            _arr1(uint128(PAYER_FUNDS + 1)),
            _due1(0),
            0,
            0,
            ""
        );
    }

    function test_Create_RevertsAndLeavesNoStateOnFailure() public {
        vm.prank(payer);
        token.approve(address(escrow), 0);
        _expectCreateRevert(TrustoraEscrow.TokenTransferFailed.selector, payee, arbiter, _arr1(1), _due1(0), 0, 0, "");
        assertEq(escrow.nextId(), 1);
        assertEq(escrow.idsOf(payer).length, 0);
        assertEq(escrow.getAgreement(1).payer, address(0));
    }

    function test_Create_RejectsFeeOnTransferToken() public {
        _useToken(address(new FeeERC20()));
        _expectCreateRevert(TrustoraEscrow.IncorrectDeposit.selector, payee, arbiter, _arr1(100e6), _due1(0), 0, 0, "");
        assertEq(_bal(address(escrow)), 0);
        assertEq(escrow.nextId(), 1);
    }

    function test_Create_RevertsWhenTokenReturnsFalse() public {
        FalseERC20 ft = new FalseERC20();
        _useToken(address(ft));
        ft.setFalse(true, false);
        _expectCreateRevert(TrustoraEscrow.TokenTransferFailed.selector, payee, arbiter, _arr1(1e6), _due1(0), 0, 0, "");
    }

    function test_Create_WorksWithNoReturnDataToken() public {
        _useToken(address(new NoReturnERC20()));
        uint256 id = _one(10e6);
        assertEq(_bal(address(escrow)), 10e6);
        vm.prank(payer);
        escrow.approve(id, 0);
        assertEq(_bal(payee), 10e6);
        assertTrue(_st(id, 0) == TrustoraEscrow.State.Released);
    }

    function test_Create_RevertsIfTokenHasNoBalanceOf() public {
        escrow = new TrustoraEscrow(makeAddr("noCodeToken"));
        vm.prank(payer);
        vm.expectRevert(TrustoraEscrow.TokenBalanceFailed.selector);
        escrow.create(payee, arbiter, _arr1(1), _due1(0), 0, 0, "");
    }

    function test_Views_UnknownId() public view {
        assertEq(escrow.getAgreement(99).payer, address(0));
        assertEq(escrow.getMilestones(99).length, 0);
        assertEq(escrow.owedTo(99, 0), address(0));
    }
}
