// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title TrustoraEscrow
/// @notice USDC milestone escrow with no owner, admin, fees, pause, or upgrades.
/// @dev Funds move only under the acceptance, approval, deadline, refund, and dispute
/// rules below. Either party can settle a dispute 50/50 after 30 days if the arbiter
/// never resolves; the payer can also approve and the payee can waive a dispute.
/// Failed payouts become Unclaimed instead of reverting, with a pull fallback for
/// the intended recipient. After 180 days an unclaimed payee share is recoverable
/// only by the payer; an unclaimed payer share remains exclusively the payer's.
/// Disputes require an arbiter and a Delivered milestone; no administrator can
/// bypass these rules. Only the configured USDC is used; unsolicited token
/// transfers are not recoverable.
contract TrustoraEscrow {
    uint256 public constant MAX_MILESTONES = 20;
    uint256 public constant MAX_TERMS_BYTES = 1000;
    uint256 public constant MIN_AUTO_RELEASE = 1 hours;
    uint256 public constant MAX_AUTO_RELEASE = 365 days;
    uint256 public constant DISPUTE_TIMEOUT = 30 days;
    uint256 public constant RECOVERY_DELAY = 180 days;

    address public immutable usdc;
    uint256 public nextId = 1;
    uint256 private status = 1;

    enum State { Funded, Delivered, Disputed, Released, Refunded, Unclaimed }

    struct Milestone {
        uint128 amount;
        uint64 dueAt;
        uint64 deliveredAt;
        uint64 stateAt;
        State state;
    }

    struct Agreement {
        address payer;
        address payee;
        address arbiter;
        bool accepted;
        bool cancelled;
        uint64 createdAt;
        uint64 createdBlock;
        uint64 acceptBy;
        uint64 autoReleaseAfter;
        uint32 milestoneCount;
        uint256 total;
        bytes32 termsHash;
    }

    /// @dev A timed-out split can leave two independent unpaid shares. Each party
    /// can claim its own share without waiting for the other party.
    struct PendingPayout {
        uint128 payeeAmount;
        uint128 payerAmount;
    }

    mapping(uint256 => Agreement) private agreements;
    mapping(uint256 => mapping(uint256 => Milestone)) private milestones;
    mapping(address => uint256[]) private userIds;
    mapping(uint256 => mapping(uint256 => address)) private _owedTo;
    mapping(uint256 => mapping(uint256 => PendingPayout)) private pendingPayouts;

    error ZeroAddress();
    error InvalidPayee();
    error InvalidArbiter();
    error InvalidMilestones();
    error ZeroAmount();
    error InvalidDeadline();
    error InvalidAutoRelease();
    error TermsTooLong();
    error NotFound();
    error InvalidIndex();
    error Unauthorized();
    error InvalidState();
    error AcceptanceExpired();
    error TooEarly();
    error NoArbiter();
    error Reentrancy();
    error TokenTransferFailed();
    error TokenBalanceFailed();
    error IncorrectDeposit();
    error LateDelivery();

    event AgreementCreated(uint256 indexed id, address indexed payer, address indexed payee, address arbiter, uint256 total, uint256 milestoneCount, bytes32 termsHash, string terms);
    event AgreementAccepted(uint256 indexed id, address indexed payee);
    /// @notice refunded includes refunds reserved for pull claims if a payout failed.
    event AgreementCancelled(uint256 indexed id, address indexed by, uint256 refunded);
    event MilestoneDelivered(uint256 indexed id, uint256 indexed index);
    event MilestoneDisputed(uint256 indexed id, uint256 indexed index, address indexed by);
    /// @notice Release reasons: 0 approved by payer, 1 auto-release, 2 arbiter, 4 claimed.
    event MilestoneReleased(uint256 indexed id, uint256 indexed index, address indexed to, uint256 amount, uint8 reason);
    /// @notice Refund reasons: 0 payee, 1 payer after deadline, 2 arbiter, 3 cancelled,
    /// 4 claimed after a failed payout, 5 recovered after the payee never claimed.
    event MilestoneRefunded(uint256 indexed id, uint256 indexed index, address indexed to, uint256 amount, uint8 reason);
    /// @notice A dispute was split; any failed share is separately reported Unclaimed.
    event MilestoneSettled(uint256 indexed id, uint256 indexed index, uint256 payeeAmount, uint256 payerAmount);
    event MilestoneUnclaimed(uint256 indexed id, uint256 indexed index, address indexed to, uint256 amount);

    /// @dev Serializes all state-changing external entry points.
    modifier nonReentrant() {
        if (status != 1) revert Reentrancy();
        status = 2;
        _;
        status = 1;
    }

    /// @notice Sets the sole ERC-20 used for escrow, normally USDC.
    constructor(address _usdc) {
        if (_usdc == address(0)) revert ZeroAddress();
        usdc = _usdc;
    }

    /// @notice Creates and fully funds an agreement; zero acceptBy starts accepted.
    function create(
        address payee,
        address arbiter,
        uint128[] calldata amounts,
        uint64[] calldata dueAts,
        uint64 acceptBy,
        uint64 autoReleaseAfter,
        string calldata terms
    ) external nonReentrant returns (uint256 id) {
        if (payee == address(0) || payee == msg.sender || payee == address(this)) revert InvalidPayee();
        if (arbiter == msg.sender || arbiter == payee || arbiter == address(this)) revert InvalidArbiter();
        if (acceptBy != 0 && acceptBy <= block.timestamp) revert InvalidDeadline();
        if (autoReleaseAfter != 0 && (autoReleaseAfter < MIN_AUTO_RELEASE || autoReleaseAfter > MAX_AUTO_RELEASE)) {
            revert InvalidAutoRelease();
        }
        if (bytes(terms).length > MAX_TERMS_BYTES) revert TermsTooLong();

        id = nextId++;
        Agreement storage a = agreements[id];
        a.payer = msg.sender;
        a.payee = payee;
        a.arbiter = arbiter;
        a.accepted = acceptBy == 0;
        a.createdAt = uint64(block.timestamp);
        a.createdBlock = uint64(block.number);
        a.acceptBy = acceptBy;
        a.autoReleaseAfter = autoReleaseAfter;
        a.total = _storeMilestones(id, amounts, dueAts);
        a.milestoneCount = uint32(amounts.length);
        a.termsHash = keccak256(bytes(terms));
        userIds[msg.sender].push(id);
        userIds[payee].push(id);

        _fund(id);
        _emitCreated(id, terms);
    }

    /// @notice Accepts an agreement through its acceptance deadline, inclusive.
    function accept(uint256 id) external nonReentrant {
        Agreement storage a = _agreement(id);
        if (msg.sender != a.payee) revert Unauthorized();
        if (a.accepted || a.cancelled) revert InvalidState();
        if (a.acceptBy != 0 && block.timestamp > a.acceptBy) revert AcceptanceExpired();
        a.accepted = true;
        emit AgreementAccepted(id, msg.sender);
    }

    /// @notice Either party can cancel before acceptance and refund remaining funds.
    /// @dev Previously waived or reserved refunds are not paid twice. Individual
    /// payout failures reserve a payer claim without blocking other refunds.
    function decline(uint256 id) external nonReentrant {
        Agreement storage a = _agreement(id);
        if (msg.sender != a.payer && msg.sender != a.payee) revert Unauthorized();
        if (a.accepted || a.cancelled) revert InvalidState();
        a.cancelled = true;
        uint256 refunded;
        for (uint256 i; i < a.milestoneCount; ++i) {
            Milestone storage m = milestones[id][i];
            if (m.state == State.Refunded) continue;
            if (m.state == State.Unclaimed && _owedTo[id][i] == a.payer) continue;
            if (m.state != State.Funded) revert InvalidState();
            refunded += m.amount;
            _refund(id, i, a, m, 3);
        }
        emit AgreementCancelled(id, msg.sender, refunded);
    }

    /// @notice The payee marks a funded milestone delivered, starting its timer.
    /// @dev Delivery is allowed through dueAt, inclusive, but never after it.
    function markDelivered(uint256 id, uint256 index) external nonReentrant {
        Agreement storage a = _agreement(id);
        if (msg.sender != a.payee) revert Unauthorized();
        if (!a.accepted || a.cancelled) revert InvalidState();
        Milestone storage m = _milestone(id, index, a.milestoneCount);
        if (m.state != State.Funded) revert InvalidState();
        if (m.dueAt != 0 && block.timestamp > m.dueAt) revert LateDelivery();
        m.state = State.Delivered;
        m.deliveredAt = uint64(block.timestamp);
        emit MilestoneDelivered(id, index);
    }

    /// @notice The payer approves funded, delivered, or disputed funds (reason 0).
    /// @dev Accepting delivery during a dispute ends it without arbiter action.
    function approve(uint256 id, uint256 index) external nonReentrant {
        Agreement storage a = _agreement(id);
        if (msg.sender != a.payer) revert Unauthorized();
        if (!a.accepted) revert InvalidState();
        Milestone storage m = _milestone(id, index, a.milestoneCount);
        if (m.state != State.Funded && m.state != State.Delivered && m.state != State.Disputed) revert InvalidState();
        _release(id, index, a, m, 0);
    }

    /// @notice Anyone can release a delivered milestone after its timer (reason 1).
    function autoRelease(uint256 id, uint256 index) external nonReentrant {
        Agreement storage a = _agreement(id);
        Milestone storage m = _milestone(id, index, a.milestoneCount);
        if (m.state != State.Delivered || a.autoReleaseAfter == 0) revert InvalidState();
        if (block.timestamp < uint256(m.deliveredAt) + a.autoReleaseAfter) revert TooEarly();
        _release(id, index, a, m, 1);
    }

    /// @notice Either party can dispute a delivered milestone if an arbiter exists.
    function dispute(uint256 id, uint256 index) external nonReentrant {
        Agreement storage a = _agreement(id);
        if (msg.sender != a.payer && msg.sender != a.payee) revert Unauthorized();
        if (a.arbiter == address(0)) revert NoArbiter();
        Milestone storage m = _milestone(id, index, a.milestoneCount);
        if (m.state != State.Delivered) revert InvalidState();
        m.state = State.Disputed;
        m.stateAt = uint64(block.timestamp);
        emit MilestoneDisputed(id, index, msg.sender);
    }

    /// @notice Only the arbiter resolves a disputed milestone (release/refund reason 2).
    function resolve(uint256 id, uint256 index, bool toPayee) external nonReentrant {
        Agreement storage a = _agreement(id);
        if (msg.sender != a.arbiter) revert Unauthorized();
        Milestone storage m = _milestone(id, index, a.milestoneCount);
        if (m.state != State.Disputed) revert InvalidState();
        if (toPayee) _release(id, index, a, m, 2);
        else _refund(id, index, a, m, 2);
    }

    /// @notice Fallback when the arbiter never resolves: either party can split
    /// a dispute after DISPUTE_TIMEOUT; any odd smallest unit goes to the payee.
    /// @dev Successful settlement ends Released. Failed shares remain Unclaimed
    /// independently; MilestoneSettled reports allocations, not guaranteed transfers.
    function settleExpiredDispute(uint256 id, uint256 index) external nonReentrant {
        Agreement storage a = _agreement(id);
        if (msg.sender != a.payer && msg.sender != a.payee) revert Unauthorized();
        Milestone storage m = _milestone(id, index, a.milestoneCount);
        if (m.state != State.Disputed) revert InvalidState();
        if (block.timestamp < uint256(m.stateAt) + DISPUTE_TIMEOUT) revert TooEarly();
        uint256 payerShare = uint256(m.amount) / 2;
        uint256 payeeShare = uint256(m.amount) - payerShare;
        // Both interactions use Released as the successful settlement state.
        // Reason 0 is unused here: settlement emits its own allocation event.
        _payout(id, index, true, payeeShare, 0, true);
        _payout(id, index, false, payerShare, 0, true);
        emit MilestoneSettled(id, index, payeeShare, payerShare);
    }

    /// @notice The payee can waive funded/delivered/disputed funds (reason 0); an
    /// accepted, overdue, still-funded milestone is reclaimable by the payer (reason 1).
    function refund(uint256 id, uint256 index) external nonReentrant {
        Agreement storage a = _agreement(id);
        Milestone storage m = _milestone(id, index, a.milestoneCount);
        if (msg.sender == a.payee) {
            if (m.state != State.Funded && m.state != State.Delivered && m.state != State.Disputed) revert InvalidState();
            _refund(id, index, a, m, 0);
        } else if (msg.sender == a.payer) {
            if (!a.accepted || m.state != State.Funded) revert InvalidState();
            if (m.dueAt == 0 || block.timestamp <= m.dueAt) revert TooEarly();
            _refund(id, index, a, m, 1);
        } else {
            revert Unauthorized();
        }
    }

    /// @notice Claims only the caller's own unpaid share, independently of the other party.
    /// @dev Requires a non-zero pending share and clears it before transferring;
    /// a failed transfer reverts all changes. State remains Unclaimed, preserving
    /// the recovery timestamp, until both shares are zero. The last claimant sets
    /// Released for the payee or Refunded for the payer; each claim emits reason 4.
    function claim(uint256 id, uint256 index) external nonReentrant {
        Agreement storage a = _agreement(id);
        Milestone storage m = _milestone(id, index, a.milestoneCount);
        if (m.state != State.Unclaimed) revert InvalidState();
        bool toPayee = msg.sender == a.payee;
        PendingPayout storage p = pendingPayouts[id][index];
        if (!toPayee && msg.sender != a.payer) revert Unauthorized();
        uint256 amount = toPayee ? p.payeeAmount : p.payerAmount;
        if (amount == 0) revert Unauthorized();
        if (toPayee) p.payeeAmount = 0;
        else p.payerAmount = 0;
        if (p.payeeAmount == 0 && p.payerAmount == 0) {
            m.state = toPayee ? State.Released : State.Refunded;
        }
        _syncUnclaimed(id, index);
        _transfer(msg.sender, amount);
        if (toPayee) emit MilestoneReleased(id, index, msg.sender, amount, 4);
        else emit MilestoneRefunded(id, index, msg.sender, amount, 4);
    }

    /// @notice Only the payer can recover a payee share unclaimed for RECOVERY_DELAY.
    /// @dev Requires a non-zero payee share and stateAt + RECOVERY_DELAY to elapse.
    /// Clears and transfers only the payee share; a failed transfer reverts all changes.
    /// Any payer share remains independently claimable and keeps state Unclaimed.
    function recoverUnclaimed(uint256 id, uint256 index) external nonReentrant {
        Agreement storage a = _agreement(id);
        if (msg.sender != a.payer) revert Unauthorized();
        Milestone storage m = _milestone(id, index, a.milestoneCount);
        PendingPayout storage p = pendingPayouts[id][index];
        uint256 amount = p.payeeAmount;
        if (m.state != State.Unclaimed || amount == 0) revert InvalidState();
        if (block.timestamp < uint256(m.stateAt) + RECOVERY_DELAY) revert TooEarly();
        p.payeeAmount = 0;
        if (p.payerAmount == 0) m.state = State.Refunded;
        _syncUnclaimed(id, index);
        _transfer(a.payer, amount);
        emit MilestoneRefunded(id, index, a.payer, amount, 5);
    }

    /// @notice Returns the payee if its share is pending, otherwise the payer if
    /// its share is pending, otherwise zero.
    /// @dev This payee-first view does not restrict either party's independent claim.
    function owedTo(uint256 id, uint256 index) external view returns (address) {
        return _owedTo[id][index];
    }

    /// @notice Returns agreement details, or a zero struct for an unknown id.
    function getAgreement(uint256 id) external view returns (Agreement memory) {
        return agreements[id];
    }

    /// @notice Returns all milestones, or an empty array for an unknown id.
    function getMilestones(uint256 id) external view returns (Milestone[] memory result) {
        uint256 count = agreements[id].milestoneCount;
        result = new Milestone[](count);
        for (uint256 i; i < count; ++i) result[i] = milestones[id][i];
    }

    /// @notice Returns ids where the address was payer or payee at creation.
    function idsOf(address user) external view returns (uint256[] memory) {
        return userIds[user];
    }

    /// @dev Validates and records funded milestones, returning their total.
    function _storeMilestones(uint256 id, uint128[] calldata amounts, uint64[] calldata dueAts)
        private returns (uint256 total)
    {
        if (amounts.length == 0 || amounts.length > MAX_MILESTONES || amounts.length != dueAts.length) {
            revert InvalidMilestones();
        }
        for (uint256 i; i < amounts.length; ++i) {
            if (amounts[i] == 0) revert ZeroAmount();
            if (dueAts[i] != 0 && dueAts[i] <= block.timestamp) revert InvalidDeadline();
            total += amounts[i];
            milestones[id][i] = Milestone(amounts[i], dueAts[i], 0, 0, State.Funded);
        }
    }

    /// @dev Pulls the exact total; every state effect is reverted if funding fails.
    function _fund(uint256 id) private {
        Agreement storage a = agreements[id];
        uint256 beforeBalance = _balance();
        _callToken(abi.encodeWithSelector(bytes4(0x23b872dd), a.payer, address(this), a.total));
        uint256 afterBalance = _balance();
        if (afterBalance < beforeBalance || afterBalance - beforeBalance != a.total) revert IncorrectDeposit();
    }

    /// @dev Emits the original terms without storing their plaintext.
    function _emitCreated(uint256 id, string calldata terms) private {
        Agreement storage a = agreements[id];
        emit AgreementCreated(id, a.payer, a.payee, a.arbiter, a.total, a.milestoneCount, a.termsHash, terms);
    }

    /// @dev Requires an existing agreement for all mutating entry points.
    function _agreement(uint256 id) private view returns (Agreement storage a) {
        a = agreements[id];
        if (a.payer == address(0)) revert NotFound();
    }

    /// @dev Bounds checks indices; default enum values do not imply funded funds.
    function _milestone(uint256 id, uint256 index, uint256 count) private view returns (Milestone storage m) {
        if (index >= count) revert InvalidIndex();
        m = milestones[id][index];
    }

    /// @dev Releases the full milestone, reserving a pull claim on transfer failure.
    function _release(uint256 id, uint256 index, Agreement storage a, Milestone storage m, uint8 reason) private {
        _payout(id, index, true, m.amount, reason, false);
    }

    /// @dev Refunds the full milestone, reserving a pull claim on transfer failure.
    function _refund(uint256 id, uint256 index, Agreement storage a, Milestone storage m, uint8 reason) private {
        _payout(id, index, false, m.amount, reason, false);
    }

    /// @dev Sets state before interacting. Failed transfers never deliberately
    /// revert: each unpaid share is reserved once without changing original amount.
    /// Settlement emits MilestoneSettled instead of assigning a release/refund reason.
    function _payout(uint256 id, uint256 index, bool toPayee, uint256 amount, uint8 reason, bool settlement) private {
        Agreement storage a = agreements[id];
        Milestone storage m = milestones[id][index];
        address to = toPayee ? a.payee : a.payer;
        m.state = (toPayee || settlement) ? State.Released : State.Refunded;
        // Preserve an earlier failed share when attempting the second split share.
        _syncUnclaimed(id, index);
        if (amount == 0) return;
        if (!_tryTransfer(to, amount)) {
            PendingPayout storage p = pendingPayouts[id][index];
            if (toPayee) p.payeeAmount += uint128(amount);
            else p.payerAmount += uint128(amount);
            m.state = State.Unclaimed;
            m.stateAt = uint64(block.timestamp);
            _syncUnclaimed(id, index);
            emit MilestoneUnclaimed(id, index, to, amount);
        } else if (!settlement) {
            if (toPayee) emit MilestoneReleased(id, index, to, amount, reason);
            else emit MilestoneRefunded(id, index, to, amount, reason);
        }
    }

    /// @dev Maintains the payee-first owedTo view and Unclaimed state without
    /// erasing either unpaid share or resetting an existing Unclaimed timestamp.
    function _syncUnclaimed(uint256 id, uint256 index) private {
        PendingPayout storage p = pendingPayouts[id][index];
        if (p.payeeAmount != 0 || p.payerAmount != 0) {
            Milestone storage m = milestones[id][index];
            if (m.state != State.Unclaimed) m.stateAt = uint64(block.timestamp);
            m.state = State.Unclaimed;
            Agreement storage a = agreements[id];
            _owedTo[id][index] = p.payeeAmount != 0 ? a.payee : a.payer;
        } else {
            delete _owedTo[id][index];
        }
    }

    /// @dev Attempts only the configured USDC's transfer selector. Short, false,
    /// malformed, and reverted responses all use the pull fallback, without decode
    /// reverts. Returndata copying is bounded to one word even on token failure.
    function _tryTransfer(address to, uint256 amount) private returns (bool ok) {
        bytes memory data = abi.encodeWithSelector(bytes4(0xa9059cbb), to, amount);
        address token = usdc;
        assembly ("memory-safe") {
            let result := mload(0x40)
            mstore(result, 0)
            ok := call(gas(), token, 0, add(data, 32), mload(data), result, 32)
            if ok {
                switch returndatasize()
                case 0 { }
                default { ok := and(iszero(lt(returndatasize(), 32)), eq(mload(result), 1)) }
            }
        }
    }

    /// @dev Claims and recovery must revert if the configured USDC cannot transfer.
    function _transfer(address to, uint256 amount) private {
        if (!_tryTransfer(to, amount)) revert TokenTransferFailed();
    }

    /// @dev Requires call success and either no return data or an ABI-encoded true.
    function _callToken(bytes memory data) private {
        (bool success, bytes memory result) = usdc.call(data);
        if (!success) revert TokenTransferFailed();
        if (result.length != 0) {
            if (result.length < 32) revert TokenTransferFailed();
            if (abi.decode(result, (uint256)) != 1) revert TokenTransferFailed();
        }
    }

    /// @dev Reads balanceOf via staticcall; balances must return a uint256 value.
    function _balance() private view returns (uint256) {
        (bool success, bytes memory result) = usdc.staticcall(
            abi.encodeWithSelector(bytes4(0x70a08231), address(this))
        );
        if (!success || result.length < 32) revert TokenBalanceFailed();
        return abi.decode(result, (uint256));
    }
}
