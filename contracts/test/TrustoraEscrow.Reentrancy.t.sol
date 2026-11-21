// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {TrustoraEscrow} from "../TrustoraEscrow.sol";
import {TrustoraEscrowBase, ReentrantERC20} from "./TrustoraEscrow.t.sol";

/// @dev A malicious token re-enters the escrow from inside transfer / transferFrom.
contract TrustoraEscrowReentrancyTest is TrustoraEscrowBase {
    ReentrantERC20 internal rt;
    uint256 internal constant K = 12; // number of distinct re-entry payloads

    function setUp() public override {
        super.setUp();
        rt = new ReentrantERC20();
        _useToken(address(rt));
    }

    function _payload(uint256 k, uint256 id) internal view returns (bytes memory) {
        if (k == 0) return abi.encodeCall(escrow.approve, (id, 0));
        if (k == 1) return abi.encodeCall(escrow.autoRelease, (id, 0));
        if (k == 2) return abi.encodeCall(escrow.claim, (id, 0));
        if (k == 3) return abi.encodeCall(escrow.recoverUnclaimed, (id, 0));
        if (k == 4) return abi.encodeCall(escrow.refund, (id, 0));
        if (k == 5) return abi.encodeCall(escrow.resolve, (id, 0, true));
        if (k == 6) return abi.encodeCall(escrow.dispute, (id, 0));
        if (k == 7) return abi.encodeCall(escrow.markDelivered, (id, 0));
        if (k == 8) return abi.encodeCall(escrow.settleExpiredDispute, (id, 0));
        if (k == 9) return abi.encodeCall(escrow.accept, (id));
        if (k == 10) return abi.encodeCall(escrow.decline, (id));
        return abi.encodeCall(escrow.create, (payee, address(0), _arr1(1), _due1(0), uint64(0), uint64(0), ""));
    }

    function _assertBlockedByGuard() internal view {
        assertGt(rt.hookCalls(), 0, "hook never fired");
        assertFalse(rt.lastOk(), "re-entrant call succeeded");
        assertEq(bytes4(rt.lastRet()), TrustoraEscrow.Reentrancy.selector);
    }

    function test_Reentrancy_DuringApprovePayout_AllEntryPointsBlocked() public {
        for (uint256 k; k < K; ++k) {
            uint256 payeeBefore = _bal(payee);
            uint256 escrowBefore = _bal(address(escrow));
            uint256 hooksBefore = rt.hookCalls();
            uint256 id = _oneAuto(10e6, 1 hours);
            rt.arm(address(escrow), _payload(k, id), false);
            vm.prank(payer);
            escrow.approve(id, 0);
            rt.disarm();

            assertEq(rt.hookCalls(), hooksBefore + 1, "hook fired once");
            _assertBlockedByGuard();
            assertEq(_bal(payee), payeeBefore + 10e6, "paid exactly once");
            assertEq(_bal(address(escrow)), escrowBefore, "no extra funds leaked");
            assertTrue(_st(id, 0) == TrustoraEscrow.State.Released);
        }
    }

    function test_Reentrancy_DuringCreateTransferFrom_Blocked() public {
        rt.arm(address(escrow), _payload(11, 1), true);
        vm.prank(payer);
        uint256 id = escrow.create(payee, arbiter, _arr1(5e6), _due1(0), 0, 0, "");
        rt.disarm();
        _assertBlockedByGuard();
        assertEq(id, 1);
        assertEq(escrow.nextId(), 2);
        assertEq(_bal(address(escrow)), 5e6);
    }

    function test_Reentrancy_DuringClaim_Blocked() public {
        uint256 id = _one(10e6);
        rt.setBlocked(payee, true);
        vm.prank(payer);
        escrow.approve(id, 0);
        assertTrue(_st(id, 0) == TrustoraEscrow.State.Unclaimed);
        rt.setBlocked(payee, false);

        rt.arm(address(escrow), _payload(2, id), false);
        vm.prank(payee);
        escrow.claim(id, 0);
        rt.disarm();
        _assertBlockedByGuard();
        assertEq(_bal(payee), 10e6);
        assertEq(_bal(address(escrow)), 0);
    }

    function test_Reentrancy_DuringRecover_Blocked() public {
        uint256 id = _one(10e6);
        rt.setBlocked(payee, true);
        vm.prank(payer);
        escrow.approve(id, 0);
        rt.setBlocked(payee, false);
        skip(180 days);
        rt.arm(address(escrow), _payload(3, id), false);
        vm.prank(payer);
        escrow.recoverUnclaimed(id, 0);
        rt.disarm();
        _assertBlockedByGuard();
        assertEq(_bal(payer), PAYER_FUNDS);
        assertEq(_bal(address(escrow)), 0);
    }

    function test_Reentrancy_DuringSettleBothShares_Blocked() public {
        uint256 id = _one(101);
        _deliver(id, 0);
        _dispute(id, 0);
        skip(30 days);
        rt.arm(address(escrow), _payload(8, id), false);
        vm.prank(payer);
        escrow.settleExpiredDispute(id, 0);
        rt.disarm();
        assertEq(rt.hookCalls(), 2, "one hook per share transfer");
        _assertBlockedByGuard();
        assertEq(_bal(payee), 51);
        assertEq(_bal(payer), PAYER_FUNDS - 101 + 50);
        assertEq(_bal(address(escrow)), 0);
    }

    function test_Reentrancy_GuardResetsAfterRevertedCall() public {
        // a reverting call must leave the guard open for the next call
        uint256 id = _one(10e6);
        vm.prank(stranger);
        vm.expectRevert(TrustoraEscrow.Unauthorized.selector);
        escrow.approve(id, 0);
        vm.prank(payer);
        escrow.approve(id, 0);
        assertEq(_bal(payee), 10e6);
    }
}
