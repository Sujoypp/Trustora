// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {TrustoraEscrow} from "../TrustoraEscrow.sol";
import {TrustoraEscrowBase} from "./TrustoraEscrow.t.sol";

contract TrustoraEscrowFuzzTest is TrustoraEscrowBase {
    function _disputed(uint128 amount) internal returns (uint256 id) {
        id = _one(amount);
        _deliver(id, 0);
        _dispute(id, 0);
    }

    function testFuzz_Create_PullsExactTotalAndStoresAmounts(uint256 n, uint256 seed) public {
        n = bound(n, 1, 20);
        uint128[] memory amts = new uint128[](n);
        uint64[] memory dues = new uint64[](n);
        uint256 total;
        for (uint256 i; i < n; ++i) {
            amts[i] = uint128(bound(uint256(keccak256(abi.encode(seed, i))), 1, 5e10));
            total += amts[i];
        }
        uint256 id = _createAs(arbiter, amts, dues, 0, 0);
        assertEq(_bal(address(escrow)), total);
        assertEq(_bal(payer), PAYER_FUNDS - total);
        assertEq(escrow.getAgreement(id).total, total);
        TrustoraEscrow.Milestone[] memory ms = escrow.getMilestones(id);
        uint256 sum;
        for (uint256 i; i < n; ++i) sum += ms[i].amount;
        assertEq(sum, total);
    }

    function testFuzz_Create_AutoReleaseRange(uint64 x) public {
        bool valid = x == 0 || (x >= 1 hours && x <= 365 days);
        vm.prank(payer);
        if (!valid) vm.expectRevert(TrustoraEscrow.InvalidAutoRelease.selector);
        escrow.create(payee, arbiter, _arr1(1), _due1(0), 0, x, "");
    }

    function testFuzz_Create_DeadlinesMustBeInFuture(uint64 dueAt, uint64 acceptBy) public {
        vm.prank(payer);
        if (dueAt != 0 && dueAt <= T0) vm.expectRevert(TrustoraEscrow.InvalidDeadline.selector);
        else if (acceptBy != 0 && acceptBy <= T0) vm.expectRevert(TrustoraEscrow.InvalidDeadline.selector);
        escrow.create(payee, arbiter, _arr1(1), _due1(dueAt), acceptBy, 0, "");
    }

    function testFuzz_Create_TermsLength(uint256 len) public {
        len = bound(len, 0, 1500);
        bytes memory terms = new bytes(len);
        vm.prank(payer);
        if (len > 1000) vm.expectRevert(TrustoraEscrow.TermsTooLong.selector);
        escrow.create(payee, arbiter, _arr1(1), _due1(0), 0, 0, string(terms));
    }

    function testFuzz_Approve_PaysFullAmountOnce(uint128 amount) public {
        amount = uint128(bound(amount, 1, PAYER_FUNDS));
        uint256 id = _one(amount);
        vm.prank(payer);
        escrow.approve(id, 0);
        assertEq(_bal(payee), amount);
        assertEq(_bal(address(escrow)), 0);
        vm.prank(payer);
        vm.expectRevert(TrustoraEscrow.InvalidState.selector);
        escrow.approve(id, 0);
    }

    function testFuzz_Settle_SplitIsExactAndOddUnitToPayee(uint128 amount) public {
        amount = uint128(bound(amount, 1, PAYER_FUNDS));
        uint256 id = _disputed(amount);
        skip(30 days);
        vm.prank(payee);
        escrow.settleExpiredDispute(id, 0);
        uint256 payerShare = uint256(amount) / 2;
        assertEq(_bal(payer), PAYER_FUNDS - amount + payerShare);
        assertEq(_bal(payee), amount - payerShare);
        assertGe(_bal(payee), _bal(payer) - (PAYER_FUNDS - amount));
        assertEq(_bal(address(escrow)), 0);
    }

    function testFuzz_Settle_Timing(uint256 elapsed) public {
        elapsed = bound(elapsed, 0, 90 days);
        uint256 id = _disputed(1e6);
        skip(elapsed);
        vm.prank(payer);
        if (elapsed < 30 days) vm.expectRevert(TrustoraEscrow.TooEarly.selector);
        escrow.settleExpiredDispute(id, 0);
    }

    function testFuzz_Settle_WithBlockedShares_AllFundsEventuallyAccounted(uint128 amount, bool blockPayee, bool blockPayer)
        public
    {
        amount = uint128(bound(amount, 1, 1e12));
        uint256 id = _disputed(amount);
        bt.setBlocked(payee, blockPayee);
        bt.setBlocked(payer, blockPayer);
        skip(30 days);
        vm.prank(payer);
        escrow.settleExpiredDispute(id, 0);

        uint256 payerShare = uint256(amount) / 2;
        uint256 payeeShare = amount - payerShare;
        uint256 stuck = (blockPayee ? payeeShare : 0) + (blockPayer ? payerShare : 0);
        assertEq(_bal(address(escrow)), stuck, "only blocked shares remain");

        bt.setBlocked(payee, false);
        bt.setBlocked(payer, false);
        if (blockPayee) {
            vm.prank(payee);
            escrow.claim(id, 0);
        }
        if (blockPayer && payerShare > 0) {
            vm.prank(payer);
            escrow.claim(id, 0);
        }
        assertEq(_bal(address(escrow)), 0);
        assertEq(_bal(payee), payeeShare);
        assertEq(_bal(payer), PAYER_FUNDS - amount + payerShare);
        assertFalse(_st(id, 0) == TrustoraEscrow.State.Unclaimed);
    }

    function testFuzz_AutoRelease_Timing(uint64 autoAfter, uint256 elapsed) public {
        autoAfter = uint64(bound(autoAfter, 1 hours, 365 days));
        elapsed = bound(elapsed, 0, 2 * uint256(autoAfter));
        uint256 id = _oneAuto(5e6, autoAfter);
        _deliver(id, 0);
        skip(elapsed);
        if (elapsed < autoAfter) vm.expectRevert(TrustoraEscrow.TooEarly.selector);
        escrow.autoRelease(id, 0);
        assertEq(_bal(payee), elapsed < autoAfter ? 0 : 5e6);
    }

    function testFuzz_Delivery_Deadline(uint64 dueOffset, uint64 deliverOffset) public {
        dueOffset = uint64(bound(dueOffset, 1, 365 days));
        deliverOffset = uint64(bound(deliverOffset, 0, 2 * uint256(dueOffset)));
        uint256 id = _createAs(arbiter, _arr1(1e6), _due1(uint64(T0 + dueOffset)), 0, 0);
        skip(deliverOffset);
        vm.prank(payee);
        if (deliverOffset > dueOffset) vm.expectRevert(TrustoraEscrow.LateDelivery.selector);
        escrow.markDelivered(id, 0);
    }

    function testFuzz_Accept_Deadline(uint64 acceptOffset, uint64 acceptAt) public {
        acceptOffset = uint64(bound(acceptOffset, 1, 365 days));
        acceptAt = uint64(bound(acceptAt, 0, 2 * uint256(acceptOffset)));
        uint256 id = _createAs(arbiter, _arr1(1e6), _due1(0), uint64(T0 + acceptOffset), 0);
        skip(acceptAt);
        vm.prank(payee);
        if (acceptAt > acceptOffset) vm.expectRevert(TrustoraEscrow.AcceptanceExpired.selector);
        escrow.accept(id);
    }

    function testFuzz_PayerRefund_Deadline(uint64 dueOffset, uint64 at) public {
        dueOffset = uint64(bound(dueOffset, 1, 365 days));
        at = uint64(bound(at, 0, 2 * uint256(dueOffset)));
        uint256 id = _createAs(arbiter, _arr1(1e6), _due1(uint64(T0 + dueOffset)), 0, 0);
        skip(at);
        vm.prank(payer);
        if (at <= dueOffset) vm.expectRevert(TrustoraEscrow.TooEarly.selector);
        escrow.refund(id, 0);
    }

    function testFuzz_Recover_Timing(uint256 delta) public {
        delta = bound(delta, 0, 400 days);
        uint256 id = _one(7e6);
        bt.setBlocked(payee, true);
        vm.prank(payer);
        escrow.approve(id, 0);
        bt.setBlocked(payee, false);
        skip(delta);
        vm.prank(payer);
        if (delta < 180 days) vm.expectRevert(TrustoraEscrow.TooEarly.selector);
        escrow.recoverUnclaimed(id, 0);
        assertEq(_bal(payer), delta < 180 days ? PAYER_FUNDS - 7e6 : PAYER_FUNDS);
    }

    function _expectUnauth(address caller, bytes memory data) internal {
        vm.prank(caller);
        (bool ok, bytes memory ret) = address(escrow).call(data);
        assertFalse(ok);
        assertEq(bytes4(ret), TrustoraEscrow.Unauthorized.selector);
    }

    function testFuzz_AccessControl_OutsidersAlwaysUnauthorized(address caller) public {
        vm.assume(caller != payer && caller != payee && caller != arbiter);
        uint256 id = _disputed(10e6);
        uint256 id2 = _one(10e6);
        bt.setBlocked(payee, true);
        vm.prank(payer);
        escrow.approve(id2, 0); // Unclaimed
        uint256 escrowBal = _bal(address(escrow));

        _expectUnauth(caller, abi.encodeCall(escrow.accept, (id)));
        _expectUnauth(caller, abi.encodeCall(escrow.decline, (id)));
        _expectUnauth(caller, abi.encodeCall(escrow.markDelivered, (id, 0)));
        _expectUnauth(caller, abi.encodeCall(escrow.approve, (id, 0)));
        _expectUnauth(caller, abi.encodeCall(escrow.dispute, (id, 0)));
        _expectUnauth(caller, abi.encodeCall(escrow.resolve, (id, 0, true)));
        _expectUnauth(caller, abi.encodeCall(escrow.settleExpiredDispute, (id, 0)));
        _expectUnauth(caller, abi.encodeCall(escrow.refund, (id, 0)));
        _expectUnauth(caller, abi.encodeCall(escrow.claim, (id2, 0)));
        _expectUnauth(caller, abi.encodeCall(escrow.recoverUnclaimed, (id2, 0)));
        assertEq(_bal(address(escrow)), escrowBal);
    }

    function testFuzz_Resolve_PaysExactlyOneParty(uint128 amount, bool toPayee) public {
        amount = uint128(bound(amount, 1, PAYER_FUNDS));
        uint256 id = _disputed(amount);
        vm.prank(arbiter);
        escrow.resolve(id, 0, toPayee);
        assertEq(_bal(payee), toPayee ? amount : 0);
        assertEq(_bal(payer), toPayee ? PAYER_FUNDS - amount : PAYER_FUNDS);
        assertEq(_bal(address(escrow)), 0);
    }
}
