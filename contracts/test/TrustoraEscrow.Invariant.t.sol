// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {TrustoraEscrow} from "../TrustoraEscrow.sol";
import {TrustoraEscrowBase, BlockableERC20} from "./TrustoraEscrow.t.sol";

/// @dev Drives random, bounded sequences of every entry point. Failed calls are swallowed.
contract EscrowHandler is Test {
    TrustoraEscrow public escrow;
    BlockableERC20 public token;
    address public payer;
    address public payee;
    address public arbiter;
    address public stranger;

    uint256 public ghostFunded;
    uint256 public ghostPaidOut;

    constructor(TrustoraEscrow e, BlockableERC20 t, address _payer, address _payee, address _arbiter, address _stranger) {
        escrow = e;
        token = t;
        payer = _payer;
        payee = _payee;
        arbiter = _arbiter;
        stranger = _stranger;
    }

    /// @dev Any decrease of the escrow's token balance is a payout.
    modifier track() {
        uint256 b0 = token.balanceOf(address(escrow));
        _;
        uint256 b1 = token.balanceOf(address(escrow));
        if (b1 < b0) ghostPaidOut += b0 - b1;
    }

    function _ref(uint256 a, uint256 b) internal view returns (uint256 id, uint256 idx, bool ok) {
        uint256 n = escrow.nextId();
        if (n == 1) return (0, 0, false);
        id = 1 + a % (n - 1);
        idx = b % escrow.getAgreement(id).milestoneCount;
        ok = true;
    }

    function _party(uint256 s) internal view returns (address) {
        return s % 2 == 0 ? payer : payee;
    }

    function create(uint256 seed) external track {
        uint256 n = 1 + seed % 4;
        uint128[] memory amts = new uint128[](n);
        uint64[] memory dues = new uint64[](n);
        uint256 total;
        for (uint256 i; i < n; ++i) {
            amts[i] = uint128(1 + uint256(keccak256(abi.encode(seed, i))) % 1e8);
            total += amts[i];
            if ((seed >> (8 + i)) & 1 == 1) dues[i] = uint64(block.timestamp + 1 days * (1 + (seed >> 16) % 20));
        }
        uint64 acceptBy = seed % 3 == 0 ? uint64(block.timestamp + 3 days) : 0;
        uint64 auto_ = seed % 2 == 0 ? uint64(1 hours + (seed >> 24) % 10 days) : 0;
        address arb = seed % 4 == 0 ? address(0) : arbiter;
        vm.prank(payer);
        try escrow.create(payee, arb, amts, dues, acceptBy, auto_, "") returns (uint256) {
            ghostFunded += total;
        } catch {}
    }

    function accept(uint256 a) external track {
        (uint256 id,, bool ok) = _ref(a, 0);
        if (!ok) return;
        vm.prank(payee);
        try escrow.accept(id) {} catch {}
    }

    function decline(uint256 a, uint256 who) external track {
        (uint256 id,, bool ok) = _ref(a, 0);
        if (!ok) return;
        vm.prank(_party(who));
        try escrow.decline(id) {} catch {}
    }

    function deliver(uint256 a, uint256 b) external track {
        (uint256 id, uint256 i, bool ok) = _ref(a, b);
        if (!ok) return;
        vm.prank(payee);
        try escrow.markDelivered(id, i) {} catch {}
    }

    function approve(uint256 a, uint256 b) external track {
        (uint256 id, uint256 i, bool ok) = _ref(a, b);
        if (!ok) return;
        vm.prank(payer);
        try escrow.approve(id, i) {} catch {}
    }

    function autoRelease(uint256 a, uint256 b) external track {
        (uint256 id, uint256 i, bool ok) = _ref(a, b);
        if (!ok) return;
        vm.prank(stranger);
        try escrow.autoRelease(id, i) {} catch {}
    }

    function dispute(uint256 a, uint256 b, uint256 who) external track {
        (uint256 id, uint256 i, bool ok) = _ref(a, b);
        if (!ok) return;
        vm.prank(_party(who));
        try escrow.dispute(id, i) {} catch {}
    }

    function resolve(uint256 a, uint256 b, bool toPayee) external track {
        (uint256 id, uint256 i, bool ok) = _ref(a, b);
        if (!ok) return;
        vm.prank(arbiter);
        try escrow.resolve(id, i, toPayee) {} catch {}
    }

    function settle(uint256 a, uint256 b, uint256 who) external track {
        (uint256 id, uint256 i, bool ok) = _ref(a, b);
        if (!ok) return;
        vm.prank(_party(who));
        try escrow.settleExpiredDispute(id, i) {} catch {}
    }

    function refund(uint256 a, uint256 b, uint256 who) external track {
        (uint256 id, uint256 i, bool ok) = _ref(a, b);
        if (!ok) return;
        vm.prank(_party(who));
        try escrow.refund(id, i) {} catch {}
    }

    function claim(uint256 a, uint256 b, uint256 who) external track {
        (uint256 id, uint256 i, bool ok) = _ref(a, b);
        if (!ok) return;
        vm.prank(_party(who));
        try escrow.claim(id, i) {} catch {}
    }

    function recover(uint256 a, uint256 b) external track {
        (uint256 id, uint256 i, bool ok) = _ref(a, b);
        if (!ok) return;
        vm.prank(payer);
        try escrow.recoverUnclaimed(id, i) {} catch {}
    }

    function warp(uint256 secs) external {
        skip(bound(secs, 1 hours, 100 days));
    }

    function setBlocks(bool blockPayee, bool blockPayer) external {
        token.setBlocked(payee, blockPayee);
        token.setBlocked(payer, blockPayer);
    }
}

