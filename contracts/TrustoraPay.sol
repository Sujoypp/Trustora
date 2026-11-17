// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
}

contract TrustoraPay {
    event PaymentSent(
        address indexed sender,
        address indexed recipient,
        address indexed token,
        uint256 amount,
        string note,
        uint256 timestamp
    );

    event PaymentFailed(
        address indexed sender,
        address indexed recipient,
        address indexed token,
        uint256 amount,
        string note,
        uint256 timestamp
    );

    // Refunds that could not be delivered directly to the sender.
    mapping(address => uint256) public refunds;

    event RefundCredited(address indexed account, uint256 amount);
    event RefundClaimed(address indexed account, address indexed to, uint256 amount);

    // Send Native Token (e.g., ETH / Arc Native)
    function sendNative(address payable _recipient, string calldata _note) external payable {
        require(_recipient != address(0), "Invalid recipient");
        require(msg.value > 0, "Amount must be greater than 0");

        (bool sent, ) = _recipient.call{value: msg.value}("");
        require(sent, "Native transfer failed");

        emit PaymentSent(msg.sender, _recipient, address(0), msg.value, _note, block.timestamp);
    }

    // Send ERC-20 Token (e.g., Testnet USDC)
    function sendToken(address _token, address _recipient, uint256 _amount, string calldata _note) external {
        require(_recipient != address(0), "Invalid recipient");
        require(_amount > 0, "Amount must be greater than 0");

        bool success = IERC20(_token).transferFrom(msg.sender, _recipient, _amount);
        require(success, "Token transfer failed");

        emit PaymentSent(msg.sender, _recipient, _token, _amount, _note, block.timestamp);
    }

    /// @notice Maximum number of recipients in a batch payment.
    uint256 public constant MAX_BATCH = 50;

    /// @notice Gas forwarded to each recipient in a native batch, so one recipient cannot exhaust the batch
    ///         (the failed entry is reported and refunded instead).
    uint256 public constant BATCH_RECIPIENT_GAS = 100_000;

    /// @notice Send native tokens to multiple recipients on a best-effort basis.
    /// @dev Read PaymentFailed events for skipped recipients. Failed amounts are refunded
    /// to the sender; a failed refund is credited for later claiming.
    function sendNativeBatch(
        address payable[] calldata _recipients,
        uint256[] calldata _amounts,
        string[] calldata _notes
    ) external payable {
        uint256 length = _recipients.length;
        require(length > 0, "Empty batch");
        require(length == _amounts.length && length == _notes.length, "Array length mismatch");
        require(length <= MAX_BATCH, "Batch too large");

        // Validate all payments and the exact total before transferring funds.
        uint256 total;
        for (uint256 i = 0; i < length; i++) {
            require(_recipients[i] != address(0), "Invalid recipient");
            require(_amounts[i] > 0, "Amount must be greater than 0");
            total += _amounts[i];
        }
        require(total == msg.value, "Native amount mismatch");

        uint256 refund;
        for (uint256 i = 0; i < length; i++) {
            (bool sent, ) = _recipients[i].call{value: _amounts[i], gas: BATCH_RECIPIENT_GAS}("");
            if (sent) {
                emit PaymentSent(msg.sender, _recipients[i], address(0), _amounts[i], _notes[i], block.timestamp);
            } else {
                emit PaymentFailed(msg.sender, _recipients[i], address(0), _amounts[i], _notes[i], block.timestamp);
                refund += _amounts[i];
            }
        }

        if (refund > 0) {
            // Capped gas leaves enough to record the credit if the sender's receive logic fails or burns gas.
            (bool refunded, ) = msg.sender.call{value: refund, gas: BATCH_RECIPIENT_GAS}("");
            if (!refunded) {
                // Preserve successful payments if the sender rejects the refund.
                refunds[msg.sender] += refund;
                emit RefundCredited(msg.sender, refund);
            }
        }
    }

    /// @notice Claim a credited refund to a recipient that can receive native tokens.
    function claimRefund(address payable _to) external {
        uint256 amount = refunds[msg.sender];
        require(amount > 0, "Nothing to claim");
        require(_to != address(0), "Invalid recipient");

        // Clear the credit before transferring to prevent duplicate claims.
        refunds[msg.sender] = 0;
        (bool sent, ) = _to.call{value: amount}("");
        require(sent, "Native refund failed");

        emit RefundClaimed(msg.sender, _to, amount);
    }

    /// @notice Transfer approved ERC-20 tokens to multiple recipients on a best-effort basis.
    /// @dev Read PaymentFailed events for skipped recipients when a transfer returns false or reverts.
    function sendTokenBatch(
        address _token,
        address[] calldata _recipients,
        uint256[] calldata _amounts,
        string[] calldata _notes
    ) external {
        uint256 length = _recipients.length;
        require(length > 0, "Empty batch");
        require(length == _amounts.length && length == _notes.length, "Array length mismatch");
        require(length <= MAX_BATCH, "Batch too large");

        // Validate every payment before the first token call.
        for (uint256 i = 0; i < length; i++) {
            require(_recipients[i] != address(0), "Invalid recipient");
            require(_amounts[i] > 0, "Amount must be greater than 0");
        }

        for (uint256 i = 0; i < length; i++) {
            try IERC20(_token).transferFrom(msg.sender, _recipients[i], _amounts[i]) returns (bool ok) {
                if (ok) {
                    emit PaymentSent(msg.sender, _recipients[i], _token, _amounts[i], _notes[i], block.timestamp);
                } else {
                    emit PaymentFailed(msg.sender, _recipients[i], _token, _amounts[i], _notes[i], block.timestamp);
                }
            } catch {
                emit PaymentFailed(msg.sender, _recipients[i], _token, _amounts[i], _notes[i], block.timestamp);
            }
        }
    }
}
