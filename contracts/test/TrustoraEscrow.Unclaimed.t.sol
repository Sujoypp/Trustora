// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {TrustoraEscrow} from "../TrustoraEscrow.sol";
import {TrustoraEscrowBase, FalseERC20} from "./TrustoraEscrow.t.sol";

/// @dev Non-reverting payouts, claim, recoverUnclaimed, split failures, double-payout guards.
contract TrustoraEscrowUnclaimedTest is TrustoraEscrowBase {
    uint128 internal constant AMT = 100e6;

    function _disputed(uint128 amount) internal returns (uint256 id) {
        id = _one(amount);
        _deliver(id, 0);
        _dispute(id, 0);
    }

    /// @dev Payee is blocked, payer approves → milestone becomes Unclaimed (payee-owed).
    function _payeeOwed(uint128 amount) internal returns (uint256 id) {
        id = _one(amount);
        bt.setBlocked(payee, true);
        vm.prank(payer);
        escrow.approve(id, 0);
    }

    function _isUnclaimed(uint256 id) internal view returns (bool) {
        return _st(id, 0) == TrustoraEscrow.State.Unclaimed;
    }

    // ───────── payee payouts fail ─────────

    function test_BlockedPayee_ApproveLeavesUnclaimed() public {
        uint256 id = _one(AMT);
        bt.setBlocked(payee, true);
        vm.expectEmit(true, true, true, true, address(escrow));
        emit TrustoraEscrow.MilestoneUnclaimed(id, 0, payee, AMT);
        vm.prank(payer);
        escrow.approve(id, 0); // must not revert

        assertTrue(_isUnclaimed(id));
        assertEq(_ms(id, 0).stateAt, T0);
        assertEq(escrow.owedTo(id, 0), payee);
        assertEq(_bal(address(escrow)), AMT);
        assertEq(_bal(payee), 0);
        (uint128 pe, uint128 pr) = _pending(id, 0);
        assertEq(pe, AMT);
        assertEq(pr, 0);
    }

    function test_BlockedPayee_ClaimWorksAfterUnblock() public {
        uint256 id = _payeeOwed(AMT);
        bt.setBlocked(payee, false);
        vm.expectEmit(true, true, true, true, address(escrow));
        emit TrustoraEscrow.MilestoneReleased(id, 0, payee, AMT, 4);
        vm.prank(payee);
        escrow.claim(id, 0);
        assertEq(_bal(payee), AMT);
        assertEq(_bal(address(escrow)), 0);
        assertTrue(_st(id, 0) == TrustoraEscrow.State.Released);
        assertEq(escrow.owedTo(id, 0), address(0));
        (uint128 pe, uint128 pr) = _pending(id, 0);
        assertEq(pe, 0);
        assertEq(pr, 0);
    }

    function test_Claim_FailureRevertsAndKeepsAmountPending() public {
        uint256 id = _payeeOwed(AMT);
        vm.prank(payee);
        vm.expectRevert(TrustoraEscrow.TokenTransferFailed.selector);
        escrow.claim(id, 0);
        assertTrue(_isUnclaimed(id));
        assertEq(escrow.owedTo(id, 0), payee);
        (uint128 pe,) = _pending(id, 0);
        assertEq(pe, AMT);
        assertEq(_bal(address(escrow)), AMT);

        bt.setBlocked(payee, false);
        vm.prank(payee);
        escrow.claim(id, 0);
        assertEq(_bal(payee), AMT);
    }

    function test_Claim_CannotBeRepeated() public {
        uint256 id = _payeeOwed(AMT);
        bt.setBlocked(payee, false);
        vm.prank(payee);
        escrow.claim(id, 0);
        vm.prank(payee);
        vm.expectRevert(TrustoraEscrow.InvalidState.selector);
        escrow.claim(id, 0);
        assertEq(_bal(payee), AMT);
    }

    function test_GlobalPause_PayoutsBecomeUnclaimedThenClaim() public {
        uint256 id = _one(AMT);
        bt.setPaused(true);
        vm.prank(payer);
        escrow.approve(id, 0);
        assertTrue(_isUnclaimed(id));
        vm.prank(payee);
        vm.expectRevert(TrustoraEscrow.TokenTransferFailed.selector);
        escrow.claim(id, 0);
        bt.setPaused(false);
        vm.prank(payee);
        escrow.claim(id, 0);
        assertEq(_bal(payee), AMT);
    }

    function test_BlockedPayee_AutoReleaseAndResolveBecomeUnclaimed() public {
        uint256 a = _oneAuto(AMT, 1 hours);
        _deliver(a, 0);
        uint256 b = _disputed(AMT);
        bt.setBlocked(payee, true);
        skip(1 hours);
        escrow.autoRelease(a, 0);
        vm.prank(arbiter);
        escrow.resolve(b, 0, true);
        assertTrue(_isUnclaimed(a));
        assertTrue(_isUnclaimed(b));
        assertEq(escrow.owedTo(a, 0), payee);
        assertEq(escrow.owedTo(b, 0), payee);
    }

    function test_BlockedPayee_OtherMilestonesStillPayOthers() public {
        uint256 id = _two(10e6, 20e6);
        bt.setBlocked(payee, true);
        vm.prank(payer);
        escrow.approve(id, 0);
        bt.setBlocked(payee, false);
        vm.prank(payer);
        escrow.approve(id, 1);
        assertEq(_bal(payee), 20e6);
        assertEq(_bal(address(escrow)), 10e6);
    }

    // ───────── payer payouts fail ─────────

    function test_BlockedPayer_RefundPathsBecomeUnclaimedAndClaimable() public {
        uint256 a = _one(AMT);
        uint256 b = _disputed(AMT);
        uint256 c = _createAs(arbiter, _arr1(AMT), _due1(uint64(T0 + 1 days)), 0, 0);
        bt.setBlocked(payer, true);

        vm.prank(payee);
        escrow.refund(a, 0);
        vm.prank(arbiter);
        escrow.resolve(b, 0, false);
        skip(1 days + 1);
        vm.prank(payer);
        escrow.refund(c, 0);

        uint256[3] memory ids = [a, b, c];
        for (uint256 i; i < 3; ++i) {
            assertTrue(_isUnclaimed(ids[i]));
            assertEq(escrow.owedTo(ids[i], 0), payer);
            vm.prank(payer);
            vm.expectRevert(TrustoraEscrow.TokenTransferFailed.selector);
            escrow.claim(ids[i], 0);
        }
        bt.setBlocked(payer, false);
        uint256 beforeBal = _bal(payer);
        for (uint256 i; i < 3; ++i) {
            vm.expectEmit(true, true, true, true, address(escrow));
            emit TrustoraEscrow.MilestoneRefunded(ids[i], 0, payer, AMT, 4);
            vm.prank(payer);
            escrow.claim(ids[i], 0);
            assertTrue(_st(ids[i], 0) == TrustoraEscrow.State.Refunded);
        }
        assertEq(_bal(payer), beforeBal + 3 * AMT);
        assertEq(_bal(address(escrow)), 0);
    }

    // ───────── claim access control ─────────

    function test_Claim_AccessControl() public {
        uint256 id = _payeeOwed(AMT);
        bt.setBlocked(payee, false);
        // not a party / not the owed party
        address[3] memory bad = [stranger, arbiter, payer];
        for (uint256 i; i < 3; ++i) {
            vm.prank(bad[i]);
            vm.expectRevert(TrustoraEscrow.Unauthorized.selector);
            escrow.claim(id, 0);
        }
        // payee-owed funds are not claimable by the payer even much later
        skip(1000 days);
        vm.prank(payer);
        vm.expectRevert(TrustoraEscrow.Unauthorized.selector);
        escrow.claim(id, 0);
    }

    function test_Claim_PayeeCannotClaimPayerShare() public {
        uint256 id = _one(AMT);
        bt.setBlocked(payer, true);
        vm.prank(payee);
        escrow.refund(id, 0);
        bt.setBlocked(payer, false);
        vm.prank(payee);
        vm.expectRevert(TrustoraEscrow.Unauthorized.selector);
        escrow.claim(id, 0);
        vm.prank(payer);
        escrow.claim(id, 0);
        assertEq(_bal(payer), PAYER_FUNDS);
    }

    function test_Claim_RevertsWhenNotUnclaimed() public {
        uint256 id = _one(AMT);
        vm.prank(payee);
        vm.expectRevert(TrustoraEscrow.InvalidState.selector);
        escrow.claim(id, 0);
        vm.prank(payer);
        escrow.approve(id, 0);
        vm.prank(payee);
        vm.expectRevert(TrustoraEscrow.InvalidState.selector);
        escrow.claim(id, 0);
    }

    function test_Claim_And_Recover_BadIndexAndUnknown() public {
        uint256 id = _payeeOwed(AMT);
        vm.expectRevert(TrustoraEscrow.InvalidIndex.selector);
        escrow.claim(id, 1);
        vm.expectRevert(TrustoraEscrow.NotFound.selector);
        escrow.claim(id + 1, 0);
        vm.prank(payer);
        vm.expectRevert(TrustoraEscrow.InvalidIndex.selector);
        escrow.recoverUnclaimed(id, 1);
        vm.prank(payer);
        vm.expectRevert(TrustoraEscrow.NotFound.selector);
        escrow.recoverUnclaimed(id + 1, 0);
    }

    // ───────── recoverUnclaimed ─────────

    function test_Recover_AfterDelayOnlyByPayer() public {
        skip(5 days);
        uint256 id = _payeeOwed(AMT); // stateAt = T0 + 5 days
        bt.setBlocked(payee, false);
        uint256 t = T0 + 5 days;

        vm.warp(t + 180 days - 1);
        vm.prank(payer);
        vm.expectRevert(TrustoraEscrow.TooEarly.selector);
        escrow.recoverUnclaimed(id, 0);

        vm.warp(t + 180 days);
        address[3] memory bad = [payee, arbiter, stranger];
        for (uint256 i; i < 3; ++i) {
            vm.prank(bad[i]);
            vm.expectRevert(TrustoraEscrow.Unauthorized.selector);
            escrow.recoverUnclaimed(id, 0);
        }

        uint256 payerBefore = _bal(payer);
        vm.expectEmit(true, true, true, true, address(escrow));
        emit TrustoraEscrow.MilestoneRefunded(id, 0, payer, AMT, 5);
        vm.prank(payer);
        escrow.recoverUnclaimed(id, 0);
        assertEq(_bal(payer), payerBefore + AMT);
        assertEq(_bal(address(escrow)), 0);
        assertTrue(_st(id, 0) == TrustoraEscrow.State.Refunded);
        assertEq(escrow.owedTo(id, 0), address(0));

        // payee can no longer claim, payer cannot recover twice
        vm.prank(payee);
        vm.expectRevert(TrustoraEscrow.InvalidState.selector);
        escrow.claim(id, 0);
        vm.prank(payer);
        vm.expectRevert(TrustoraEscrow.InvalidState.selector);
        escrow.recoverUnclaimed(id, 0);
    }

    function test_Recover_PayeeCanStillClaimAfterDelayUntilRecovered() public {
        uint256 id = _payeeOwed(AMT);
        bt.setBlocked(payee, false);
        vm.warp(T0 + 400 days);
        vm.prank(payee);
        escrow.claim(id, 0);
        assertEq(_bal(payee), AMT);
        vm.prank(payer);
        vm.expectRevert(TrustoraEscrow.InvalidState.selector);
        escrow.recoverUnclaimed(id, 0);
    }

    function test_Recover_NotForPayerOwedAmounts() public {
        uint256 id = _one(AMT);
        bt.setBlocked(payer, true);
        vm.prank(payee);
        escrow.refund(id, 0); // payer-owed
        bt.setBlocked(payer, false);
        vm.warp(T0 + 1000 days);
        vm.prank(payer);
        vm.expectRevert(TrustoraEscrow.InvalidState.selector);
        escrow.recoverUnclaimed(id, 0);
        vm.prank(payer);
        escrow.claim(id, 0); // still exclusively claimable
        assertEq(_bal(payer), PAYER_FUNDS);
    }

    function test_Recover_RevertsWhenNotUnclaimed() public {
        uint256 id = _one(AMT);
        vm.prank(payer);
        vm.expectRevert(TrustoraEscrow.InvalidState.selector);
        escrow.recoverUnclaimed(id, 0);
    }

    function test_Recover_FailureRevertsAndKeepsState() public {
        uint256 id = _payeeOwed(AMT);
        vm.warp(T0 + 181 days);
        bt.setBlocked(payer, true);
        vm.prank(payer);
        vm.expectRevert(TrustoraEscrow.TokenTransferFailed.selector);
        escrow.recoverUnclaimed(id, 0);
        assertTrue(_isUnclaimed(id));
        (uint128 pe,) = _pending(id, 0);
        assertEq(pe, AMT);
        bt.setBlocked(payer, false);
        vm.prank(payer);
        escrow.recoverUnclaimed(id, 0);
        assertEq(_bal(payer), PAYER_FUNDS);
    }

    // ───────── settleExpiredDispute with failing shares ─────────

    function test_Settle_BothSharesFail_EachPartyClaimsIndependently() public {
        uint256 id = _disputed(101);
        bt.setBlocked(payee, true);
        bt.setBlocked(payer, true);
        skip(30 days);

        vm.expectEmit(true, true, true, true, address(escrow));
        emit TrustoraEscrow.MilestoneUnclaimed(id, 0, payee, 51);
        vm.expectEmit(true, true, true, true, address(escrow));
        emit TrustoraEscrow.MilestoneUnclaimed(id, 0, payer, 50);
        vm.expectEmit(true, true, false, true, address(escrow));
        emit TrustoraEscrow.MilestoneSettled(id, 0, 51, 50);
        vm.prank(payer);
        escrow.settleExpiredDispute(id, 0);

        assertTrue(_isUnclaimed(id));
        assertEq(escrow.owedTo(id, 0), payee);
        assertEq(_bal(address(escrow)), 101);
        (uint128 pe, uint128 pr) = _pending(id, 0);
        assertEq(pe, 51);
        assertEq(pr, 50);

        // payee claims first without waiting for the payer
        bt.setBlocked(payee, false);
        vm.expectEmit(true, true, true, true, address(escrow));
        emit TrustoraEscrow.MilestoneReleased(id, 0, payee, 51, 4);
        vm.prank(payee);
        escrow.claim(id, 0);
        assertEq(_bal(payee), 51);
        assertTrue(_isUnclaimed(id));
        assertEq(escrow.owedTo(id, 0), payer);
        (pe, pr) = _pending(id, 0);
        assertEq(pe, 0);
        assertEq(pr, 50);

        // payee cannot claim a second time; payer claim fails while blocked, keeps amount
        vm.prank(payee);
        vm.expectRevert(TrustoraEscrow.Unauthorized.selector);
        escrow.claim(id, 0);
        vm.prank(payer);
        vm.expectRevert(TrustoraEscrow.TokenTransferFailed.selector);
        escrow.claim(id, 0);
        (, pr) = _pending(id, 0);
        assertEq(pr, 50);

        bt.setBlocked(payer, false);
        vm.prank(payer);
        escrow.claim(id, 0);
        assertEq(_bal(payer), PAYER_FUNDS - 101 + 50);
        assertEq(_bal(address(escrow)), 0);
        assertFalse(_isUnclaimed(id));
        assertEq(escrow.owedTo(id, 0), address(0));
    }

    function test_Settle_BothSharesFail_PayerClaimsFirst() public {
        uint256 id = _disputed(101);
        bt.setBlocked(payee, true);
        bt.setBlocked(payer, true);
        skip(30 days);
        vm.prank(payee);
        escrow.settleExpiredDispute(id, 0);

        bt.setBlocked(payer, false);
        vm.prank(payer);
        escrow.claim(id, 0);
        assertEq(_bal(payer), PAYER_FUNDS - 101 + 50);
        assertTrue(_isUnclaimed(id));
        assertEq(escrow.owedTo(id, 0), payee);
        assertEq(_bal(address(escrow)), 51);

        bt.setBlocked(payee, false);
        vm.prank(payee);
        escrow.claim(id, 0);
        assertEq(_bal(payee), 51);
        assertEq(_bal(address(escrow)), 0);
        assertFalse(_isUnclaimed(id));
    }

    function test_Settle_OnlyPayeeShareFails_PayerPaidImmediately() public {
        uint256 id = _disputed(101);
        bt.setBlocked(payee, true);
        skip(30 days);
        vm.prank(payer);
        escrow.settleExpiredDispute(id, 0);
        assertEq(_bal(payer), PAYER_FUNDS - 101 + 50);
        assertTrue(_isUnclaimed(id));
        assertEq(escrow.owedTo(id, 0), payee);
        assertEq(_bal(address(escrow)), 51);

        // payer may recover the stuck payee share after the delay
        vm.warp(block.timestamp + 180 days);
        vm.prank(payer);
        escrow.recoverUnclaimed(id, 0);
        assertEq(_bal(payer), PAYER_FUNDS);
        assertEq(_bal(address(escrow)), 0);
        assertTrue(_st(id, 0) == TrustoraEscrow.State.Refunded);
    }

    function test_Settle_OnlyPayerShareFails_PayeePaidImmediately() public {
        uint256 id = _disputed(101);
        bt.setBlocked(payer, true);
        skip(30 days);
        vm.prank(payee);
        escrow.settleExpiredDispute(id, 0);
        assertEq(_bal(payee), 51);
        assertTrue(_isUnclaimed(id));
        assertEq(escrow.owedTo(id, 0), payer);
        // payer-owed share is never recoverable
        vm.warp(block.timestamp + 900 days);
        vm.prank(payer);
        vm.expectRevert(TrustoraEscrow.InvalidState.selector);
        escrow.recoverUnclaimed(id, 0);
        bt.setBlocked(payer, false);
        vm.prank(payer);
        escrow.claim(id, 0);
        assertEq(_bal(address(escrow)), 0);
        assertTrue(_st(id, 0) == TrustoraEscrow.State.Refunded);
    }

    function test_Settle_SingleUnitPayeeShareFails() public {
        uint256 id = _disputed(1);
        bt.setBlocked(payee, true);
        skip(30 days);
        vm.prank(payer);
        escrow.settleExpiredDispute(id, 0);
        assertTrue(_isUnclaimed(id));
        (uint128 pe, uint128 pr) = _pending(id, 0);
        assertEq(pe, 1);
        assertEq(pr, 0);
        bt.setBlocked(payee, false);
        vm.prank(payee);
        escrow.claim(id, 0);
        assertEq(_bal(payee), 1);
        assertTrue(_st(id, 0) == TrustoraEscrow.State.Released);
    }

    function test_Recover_BothPending_OnlyPayeeShareRecovered_PayerShareStaysClaimable() public {
        uint256 id = _disputed(101);
        bt.setBlocked(payee, true);
        bt.setBlocked(payer, true);
        skip(30 days);
        vm.prank(payer);
        escrow.settleExpiredDispute(id, 0);
        bt.setBlocked(payer, false);
        vm.warp(block.timestamp + 180 days);

        vm.prank(payer);
        escrow.recoverUnclaimed(id, 0);
        assertEq(_bal(payer), PAYER_FUNDS - 101 + 51);
        assertEq(_bal(address(escrow)), 50);
        assertTrue(_isUnclaimed(id));
        assertEq(escrow.owedTo(id, 0), payer);

        vm.prank(payer);
        vm.expectRevert(TrustoraEscrow.InvalidState.selector);
        escrow.recoverUnclaimed(id, 0);

        vm.prank(payer);
        escrow.claim(id, 0);
        assertEq(_bal(payer), PAYER_FUNDS);
        assertEq(_bal(address(escrow)), 0);
        assertTrue(_st(id, 0) == TrustoraEscrow.State.Refunded);
    }

    // ───────── other token behaviours ─────────

    function test_FalseReturningToken_PayoutBecomesUnclaimed() public {
        FalseERC20 ft = new FalseERC20();
        _useToken(address(ft));
        uint256 id = _one(AMT);
        ft.setFalse(false, true);
        vm.prank(payer);
        escrow.approve(id, 0);
        assertTrue(_isUnclaimed(id));
        assertEq(_bal(address(escrow)), AMT);

        vm.prank(payee);
        vm.expectRevert(TrustoraEscrow.TokenTransferFailed.selector);
        escrow.claim(id, 0);
        (uint128 pe,) = _pending(id, 0);
        assertEq(pe, AMT);

        ft.setFalse(false, false);
        vm.prank(payee);
        escrow.claim(id, 0);
        assertEq(_bal(payee), AMT);
    }

    // ───────── double payout attempts ─────────

    /// @dev Every function that could move funds, by every actor, must fail now.
    function _assertNoPayoutPossible(uint256 id) internal {
        skip(400 days);
        address[4] memory who = [payer, payee, arbiter, stranger];
        bytes[9] memory calls = [
            abi.encodeCall(escrow.approve, (id, 0)),
            abi.encodeCall(escrow.autoRelease, (id, 0)),
            abi.encodeCall(escrow.dispute, (id, 0)),
            abi.encodeCall(escrow.resolve, (id, 0, true)),
            abi.encodeCall(escrow.resolve, (id, 0, false)),
            abi.encodeCall(escrow.settleExpiredDispute, (id, 0)),
            abi.encodeCall(escrow.refund, (id, 0)),
            abi.encodeCall(escrow.markDelivered, (id, 0)),
            abi.encodeCall(escrow.decline, (id))
        ];
        uint256 balBefore = _bal(address(escrow));
        for (uint256 w; w < who.length; ++w) {
            for (uint256 c; c < calls.length; ++c) {
                vm.prank(who[w]);
                (bool ok,) = address(escrow).call(calls[c]);
                assertFalse(ok, "payout path must revert");
            }
        }
        assertEq(_bal(address(escrow)), balBefore);
    }

    function test_DoublePayout_AfterApprove() public {
        uint256 id = _one(AMT);
        vm.prank(payer);
        escrow.approve(id, 0);
        _assertNoPayoutPossible(id);
        assertEq(_bal(payee), AMT);
    }

    function test_DoublePayout_AfterAutoRelease() public {
        uint256 id = _oneAuto(AMT, 1 hours);
        _deliver(id, 0);
        skip(1 hours);
        escrow.autoRelease(id, 0);
        _assertNoPayoutPossible(id);
        assertEq(_bal(payee), AMT);
    }

    function test_DoublePayout_AfterResolve() public {
        uint256 id = _disputed(AMT);
        vm.prank(arbiter);
        escrow.resolve(id, 0, false);
        _assertNoPayoutPossible(id);
        assertEq(_bal(payer), PAYER_FUNDS);
    }

    function test_DoublePayout_AfterPayeeRefund() public {
        uint256 id = _one(AMT);
        vm.prank(payee);
        escrow.refund(id, 0);
        _assertNoPayoutPossible(id);
        assertEq(_bal(payer), PAYER_FUNDS);
    }

    function test_DoublePayout_AfterPayerRefund() public {
        uint256 id = _createAs(arbiter, _arr1(AMT), _due1(uint64(T0 + 1 days)), 0, 0);
        skip(2 days);
        vm.prank(payer);
        escrow.refund(id, 0);
        _assertNoPayoutPossible(id);
        assertEq(_bal(payer), PAYER_FUNDS);
    }

    function test_DoublePayout_AfterSettlement() public {
        uint256 id = _disputed(AMT);
        skip(30 days);
        vm.prank(payer);
        escrow.settleExpiredDispute(id, 0);
        _assertNoPayoutPossible(id);
        assertEq(_bal(payee), 50e6);
    }

    function test_DoublePayout_AfterDecline() public {
        uint256 id = _createAs(arbiter, _arr1(AMT), _due1(0), uint64(T0 + 1 days), 0);
        vm.prank(payer);
        escrow.decline(id);
        _assertNoPayoutPossible(id);
        assertEq(_bal(payer), PAYER_FUNDS);
    }

    function test_DoublePayout_WhileUnclaimed() public {
        uint256 id = _payeeOwed(AMT);
        bt.setBlocked(payee, false);
        _assertNoPayoutPossible(id);
        assertEq(_bal(address(escrow)), AMT);
    }

    function test_DoublePayout_AfterClaim() public {
        uint256 id = _payeeOwed(AMT);
        bt.setBlocked(payee, false);
        vm.prank(payee);
        escrow.claim(id, 0);
        _assertNoPayoutPossible(id);
        assertEq(_bal(payee), AMT);
    }

    function test_DoublePayout_AfterRecover() public {
        uint256 id = _payeeOwed(AMT);
        bt.setBlocked(payee, false);
        skip(180 days);
        vm.prank(payer);
        escrow.recoverUnclaimed(id, 0);
        _assertNoPayoutPossible(id);
        vm.prank(payee);
        vm.expectRevert(TrustoraEscrow.InvalidState.selector);
        escrow.claim(id, 0);
        assertEq(_bal(payee), 0);
    }

    function test_DeclineAfterPartialPayoutDoesNotDoublePay() public {
        // decline only exists pre-acceptance, where all milestones are Funded; waived milestone
        // (payee refund) must not be refunded a second time.
        uint128[] memory amts = new uint128[](2);
        amts[0] = 10e6;
        amts[1] = 20e6;
        uint256 id = _createAs(arbiter, amts, new uint64[](2), uint64(T0 + 1 days), 0);
        vm.prank(payee);
        escrow.refund(id, 0); // waive milestone 0
        assertEq(_bal(payer), PAYER_FUNDS - 30e6 + 10e6);
        vm.expectEmit(true, true, false, true, address(escrow));
        emit TrustoraEscrow.AgreementCancelled(id, payer, 20e6);
        vm.prank(payer);
        escrow.decline(id);
        assertEq(_bal(payer), PAYER_FUNDS);
        assertEq(_bal(address(escrow)), 0);
    }
}