contract TrustoraEscrowInvariantTest is TrustoraEscrowBase {
    EscrowHandler internal handler;

    function setUp() public override {
        super.setUp();
        token.mint(payer, 1e30);
        handler = new EscrowHandler(escrow, bt, payer, payee, arbiter, stranger);
        targetContract(address(handler));
    }

    /// @notice USDC balance == Σ(Funded|Delivered|Disputed amounts) + Σ(pending shares of Unclaimed).
    function invariant_BalanceEqualsLiveMilestoneAccounting() public view {
        uint256 expected;
        uint256 n = escrow.nextId();
        for (uint256 id = 1; id < n; ++id) {
            TrustoraEscrow.Milestone[] memory ms = escrow.getMilestones(id);
            for (uint256 i; i < ms.length; ++i) {
                TrustoraEscrow.State s = ms[i].state;
                (uint128 pe, uint128 pr) = _pending(id, i);
                if (
                    s == TrustoraEscrow.State.Funded || s == TrustoraEscrow.State.Delivered
                        || s == TrustoraEscrow.State.Disputed
                ) {
                    expected += ms[i].amount;
                    assertEq(uint256(pe) + pr, 0, "pending set on live milestone");
                } else if (s == TrustoraEscrow.State.Unclaimed) {
                    assertGt(uint256(pe) + pr, 0, "Unclaimed without pending");
                    assertLe(uint256(pe) + pr, ms[i].amount, "pending exceeds amount");
                    expected += uint256(pe) + pr;
                } else {
                    assertEq(uint256(pe) + pr, 0, "pending set on settled milestone");
                }
            }
        }
        assertEq(_bal(address(escrow)), expected, "escrow balance != live accounting");
    }

    function invariant_PaidOutNeverExceedsFunded() public view {
        assertLe(handler.ghostPaidOut(), handler.ghostFunded());
    }

    function invariant_FundedMinusPaidEqualsBalance() public view {
        assertEq(handler.ghostFunded() - handler.ghostPaidOut(), _bal(address(escrow)));
    }

    function invariant_NextIdMatchesAgreements() public view {
        uint256 n = escrow.nextId();
        for (uint256 id = 1; id < n; ++id) {
            assertEq(escrow.getAgreement(id).payer, payer);
            assertGt(escrow.getAgreement(id).total, 0);
        }
    }
}
