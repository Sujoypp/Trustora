// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {TrustoraEscrow} from "../TrustoraEscrow.sol";
import {TrustoraEscrowBase} from "./TrustoraEscrow.t.sol";

/// @dev accept / decline / markDelivered / approve / autoRelease
contract TrustoraEscrowFlowTest is TrustoraEscrowBase {
    uint128 internal constant AMT = 100e6;

    function _pend(uint64 acceptBy) internal returns (uint256) {
        return _createAs(arbiter, _arr1(AMT), _due1(0), acceptBy, 0);
    }

    // ───────── accept ─────────

    function test_Accept_ByPayee() public {
        uint256 id = _pend(uint64(T0 + 1 days));
        vm.expectEmit(true, true, false, false, address(escrow));
        emit TrustoraEscrow.AgreementAccepted(id, payee);
        vm.prank(payee);
        escrow.accept(id);
        assertTrue(escrow.getAgreement(id).accepted);
    }

    function test_Accept_AtDeadlineInclusive() public {
        uint256 id = _pend(uint64(T0 + 1 days));
        vm.warp(T0 + 1 days);
        vm.prank(payee);
        escrow.accept(id);
        assertTrue(escrow.getAgreement(id).accepted);
    }

    function test_Accept_RevertsAfterDeadline() public {
        uint256 id = _pend(uint64(T0 + 1 days));
        vm.warp(T0 + 1 days + 1);
        vm.prank(payee);
        vm.expectRevert(TrustoraEscrow.AcceptanceExpired.selector);
        escrow.accept(id);
    }

    function test_Accept_OnlyPayee() public {
        uint256 id = _pend(uint64(T0 + 1 days));
        address[3] memory bad = [payer, arbiter, stranger];
        for (uint256 i; i < 3; ++i) {
            vm.prank(bad[i]);
            vm.expectRevert(TrustoraEscrow.Unauthorized.selector);
            escrow.accept(id);
        }
    }

    function test_Accept_RevertsIfAlreadyAccepted() public {
        uint256 id = _pend(uint64(T0 + 1 days));
        vm.prank(payee);
        escrow.accept(id);
        vm.prank(payee);
        vm.expectRevert(TrustoraEscrow.InvalidState.selector);
        escrow.accept(id);
    }

    function test_Accept_RevertsIfCreatedAccepted() public {
        uint256 id = _one(AMT);
        vm.prank(payee);
        vm.expectRevert(TrustoraEscrow.InvalidState.selector);
        escrow.accept(id);
    }

    function test_Accept_RevertsIfCancelled() public {
        uint256 id = _pend(uint64(T0 + 1 days));
        vm.prank(payer);
        escrow.decline(id);
        vm.prank(payee);
        vm.expectRevert(TrustoraEscrow.InvalidState.selector);
        escrow.accept(id);
    }

    function test_Accept_RevertsUnknownId() public {
        vm.prank(payee);
        vm.expectRevert(TrustoraEscrow.NotFound.selector);
        escrow.accept(42);
    }

    // ───────── decline ─────────

    function test_Decline_ByPayerRefundsEverything() public {
        uint256 id = _two(30e6, 70e6);
        // make it a pending agreement instead
        id = _createAs(arbiter, _arr1(AMT), _due1(0), uint64(T0 + 1 days), 0);
        uint256 payerBefore = _bal(payer);

        vm.expectEmit(true, true, true, true, address(escrow));
        emit TrustoraEscrow.MilestoneRefunded(id, 0, payer, AMT, 3);
        vm.expectEmit(true, true, false, true, address(escrow));
        emit TrustoraEscrow.AgreementCancelled(id, payer, AMT);
        vm.prank(payer);
        escrow.decline(id);

        assertEq(_bal(payer), payerBefore + AMT);
        assertTrue(escrow.getAgreement(id).cancelled);
        assertTrue(_st(id, 0) == TrustoraEscrow.State.Refunded);
        // the unrelated first agreement still holds its funds
        assertEq(_bal(address(escrow)), 100e6);
    }

    function test_Decline_ByPayeeRefundsPayer() public {
        uint256 id = _pend(uint64(T0 + 1 days));
        uint256 payerBefore = _bal(payer);
        vm.prank(payee);
        escrow.decline(id);
        assertEq(_bal(payer), payerBefore + AMT);
        assertEq(_bal(payee), 0);
        assertEq(_bal(address(escrow)), 0);
    }

    function test_Decline_MultiMilestoneRefundsTotal() public {
        uint128[] memory amts = new uint128[](3);
        amts[0] = 1;
        amts[1] = 2;
        amts[2] = 3e6;
        uint256 id = _createAs(arbiter, amts, new uint64[](3), uint64(T0 + 1 days), 0);
        vm.expectEmit(true, true, false, true, address(escrow));
        emit TrustoraEscrow.AgreementCancelled(id, payer, 3e6 + 3);
        vm.prank(payer);
        escrow.decline(id);
        assertEq(_bal(payer), PAYER_FUNDS);
        for (uint256 i; i < 3; ++i) assertTrue(_st(id, i) == TrustoraEscrow.State.Refunded);
    }

    function test_Decline_StillPossibleAfterAcceptByExpired() public {
        uint256 id = _pend(uint64(T0 + 1 days));
        vm.warp(T0 + 5 days);
        vm.prank(payer);
        escrow.decline(id);
        assertEq(_bal(payer), PAYER_FUNDS);
    }

    function test_Decline_OnlyParties() public {
        uint256 id = _pend(uint64(T0 + 1 days));
        address[2] memory bad = [arbiter, stranger];
        for (uint256 i; i < 2; ++i) {
            vm.prank(bad[i]);
            vm.expectRevert(TrustoraEscrow.Unauthorized.selector);
            escrow.decline(id);
        }
    }

    function test_Decline_RevertsAfterAccept() public {
        uint256 id = _pend(uint64(T0 + 1 days));
        vm.prank(payee);
        escrow.accept(id);
        vm.prank(payer);
        vm.expectRevert(TrustoraEscrow.InvalidState.selector);
        escrow.decline(id);
    }

    function test_Decline_CannotBeRepeated() public {
        uint256 id = _pend(uint64(T0 + 1 days));
        vm.prank(payer);
        escrow.decline(id);
        vm.prank(payee);
        vm.expectRevert(TrustoraEscrow.InvalidState.selector);
        escrow.decline(id);
        assertEq(_bal(payer), PAYER_FUNDS);
    }

    function test_Decline_RevertsOnAcceptedFromCreation() public {
        uint256 id = _one(AMT);
        vm.prank(payer);
        vm.expectRevert(TrustoraEscrow.InvalidState.selector);
        escrow.decline(id);
    }

    function test_Decline_BlockedPayerLeavesUnclaimedThenClaims() public {
        uint256 id = _pend(uint64(T0 + 1 days));
        bt.setBlocked(payer, true);
        vm.expectEmit(true, true, false, true, address(escrow));
        emit TrustoraEscrow.AgreementCancelled(id, payee, AMT);
        vm.prank(payee);
        escrow.decline(id);
        assertTrue(_st(id, 0) == TrustoraEscrow.State.Unclaimed);
        assertEq(escrow.owedTo(id, 0), payer);
        assertEq(_bal(address(escrow)), AMT);

        bt.setBlocked(payer, false);
        vm.prank(payer);
        escrow.claim(id, 0);
        assertEq(_bal(payer), PAYER_FUNDS);
        assertTrue(_st(id, 0) == TrustoraEscrow.State.Refunded);
    }

    // ───────── markDelivered ─────────

    function test_MarkDelivered_HappyPath() public {
        uint256 id = _one(AMT);
        vm.warp(T0 + 3 hours);
        vm.expectEmit(true, true, false, false, address(escrow));
        emit TrustoraEscrow.MilestoneDelivered(id, 0);
        _deliver(id, 0);
        TrustoraEscrow.Milestone memory m = _ms(id, 0);
        assertTrue(m.state == TrustoraEscrow.State.Delivered);
        assertEq(m.deliveredAt, T0 + 3 hours);
    }

    function test_MarkDelivered_OnlyPayee() public {
        uint256 id = _one(AMT);
        address[3] memory bad = [payer, arbiter, stranger];
        for (uint256 i; i < 3; ++i) {
            vm.prank(bad[i]);
            vm.expectRevert(TrustoraEscrow.Unauthorized.selector);
            escrow.markDelivered(id, 0);
        }
    }

    function test_MarkDelivered_RevertsBeforeAcceptance() public {
        uint256 id = _pend(uint64(T0 + 1 days));
        vm.prank(payee);
        vm.expectRevert(TrustoraEscrow.InvalidState.selector);
        escrow.markDelivered(id, 0);
    }

    function test_MarkDelivered_RevertsWhenCancelled() public {
        uint256 id = _pend(uint64(T0 + 1 days));
        vm.prank(payer);
        escrow.decline(id);
        vm.prank(payee);
        vm.expectRevert(TrustoraEscrow.InvalidState.selector);
        escrow.markDelivered(id, 0);
    }

    function test_MarkDelivered_RevertsTwiceAndBadIndexAndUnknown() public {
        uint256 id = _one(AMT);
        _deliver(id, 0);
        vm.prank(payee);
        vm.expectRevert(TrustoraEscrow.InvalidState.selector);
        escrow.markDelivered(id, 0);
        vm.prank(payee);
        vm.expectRevert(TrustoraEscrow.InvalidIndex.selector);
        escrow.markDelivered(id, 1);
        vm.prank(payee);
        vm.expectRevert(TrustoraEscrow.NotFound.selector);
        escrow.markDelivered(77, 0);
    }

    function test_MarkDelivered_LateAfterDueAtRejected_AtDueAtAllowed() public {
        uint256 id = _createAs(arbiter, _arr1(AMT), _due1(uint64(T0 + 1 days)), 0, 0);
        vm.warp(T0 + 1 days + 1);
        vm.prank(payee);
        vm.expectRevert(TrustoraEscrow.LateDelivery.selector);
        escrow.markDelivered(id, 0);

        uint256 id2 = _createAs(arbiter, _arr1(AMT), _due1(uint64(T0 + 2 days)), 0, 0);
        vm.warp(T0 + 2 days);
        _deliver(id2, 0);
        assertTrue(_st(id2, 0) == TrustoraEscrow.State.Delivered);
    }

    function test_MarkDelivered_NoDueAtAlwaysAllowed() public {
        uint256 id = _one(AMT);
        vm.warp(T0 + 3000 days);
        _deliver(id, 0);
        assertTrue(_st(id, 0) == TrustoraEscrow.State.Delivered);
    }

    // ───────── approve ─────────

    function _expectReleased(uint256 id, uint128 amount, uint8 reason) internal {
        vm.expectEmit(true, true, true, true, address(escrow));
        emit TrustoraEscrow.MilestoneReleased(id, 0, payee, amount, reason);
    }

    function test_Approve_FromFunded() public {
        uint256 id = _one(AMT);
        _expectReleased(id, AMT, 0);
        vm.prank(payer);
        escrow.approve(id, 0);
        assertEq(_bal(payee), AMT);
        assertEq(_bal(address(escrow)), 0);
        assertTrue(_st(id, 0) == TrustoraEscrow.State.Released);
    }

    function test_Approve_FromDelivered() public {
        uint256 id = _one(AMT);
        _deliver(id, 0);
        _expectReleased(id, AMT, 0);
        vm.prank(payer);
        escrow.approve(id, 0);
        assertEq(_bal(payee), AMT);
        assertTrue(_st(id, 0) == TrustoraEscrow.State.Released);
    }

    function test_Approve_FromDisputed() public {
        uint256 id = _one(AMT);
        _deliver(id, 0);
        _dispute(id, 0);
        _expectReleased(id, AMT, 0);
        vm.prank(payer);
        escrow.approve(id, 0);
        assertEq(_bal(payee), AMT);
        assertTrue(_st(id, 0) == TrustoraEscrow.State.Released);
    }

    function test_Approve_OnlyPayer() public {
        uint256 id = _one(AMT);
        address[3] memory bad = [payee, arbiter, stranger];
        for (uint256 i; i < 3; ++i) {
            vm.prank(bad[i]);
            vm.expectRevert(TrustoraEscrow.Unauthorized.selector);
            escrow.approve(id, 0);
        }
    }

    function test_Approve_RevertsBeforeAcceptance() public {
        uint256 id = _pend(uint64(T0 + 1 days));
        vm.prank(payer);
        vm.expectRevert(TrustoraEscrow.InvalidState.selector);
        escrow.approve(id, 0);
    }

    function test_Approve_RevertsBadIndexAndUnknown() public {
        uint256 id = _one(AMT);
        vm.prank(payer);
        vm.expectRevert(TrustoraEscrow.InvalidIndex.selector);
        escrow.approve(id, 5);
        vm.prank(payer);
        vm.expectRevert(TrustoraEscrow.NotFound.selector);
        escrow.approve(9, 0);
    }

    function test_Approve_OnlyAffectsChosenMilestone() public {
        uint256 id = _two(10e6, 20e6);
        vm.prank(payer);
        escrow.approve(id, 1);
        assertEq(_bal(payee), 20e6);
        assertTrue(_st(id, 0) == TrustoraEscrow.State.Funded);
        assertEq(_bal(address(escrow)), 10e6);
    }

    // ───────── autoRelease ─────────

    function test_AutoRelease_TimingBoundary() public {
        uint256 id = _oneAuto(AMT, 1 days);
        _deliver(id, 0);
        vm.warp(T0 + 1 days - 1);
        vm.prank(stranger);
        vm.expectRevert(TrustoraEscrow.TooEarly.selector);
        escrow.autoRelease(id, 0);

        vm.warp(T0 + 1 days);
        _expectReleased(id, AMT, 1);
        vm.prank(stranger);
        escrow.autoRelease(id, 0);
        assertEq(_bal(payee), AMT);
        assertTrue(_st(id, 0) == TrustoraEscrow.State.Released);
    }

    function test_AutoRelease_TimerStartsAtDelivery() public {
        uint256 id = _oneAuto(AMT, 1 days);
        vm.warp(T0 + 10 days);
        _deliver(id, 0);
        vm.warp(T0 + 10 days + 1 days - 1);
        vm.expectRevert(TrustoraEscrow.TooEarly.selector);
        escrow.autoRelease(id, 0);
    }

    function test_AutoRelease_RevertsIfNotDelivered() public {
        uint256 id = _oneAuto(AMT, 1 hours);
        vm.warp(T0 + 100 days);
        vm.expectRevert(TrustoraEscrow.InvalidState.selector);
        escrow.autoRelease(id, 0);
    }

    function test_AutoRelease_RevertsIfDisabled() public {
        uint256 id = _one(AMT);
        _deliver(id, 0);
        vm.warp(T0 + 1000 days);
        vm.expectRevert(TrustoraEscrow.InvalidState.selector);
        escrow.autoRelease(id, 0);
    }

    function test_AutoRelease_RevertsIfDisputed() public {
        uint256 id = _oneAuto(AMT, 1 hours);
        _deliver(id, 0);
        _dispute(id, 0);
        vm.warp(T0 + 100 days);
        vm.expectRevert(TrustoraEscrow.InvalidState.selector);
        escrow.autoRelease(id, 0);
    }

    function test_AutoRelease_CannotRepeat() public {
        uint256 id = _oneAuto(AMT, 1 hours);
        _deliver(id, 0);
        vm.warp(T0 + 1 hours);
        escrow.autoRelease(id, 0);
        vm.expectRevert(TrustoraEscrow.InvalidState.selector);
        escrow.autoRelease(id, 0);
        assertEq(_bal(payee), AMT);
    }

    function test_AutoRelease_BadIndexAndUnknown() public {
        uint256 id = _oneAuto(AMT, 1 hours);
        vm.expectRevert(TrustoraEscrow.InvalidIndex.selector);
        escrow.autoRelease(id, 1);
        vm.expectRevert(TrustoraEscrow.NotFound.selector);
        escrow.autoRelease(id + 1, 0);
    }
}
