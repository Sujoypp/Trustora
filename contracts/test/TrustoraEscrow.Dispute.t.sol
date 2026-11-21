// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {TrustoraEscrow} from "../TrustoraEscrow.sol";
import {TrustoraEscrowBase} from "./TrustoraEscrow.t.sol";

/// @dev dispute / resolve / mutual exits / settleExpiredDispute / refund
contract TrustoraEscrowDisputeTest is TrustoraEscrowBase {
    uint128 internal constant AMT = 100e6;

    function _disputed(uint128 amount) internal returns (uint256 id) {
        id = _one(amount);
        _deliver(id, 0);
        _dispute(id, 0);
    }

    // ───────── dispute ─────────

    function test_Dispute_ByPayer() public {
        uint256 id = _one(AMT);
        _deliver(id, 0);
        vm.warp(T0 + 2 days);
        vm.expectEmit(true, true, true, false, address(escrow));
        emit TrustoraEscrow.MilestoneDisputed(id, 0, payer);
        _dispute(id, 0);
        TrustoraEscrow.Milestone memory m = _ms(id, 0);
        assertTrue(m.state == TrustoraEscrow.State.Disputed);
        assertEq(m.stateAt, T0 + 2 days);
        assertEq(_bal(address(escrow)), AMT);
    }

    function test_Dispute_ByPayee() public {
        uint256 id = _one(AMT);
        _deliver(id, 0);
        vm.expectEmit(true, true, true, false, address(escrow));
        emit TrustoraEscrow.MilestoneDisputed(id, 0, payee);
        vm.prank(payee);
        escrow.dispute(id, 0);
        assertTrue(_st(id, 0) == TrustoraEscrow.State.Disputed);
    }

    function test_Dispute_RevertsWithoutArbiter() public {
        uint256 id = _oneNoArb(AMT);
        _deliver(id, 0);
        vm.prank(payer);
        vm.expectRevert(TrustoraEscrow.NoArbiter.selector);
        escrow.dispute(id, 0);
        vm.prank(payee);
        vm.expectRevert(TrustoraEscrow.NoArbiter.selector);
        escrow.dispute(id, 0);
    }

    function test_Dispute_OnlyPartiesEvenWithoutArbiter() public {
        uint256 id = _oneNoArb(AMT);
        _deliver(id, 0);
        vm.prank(stranger);
        vm.expectRevert(TrustoraEscrow.Unauthorized.selector);
        escrow.dispute(id, 0);
    }

    function test_Dispute_OnlyParties() public {
        uint256 id = _one(AMT);
        _deliver(id, 0);
        address[2] memory bad = [arbiter, stranger];
        for (uint256 i; i < 2; ++i) {
            vm.prank(bad[i]);
            vm.expectRevert(TrustoraEscrow.Unauthorized.selector);
            escrow.dispute(id, 0);
        }
    }

    function test_Dispute_RevertsIfNotDelivered() public {
        uint256 id = _one(AMT);
        vm.prank(payer);
        vm.expectRevert(TrustoraEscrow.InvalidState.selector);
        escrow.dispute(id, 0);
    }

    function test_Dispute_RevertsTwiceAndAfterRelease() public {
        uint256 id = _disputed(AMT);
        vm.prank(payee);
        vm.expectRevert(TrustoraEscrow.InvalidState.selector);
        escrow.dispute(id, 0);
        vm.prank(payer);
        escrow.approve(id, 0);
        vm.prank(payer);
        vm.expectRevert(TrustoraEscrow.InvalidState.selector);
        escrow.dispute(id, 0);
    }

    function test_Dispute_BadIndexAndUnknown() public {
        uint256 id = _one(AMT);
        vm.prank(payer);
        vm.expectRevert(TrustoraEscrow.InvalidIndex.selector);
        escrow.dispute(id, 3);
        vm.prank(payer);
        vm.expectRevert(TrustoraEscrow.NotFound.selector);
        escrow.dispute(id + 5, 0);
    }

    // ───────── resolve ─────────

    function test_Resolve_ToPayee() public {
        uint256 id = _disputed(AMT);
        vm.expectEmit(true, true, true, true, address(escrow));
        emit TrustoraEscrow.MilestoneReleased(id, 0, payee, AMT, 2);
        vm.prank(arbiter);
        escrow.resolve(id, 0, true);
        assertEq(_bal(payee), AMT);
        assertEq(_bal(address(escrow)), 0);
        assertTrue(_st(id, 0) == TrustoraEscrow.State.Released);
    }

    function test_Resolve_ToPayer() public {
        uint256 id = _disputed(AMT);
        vm.expectEmit(true, true, true, true, address(escrow));
        emit TrustoraEscrow.MilestoneRefunded(id, 0, payer, AMT, 2);
        vm.prank(arbiter);
        escrow.resolve(id, 0, false);
        assertEq(_bal(payer), PAYER_FUNDS);
        assertEq(_bal(payee), 0);
        assertTrue(_st(id, 0) == TrustoraEscrow.State.Refunded);
    }

    function test_Resolve_OnlyArbiter() public {
        uint256 id = _disputed(AMT);
        address[3] memory bad = [payer, payee, stranger];
        for (uint256 i; i < 3; ++i) {
            vm.prank(bad[i]);
            vm.expectRevert(TrustoraEscrow.Unauthorized.selector);
            escrow.resolve(id, 0, true);
        }
    }

    function test_Resolve_NoArbiterAgreementCannotBeResolvedByAnyone() public {
        uint256 id = _oneNoArb(AMT);
        _deliver(id, 0);
        address[3] memory who = [payer, payee, stranger];
        for (uint256 i; i < 3; ++i) {
            vm.prank(who[i]);
            vm.expectRevert(TrustoraEscrow.Unauthorized.selector);
            escrow.resolve(id, 0, true);
        }
    }

    /// @dev address(0) == a.arbiter on no-arbiter agreements passes the auth check, but no such
    /// agreement can ever be Disputed (dispute requires an arbiter), so no funds can move.
    function test_Resolve_ZeroAddressOnNoArbiterAgreementStillCannotMoveFunds() public {
        uint256 id = _oneNoArb(AMT);
        _deliver(id, 0);
        vm.prank(address(0));
        vm.expectRevert(TrustoraEscrow.InvalidState.selector);
        escrow.resolve(id, 0, true);
        assertEq(_bal(address(escrow)), AMT);
    }

    function test_Resolve_RevertsUnlessDisputed() public {
        uint256 id = _one(AMT);
        vm.prank(arbiter);
        vm.expectRevert(TrustoraEscrow.InvalidState.selector);
        escrow.resolve(id, 0, true);
        _deliver(id, 0);
        vm.prank(arbiter);
        vm.expectRevert(TrustoraEscrow.InvalidState.selector);
        escrow.resolve(id, 0, false);
    }

    function test_Resolve_CannotRepeat() public {
        uint256 id = _disputed(AMT);
        vm.prank(arbiter);
        escrow.resolve(id, 0, true);
        vm.prank(arbiter);
        vm.expectRevert(TrustoraEscrow.InvalidState.selector);
        escrow.resolve(id, 0, false);
        assertEq(_bal(payee), AMT);
    }

    function test_Resolve_BadIndexAndUnknown() public {
        uint256 id = _disputed(AMT);
        vm.prank(arbiter);
        vm.expectRevert(TrustoraEscrow.InvalidIndex.selector);
        escrow.resolve(id, 1, true);
        vm.prank(arbiter);
        vm.expectRevert(TrustoraEscrow.NotFound.selector);
        escrow.resolve(id + 1, 0, true);
    }

    // ───────── mutual exits while Disputed ─────────

    function test_Disputed_PayeeWaivesViaRefund() public {
        uint256 id = _disputed(AMT);
        vm.expectEmit(true, true, true, true, address(escrow));
        emit TrustoraEscrow.MilestoneRefunded(id, 0, payer, AMT, 0);
        vm.prank(payee);
        escrow.refund(id, 0);
        assertEq(_bal(payer), PAYER_FUNDS);
        assertTrue(_st(id, 0) == TrustoraEscrow.State.Refunded);
    }

    function test_Disputed_PayerCannotUnilaterallyRefund() public {
        uint256 id = _createAs(arbiter, _arr1(AMT), _due1(uint64(T0 + 1 days)), 0, 0);
        _deliver(id, 0);
        _dispute(id, 0);
        vm.warp(T0 + 100 days);
        vm.prank(payer);
        vm.expectRevert(TrustoraEscrow.InvalidState.selector);
        escrow.refund(id, 0);
    }

    // ───────── settleExpiredDispute ─────────

    function test_Settle_TimingMeasuredFromDispute() public {
        uint256 id = _one(AMT);
        _deliver(id, 0);
        vm.warp(T0 + 10 days);
        _dispute(id, 0);
        vm.warp(T0 + 10 days + 30 days - 1);
        vm.prank(payer);
        vm.expectRevert(TrustoraEscrow.TooEarly.selector);
        escrow.settleExpiredDispute(id, 0);
        vm.warp(T0 + 10 days + 30 days);
        vm.prank(payer);
        escrow.settleExpiredDispute(id, 0);
        assertTrue(_st(id, 0) == TrustoraEscrow.State.Released);
    }

    function test_Settle_EvenSplitByPayer() public {
        uint256 id = _disputed(AMT);
        skip(30 days);
        vm.expectEmit(true, true, false, true, address(escrow));
        emit TrustoraEscrow.MilestoneSettled(id, 0, 50e6, 50e6);
        vm.prank(payer);
        escrow.settleExpiredDispute(id, 0);
        assertEq(_bal(payee), 50e6);
        assertEq(_bal(payer), PAYER_FUNDS - AMT + 50e6);
        assertEq(_bal(address(escrow)), 0);
    }

    function test_Settle_ByPayee() public {
        uint256 id = _disputed(AMT);
        skip(31 days);
        vm.prank(payee);
        escrow.settleExpiredDispute(id, 0);
        assertEq(_bal(payee), 50e6);
    }

    function test_Settle_OddAmountExtraUnitToPayee() public {
        uint256 id = _disputed(101);
        skip(30 days);
        vm.expectEmit(true, true, false, true, address(escrow));
        emit TrustoraEscrow.MilestoneSettled(id, 0, 51, 50);
        vm.prank(payer);
        escrow.settleExpiredDispute(id, 0);
        assertEq(_bal(payee), 51);
        assertEq(_bal(payer), PAYER_FUNDS - 101 + 50);
        assertEq(_bal(address(escrow)), 0);
    }

    function test_Settle_OneUnitGoesEntirelyToPayee() public {
        uint256 id = _disputed(1);
        skip(30 days);
        vm.prank(payer);
        escrow.settleExpiredDispute(id, 0);
        assertEq(_bal(payee), 1);
        assertEq(_bal(address(escrow)), 0);
        assertTrue(_st(id, 0) == TrustoraEscrow.State.Released);
    }

    function test_Settle_OnlyParties() public {
        uint256 id = _disputed(AMT);
        skip(31 days);
        address[2] memory bad = [arbiter, stranger];
        for (uint256 i; i < 2; ++i) {
            vm.prank(bad[i]);
            vm.expectRevert(TrustoraEscrow.Unauthorized.selector);
            escrow.settleExpiredDispute(id, 0);
        }
    }

    function test_Settle_RevertsUnlessDisputed() public {
        uint256 id = _one(AMT);
        skip(60 days);
        vm.prank(payer);
        vm.expectRevert(TrustoraEscrow.InvalidState.selector);
        escrow.settleExpiredDispute(id, 0);
        _deliver(id, 0);
        vm.prank(payee);
        vm.expectRevert(TrustoraEscrow.InvalidState.selector);
        escrow.settleExpiredDispute(id, 0);
    }

    function test_Settle_CannotRepeatAfterSettlement() public {
        uint256 id = _disputed(AMT);
        skip(30 days);
        vm.prank(payer);
        escrow.settleExpiredDispute(id, 0);
        vm.prank(payee);
        vm.expectRevert(TrustoraEscrow.InvalidState.selector);
        escrow.settleExpiredDispute(id, 0);
        assertEq(_bal(payee), 50e6);
    }

    function test_Settle_ArbiterCannotResolveAfterSettlement() public {
        uint256 id = _disputed(AMT);
        skip(30 days);
        vm.prank(payee);
        escrow.settleExpiredDispute(id, 0);
        vm.prank(arbiter);
        vm.expectRevert(TrustoraEscrow.InvalidState.selector);
        escrow.resolve(id, 0, true);
    }

    function test_Settle_ArbiterStillCanResolveAfterTimeout() public {
        uint256 id = _disputed(AMT);
        skip(90 days);
        vm.prank(arbiter);
        escrow.resolve(id, 0, true);
        assertEq(_bal(payee), AMT);
    }

    function test_Settle_BadIndexAndUnknown() public {
        uint256 id = _disputed(AMT);
        vm.prank(payer);
        vm.expectRevert(TrustoraEscrow.InvalidIndex.selector);
        escrow.settleExpiredDispute(id, 1);
        vm.prank(payer);
        vm.expectRevert(TrustoraEscrow.NotFound.selector);
        escrow.settleExpiredDispute(id + 1, 0);
    }

    // ───────── refund (payee waiver) ─────────

    function test_Refund_PayeeFromFunded() public {
        uint256 id = _one(AMT);
        vm.expectEmit(true, true, true, true, address(escrow));
        emit TrustoraEscrow.MilestoneRefunded(id, 0, payer, AMT, 0);
        vm.prank(payee);
        escrow.refund(id, 0);
        assertEq(_bal(payer), PAYER_FUNDS);
        assertTrue(_st(id, 0) == TrustoraEscrow.State.Refunded);
    }

    function test_Refund_PayeeFromDelivered() public {
        uint256 id = _one(AMT);
        _deliver(id, 0);
        vm.prank(payee);
        escrow.refund(id, 0);
        assertEq(_bal(payer), PAYER_FUNDS);
    }

    function test_Refund_PayeeBeforeAcceptance() public {
        uint256 id = _createAs(arbiter, _arr1(AMT), _due1(0), uint64(T0 + 1 days), 0);
        vm.prank(payee);
        escrow.refund(id, 0);
        assertEq(_bal(payer), PAYER_FUNDS);
    }

    function test_Refund_PayeeCannotRepeat() public {
        uint256 id = _one(AMT);
        vm.prank(payee);
        escrow.refund(id, 0);
        vm.prank(payee);
        vm.expectRevert(TrustoraEscrow.InvalidState.selector);
        escrow.refund(id, 0);
        vm.prank(payer);
        vm.expectRevert(TrustoraEscrow.InvalidState.selector);
        escrow.refund(id, 0);
    }

    // ───────── refund (payer after deadline) ─────────

    function test_Refund_PayerAfterDeadline() public {
        uint256 id = _createAs(arbiter, _arr1(AMT), _due1(uint64(T0 + 1 days)), 0, 0);
        vm.warp(T0 + 1 days + 1);
        vm.expectEmit(true, true, true, true, address(escrow));
        emit TrustoraEscrow.MilestoneRefunded(id, 0, payer, AMT, 1);
        vm.prank(payer);
        escrow.refund(id, 0);
        assertEq(_bal(payer), PAYER_FUNDS);
        assertTrue(_st(id, 0) == TrustoraEscrow.State.Refunded);
    }

    function test_Refund_PayerTooEarlyAtDeadline() public {
        uint256 id = _createAs(arbiter, _arr1(AMT), _due1(uint64(T0 + 1 days)), 0, 0);
        vm.warp(T0 + 1 days);
        vm.prank(payer);
        vm.expectRevert(TrustoraEscrow.TooEarly.selector);
        escrow.refund(id, 0);
    }

    function test_Refund_PayerNoDueAtNeverRefundable() public {
        uint256 id = _one(AMT);
        vm.warp(T0 + 5000 days);
        vm.prank(payer);
        vm.expectRevert(TrustoraEscrow.TooEarly.selector);
        escrow.refund(id, 0);
    }

    function test_Refund_PayerNotWhenDeliveredOrDisputed() public {
        uint256 id = _createAs(arbiter, _arr1(AMT), _due1(uint64(T0 + 1 days)), 0, 0);
        _deliver(id, 0);
        vm.warp(T0 + 3 days);
        vm.prank(payer);
        vm.expectRevert(TrustoraEscrow.InvalidState.selector);
        escrow.refund(id, 0);
    }

    function test_Refund_PayerNotBeforeAcceptance() public {
        uint256 id = _createAs(arbiter, _arr1(AMT), _due1(uint64(T0 + 1 days)), uint64(T0 + 12 hours), 0);
        vm.warp(T0 + 3 days);
        vm.prank(payer);
        vm.expectRevert(TrustoraEscrow.InvalidState.selector);
        escrow.refund(id, 0);
    }

    function test_Refund_PayerCannotRepeat() public {
        uint256 id = _createAs(arbiter, _arr1(AMT), _due1(uint64(T0 + 1 days)), 0, 0);
        vm.warp(T0 + 2 days);
        vm.prank(payer);
        escrow.refund(id, 0);
        vm.prank(payer);
        vm.expectRevert(TrustoraEscrow.InvalidState.selector);
        escrow.refund(id, 0);
        assertEq(_bal(payer), PAYER_FUNDS);
    }

    function test_Refund_OnlyParties() public {
        uint256 id = _one(AMT);
        address[2] memory bad = [arbiter, stranger];
        for (uint256 i; i < 2; ++i) {
            vm.prank(bad[i]);
            vm.expectRevert(TrustoraEscrow.Unauthorized.selector);
            escrow.refund(id, 0);
        }
    }

    function test_Refund_BadIndexAndUnknown() public {
        uint256 id = _one(AMT);
        vm.prank(payee);
        vm.expectRevert(TrustoraEscrow.InvalidIndex.selector);
        escrow.refund(id, 2);
        vm.prank(payee);
        vm.expectRevert(TrustoraEscrow.NotFound.selector);
        escrow.refund(id + 1, 0);
    }
}
