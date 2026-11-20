// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title TrustoraPay
/// @notice Stateless, pass-through native and ERC-20 payments with no owner or fees.
/// @dev No custody or stored state: native payments are forwarded in full and tokens
/// move directly from sender to recipient. No receive or fallback accepts stray transfers.
contract TrustoraPay {
    uint256 public constant MAX_NOTE_BYTES = 280;

    error ZeroRecipient();
    error SelfRecipient();
    error ZeroAmount();
    error NoteTooLong();
    error NativeTransferFailed();
    error InvalidToken();
    error TokenTransferFailed();

    event PaymentSent(
        address indexed sender,
        address indexed recipient,
        address indexed token,
        uint256 amount,
        string note,
        uint256 timestamp
    );

    // No reentrancy guard is needed: there is no state and payments only pass through.
    // Native forwarding happens before the event; nothing is trusted afterwards.
    function sendNative(address payable recipient, string calldata note) external payable {
        if (recipient == address(0)) revert ZeroRecipient();
        if (recipient == address(this)) revert SelfRecipient();
        if (msg.value == 0) revert ZeroAmount();
        if (bytes(note).length > MAX_NOTE_BYTES) revert NoteTooLong();

        // On Arc, msg.value is the 18-decimal native USDC view; no conversion is needed.
        (bool success, ) = recipient.call{value: msg.value}("");
        if (!success) revert NativeTransferFailed();

        emit PaymentSent(msg.sender, recipient, address(0), msg.value, note, block.timestamp);
    }

    function sendToken(address token, address recipient, uint256 amount, string calldata note) external {
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
}
