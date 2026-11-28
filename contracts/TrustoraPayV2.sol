// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title TrustoraPayV2
/// @notice Direct native and ERC-20 payments plus Protected USDC Escrow, with no owner or fees.
/// @dev Direct payments pass through in full. Escrowed tokens are held only while an
/// escrow is Active, and funds move only by the release, expiry-claim, and refund rules below.
/// Before releaseTime, only the sender may release to the recipient or refund.
/// From releaseTime until releaseTime + 180 days (exclusive), only the recipient may claim,
/// optionally redirected; the sender may still release to the recipient.
/// From releaseTime + 180 days (inclusive), only the sender may recover; recipient claims close.
/// The sender may release to the recipient at any time while the escrow is Active.
/// Assumption: refundEscrow permits the sender to refund an Active escrow only before
/// releaseTime, supplementing the originally truncated claim specification.
/// No owner, admin, pause, receive, or fallback is provided.
contract TrustoraPayV2 {
    uint256 public constant MAX_NOTE_BYTES = 280;
    uint256 public constant MIN_DURATION_HOURS = 1;
    uint256 public constant MAX_DURATION_HOURS = 8760;
    uint256 public constant RECOVERY_DELAY = 180 days;

    enum EscrowStatus { Active, Released, Refunded }

    struct Escrow {
        uint256 escrowId;
        address sender;
        address recipient;
        address tokenAddress;
        uint256 amount;
        uint256 releaseTime;
        string memo;
        EscrowStatus status;
    }

    uint256 public nextEscrowId = 1;
    mapping(uint256 => Escrow) private _escrows;
    mapping(address => uint256[]) private _idsByUser;
    uint256 private _guard = 1;

    error ZeroRecipient();
    error SelfRecipient();
    error ZeroAmount();
    error NoteTooLong();
    error NativeTransferFailed();
    error InvalidToken();
    error TokenTransferFailed();
    error IncorrectDeposit();
    error InvalidDuration();
    error EscrowNotFound();
    error NotSender();
    error NotRecipient();
    error NotActive();
    error NotYetClaimable();
    error ClaimWindowClosed();
    error RefundWindowClosed();
    error RecoveryNotReady();
    error Reentrancy();

    event PaymentSent(
        address indexed sender,
        address indexed recipient,
        address indexed token,
        uint256 amount,
        string note,
        uint256 timestamp
    );

    event EscrowCreated(
        uint256 indexed escrowId,
        address indexed sender,
        address indexed recipient,
        address tokenAddress,
        uint256 amount,
        uint256 releaseTime,
        string memo
    );
    event EscrowReleased(uint256 indexed escrowId, address indexed sender, address indexed recipient, uint256 amount);
    event EscrowClaimed(uint256 indexed escrowId, address indexed recipient, uint256 amount);
    event EscrowPayoutRedirected(uint256 indexed escrowId, address indexed to);
    event EscrowRefunded(uint256 indexed escrowId, address indexed sender, uint256 amount);

    modifier nonReentrant() {
        if (_guard != 1) revert Reentrancy();
        _guard = 2;
        _;
        _guard = 1;
    }

    function sendNative(address payable recipient, string calldata note) external payable nonReentrant {
        if (recipient == address(0)) revert ZeroRecipient();
        if (recipient == address(this)) revert SelfRecipient();
        if (msg.value == 0) revert ZeroAmount();
        if (bytes(note).length > MAX_NOTE_BYTES) revert NoteTooLong();

        // On Arc, msg.value is the 18-decimal native USDC view; no conversion is needed.
        (bool success, ) = recipient.call{value: msg.value}("");
        if (!success) revert NativeTransferFailed();

        emit PaymentSent(msg.sender, recipient, address(0), msg.value, note, block.timestamp);
    }

    function sendToken(address token, address recipient, uint256 amount, string calldata note) external nonReentrant {
        if (token == address(0) || token.code.length == 0) revert InvalidToken();
        if (recipient == address(0)) revert ZeroRecipient();
        if (recipient == address(this)) revert SelfRecipient();
        if (amount == 0) revert ZeroAmount();
        if (bytes(note).length > MAX_NOTE_BYTES) revert NoteTooLong();

        (bool success, bytes memory returndata) = token.call(
            abi.encodeWithSelector(bytes4(0x23b872dd), msg.sender, recipient, amount)
        );
        if (!success || (returndata.length != 0 && !abi.decode(returndata, (bool)))) {
            revert TokenTransferFailed();
        }

        emit PaymentSent(msg.sender, recipient, token, amount, note, block.timestamp);
    }

    function createEscrow(
        address recipient,
        address token,
        uint256 amount,
        uint256 durationInHours,
        string calldata memo
    ) external nonReentrant returns (uint256 escrowId) {
        if (recipient == address(0)) revert ZeroRecipient();
        if (recipient == msg.sender || recipient == address(this)) revert SelfRecipient();
        if (token == address(0) || token.code.length == 0) revert InvalidToken();
        if (amount == 0) revert ZeroAmount();
        if (durationInHours < MIN_DURATION_HOURS || durationInHours > MAX_DURATION_HOURS) {
            revert InvalidDuration();
        }
        if (bytes(memo).length > MAX_NOTE_BYTES) revert NoteTooLong();

        uint256 releaseTime = block.timestamp + durationInHours * 1 hours;
        escrowId = nextEscrowId++;
        _escrows[escrowId] = Escrow({
            escrowId: escrowId,
            sender: msg.sender,
            recipient: recipient,
            tokenAddress: token,
            amount: amount,
            releaseTime: releaseTime,
            memo: memo,
            status: EscrowStatus.Active
        });
        _idsByUser[msg.sender].push(escrowId);
        _idsByUser[recipient].push(escrowId);

        uint256 beforeBalance = _tokenBalance(token);
        _callToken(token, abi.encodeWithSelector(bytes4(0x23b872dd), msg.sender, address(this), amount));
        uint256 afterBalance = _tokenBalance(token);
        if (afterBalance < beforeBalance || afterBalance - beforeBalance != amount) revert IncorrectDeposit();

        emit EscrowCreated(escrowId, msg.sender, recipient, token, amount, releaseTime, memo);
    }

    function releaseEscrow(uint256 escrowId) external nonReentrant {
        Escrow storage escrow = _escrow(escrowId);
        if (msg.sender != escrow.sender) revert NotSender();
        if (escrow.status != EscrowStatus.Active) revert NotActive();
        escrow.status = EscrowStatus.Released;
        _callToken(escrow.tokenAddress, abi.encodeWithSelector(bytes4(0xa9059cbb), escrow.recipient, escrow.amount));
        emit EscrowReleased(escrowId, escrow.sender, escrow.recipient, escrow.amount);
    }

    /// @notice Only the recipient may claim from releaseTime until releaseTime + 180 days (exclusive).
    function claimExpiredEscrow(uint256 escrowId) external nonReentrant {
        _claimExpiredEscrow(escrowId, _escrow(escrowId).recipient);
    }

    /// @notice Only the recipient may redirect a claim from releaseTime until releaseTime + 180 days (exclusive).
    function claimExpiredEscrowTo(uint256 escrowId, address to) external nonReentrant {
        _claimExpiredEscrow(escrowId, to);
    }

    function _claimExpiredEscrow(uint256 escrowId, address to) internal {
        Escrow storage escrow = _escrow(escrowId);
        if (msg.sender != escrow.recipient) revert NotRecipient();
        if (escrow.status != EscrowStatus.Active) revert NotActive();
        if (block.timestamp < escrow.releaseTime) revert NotYetClaimable();
        if (block.timestamp >= escrow.releaseTime + RECOVERY_DELAY) revert ClaimWindowClosed();
        if (to == address(0)) revert ZeroRecipient();
        if (to == address(this)) revert SelfRecipient();
        escrow.status = EscrowStatus.Released;
        _callToken(escrow.tokenAddress, abi.encodeWithSelector(bytes4(0xa9059cbb), to, escrow.amount));
        emit EscrowClaimed(escrowId, escrow.recipient, escrow.amount);
        if (to != escrow.recipient) emit EscrowPayoutRedirected(escrowId, to);
    }

    /// @notice Only the sender may recover an Active escrow from releaseTime + 180 days (inclusive).
    /// @dev Recipient claims close exactly when recovery opens. Before releaseTime the sender
    /// may release or refund; from releaseTime until recovery opens only the recipient may claim,
    /// optionally redirected. The sender may still release to the recipient at any time while Active.
    function recoverUnclaimedEscrow(uint256 escrowId) external nonReentrant {
        Escrow storage escrow = _escrow(escrowId);
        if (msg.sender != escrow.sender) revert NotSender();
        if (escrow.status != EscrowStatus.Active) revert NotActive();
        if (block.timestamp < escrow.releaseTime + RECOVERY_DELAY) revert RecoveryNotReady();
        escrow.status = EscrowStatus.Refunded;
        _callToken(escrow.tokenAddress, abi.encodeWithSelector(bytes4(0xa9059cbb), escrow.sender, escrow.amount));
        emit EscrowRefunded(escrowId, escrow.sender, escrow.amount);
    }

    /// @dev Assumed refund rule: only the sender may refund, strictly before releaseTime.
    function refundEscrow(uint256 escrowId) external nonReentrant {
        Escrow storage escrow = _escrow(escrowId);
        if (msg.sender != escrow.sender) revert NotSender();
        if (escrow.status != EscrowStatus.Active) revert NotActive();
        if (block.timestamp >= escrow.releaseTime) revert RefundWindowClosed();
        escrow.status = EscrowStatus.Refunded;
        _callToken(escrow.tokenAddress, abi.encodeWithSelector(bytes4(0xa9059cbb), escrow.sender, escrow.amount));
        emit EscrowRefunded(escrowId, escrow.sender, escrow.amount);
    }

    function getEscrow(uint256 escrowId) external view returns (Escrow memory) {
        return _escrow(escrowId);
    }

    function escrowIdsOf(address user) external view returns (uint256[] memory) {
        return _idsByUser[user];
    }

    function _escrow(uint256 escrowId) private view returns (Escrow storage escrow) {
        escrow = _escrows[escrowId];
        if (escrow.sender == address(0)) revert EscrowNotFound();
    }

    function _callToken(address token, bytes memory data) private {
        if (token.code.length == 0) revert InvalidToken();
        (bool success, bytes memory returndata) = token.call(data);
        if (!success) revert TokenTransferFailed();
        if (returndata.length != 0) {
            if (returndata.length < 32) revert TokenTransferFailed();
            if (abi.decode(returndata, (uint256)) != 1) revert TokenTransferFailed();
        }
    }

    function _tokenBalance(address token) private view returns (uint256) {
        (bool success, bytes memory returndata) = token.staticcall(
            abi.encodeWithSelector(bytes4(0x70a08231), address(this))
        );
        if (!success || returndata.length < 32) revert TokenTransferFailed();
        return abi.decode(returndata, (uint256));
    }
}
