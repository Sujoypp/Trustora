// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title TrustoraFlows
/// @notice Non-custodial USDC invoices, split payments and recurring payments with no owner or fees.
/// @dev USDC moves directly from the payer to the recipient using the payer's allowance to this contract.
/// The contract never holds funds. Payments rely on the payer's USDC balance and allowance.
contract TrustoraFlows {
    uint256 public constant MAX_MEMO_BYTES = 280;
    uint256 public constant MAX_SPLIT_RECIPIENTS = 50;
    uint256 public constant MIN_INTERVAL = 1 hours;
    uint256 public constant MAX_INTERVAL = 365 days;
    uint256 public constant MAX_PAYMENTS = 1000;

    address public immutable usdc;
    uint256 private _guard = 1;

    enum InvoiceStatus { Open, Paid, Cancelled }

    struct Invoice {
        address issuer;
        address payer;
        uint128 amount;
        uint64 dueAt;
        uint64 createdAt;
        uint64 createdBlock;
        uint64 paidAt;
        address paidBy;
        InvoiceStatus status;
        string memo;
    }

    struct SplitRecord {
        address sender;
        uint128 total;
        uint32 count;
        uint64 createdAt;
        uint64 createdBlock;
    }

    struct Schedule {
        address payer;
        address payee;
        uint128 amount;
        uint64 interval;
        uint64 nextAt;
        uint32 remaining;
        uint32 executed;
        bool active;
        uint64 createdBlock;
        string note;
    }

    uint256 public nextInvoiceId = 1;
    uint256 public nextSplitId = 1;
    uint256 public nextScheduleId = 1;
    mapping(uint256 => Invoice) private _invoices;
    mapping(uint256 => SplitRecord) private _splits;
    mapping(uint256 => Schedule) private _schedules;
    mapping(address => uint256[]) private _invoiceIds;
    mapping(address => uint256[]) private _splitIds;
    mapping(address => uint256[]) private _scheduleIds;

    error ZeroRecipient();
    error SelfRecipient();
    error ZeroAmount();
    error NoteTooLong();
    error InvalidToken();
    error TokenTransferFailed();
    error Reentrancy();
    error NotFound();
    error Unauthorized();
    error InvalidStatus();
    error InvalidTime();
    error InvalidInterval();
    error InvalidPaymentCount();
    error InvalidArrayLength();
    error AmountOverflow();
    error ValueOverflow();

    event InvoiceCreated(uint256 indexed id, address indexed issuer, address indexed payer, uint256 amount, uint64 dueAt, string memo);
    event InvoicePaid(uint256 indexed id, address indexed issuer, address indexed paidBy, uint256 amount);
    event InvoiceCancelled(uint256 indexed id, address indexed issuer);
    event SplitPaid(uint256 indexed splitId, address indexed sender, uint256 total, uint256 count, string note);
    event SplitLeg(uint256 indexed splitId, address indexed recipient, uint256 amount);
    event ScheduleCreated(uint256 indexed id, address indexed payer, address indexed payee, uint256 amount, uint64 interval, uint64 nextAt, uint32 maxPayments, string note);
    event ScheduleExecuted(uint256 indexed id, address indexed payer, address indexed payee, uint256 amount, uint32 paymentNumber, address executedBy);
    event ScheduleCancelled(uint256 indexed id, address indexed payer);

    /// @dev Prevents nested entry into every state-changing external function.
    modifier nonReentrant() {
        if (_guard != 1) revert Reentrancy();
        _guard = 2;
        _;
        _guard = 1;
    }

    /// @notice Sets the nonzero USDC token address used by all workflows.
    /// @param _usdc Address of the intended USDC token contract.
    constructor(address _usdc) {
        if (_usdc == address(0)) revert InvalidToken();
        usdc = _usdc;
    }

    /// @notice Creates an invoice; a zero payer permits anyone other than the issuer to pay.
    /// @dev Due dates are informational: payment remains possible after the due date.
    function createInvoice(address payer, uint128 amount, uint64 dueAt, string calldata memo)
        external nonReentrant returns (uint256 id)
    {
        if (payer == msg.sender) revert SelfRecipient();
        if (amount == 0) revert ZeroAmount();
        if (dueAt != 0 && dueAt <= block.timestamp) revert InvalidTime();
        if (bytes(memo).length > MAX_MEMO_BYTES) revert NoteTooLong();
        id = nextInvoiceId++;
        _invoices[id] = Invoice({
            issuer: msg.sender,
            payer: payer,
            amount: amount,
            dueAt: dueAt,
            createdAt: _toUint64(block.timestamp),
            createdBlock: _toUint64(block.number),
            paidAt: 0,
            paidBy: address(0),
            status: InvoiceStatus.Open,
            memo: memo
        });
        _invoiceIds[msg.sender].push(id);
        if (payer != address(0)) _invoiceIds[payer].push(id);
        emit InvoiceCreated(id, msg.sender, payer, amount, dueAt, memo);
    }

    /// @notice Pays an open invoice directly to its issuer, including after its due date.
    function payInvoice(uint256 id) external nonReentrant {
        Invoice storage invoice = _invoice(id);
        if (invoice.status != InvoiceStatus.Open) revert InvalidStatus();
        if (invoice.payer != address(0) && msg.sender != invoice.payer) revert Unauthorized();
        if (msg.sender == invoice.issuer) revert SelfRecipient();
        invoice.status = InvoiceStatus.Paid;
        invoice.paidAt = _toUint64(block.timestamp);
        invoice.paidBy = msg.sender;
        _transferUSDC(msg.sender, invoice.issuer, invoice.amount);
        emit InvoicePaid(id, invoice.issuer, msg.sender, invoice.amount);
    }

    /// @notice Allows only an invoice's issuer to cancel it while open.
    function cancelInvoice(uint256 id) external nonReentrant {
        Invoice storage invoice = _invoice(id);
        if (msg.sender != invoice.issuer) revert Unauthorized();
        if (invoice.status != InvoiceStatus.Open) revert InvalidStatus();
        invoice.status = InvoiceStatus.Cancelled;
        emit InvoiceCancelled(id, msg.sender);
    }

    /// @notice Returns an existing invoice, reverting with NotFound for unknown IDs.
    function getInvoice(uint256 id) external view returns (Invoice memory) {
        return _invoice(id);
    }

    /// @notice Lists invoice IDs issued by or explicitly addressed to a user.
    function invoiceIdsOf(address user) external view returns (uint256[] memory) {
        return _invoiceIds[user];
    }

    /// @notice Atomically pays all recipients directly from the caller's wallet.
    /// @dev Duplicate recipients are allowed. The total must fit the record's uint128 field.
    function split(address[] calldata recipients, uint128[] calldata amounts, string calldata note)
        external nonReentrant returns (uint256 splitId)
    {
        uint256 count = recipients.length;
        if (count == 0 || count > MAX_SPLIT_RECIPIENTS || count != amounts.length) revert InvalidArrayLength();
        if (bytes(note).length > MAX_MEMO_BYTES) revert NoteTooLong();
        uint256 total;
        for (uint256 i; i < count; ++i) {
            if (recipients[i] == address(0)) revert ZeroRecipient();
            if (recipients[i] == address(this) || recipients[i] == msg.sender) revert SelfRecipient();
            if (amounts[i] == 0) revert ZeroAmount();
            total += amounts[i];
        }
        if (total > type(uint128).max) revert AmountOverflow();
        splitId = nextSplitId++;
        _splits[splitId] = SplitRecord({
            sender: msg.sender,
            total: uint128(total),
            count: uint32(count),
            createdAt: _toUint64(block.timestamp),
            createdBlock: _toUint64(block.number)
        });
        _splitIds[msg.sender].push(splitId);
        for (uint256 i; i < count; ++i) {
            _transferUSDC(msg.sender, recipients[i], amounts[i]);
            emit SplitLeg(splitId, recipients[i], amounts[i]);
        }
        emit SplitPaid(splitId, msg.sender, total, count, note);
    }

    /// @notice Returns a split record, reverting with NotFound for unknown IDs.
    function getSplit(uint256 id) external view returns (SplitRecord memory) {
        if (id == 0 || id >= nextSplitId) revert NotFound();
        return _splits[id];
    }

    /// @notice Lists split IDs initiated by the specified sender.
    function splitIdsOf(address sender) external view returns (uint256[] memory) {
        return _splitIds[sender];
    }

    /// @notice Creates a finite recurring authorization without moving any funds.
    /// @dev A zero firstAt means now. Execution requires the payer's USDC allowance and balance.
    function createSchedule(address payee, uint128 amount, uint64 interval, uint64 firstAt, uint32 maxPayments, string calldata note)
        external nonReentrant returns (uint256 id)
    {
        if (payee == address(0)) revert ZeroRecipient();
        if (payee == msg.sender || payee == address(this)) revert SelfRecipient();
        if (amount == 0) revert ZeroAmount();
        if (interval < MIN_INTERVAL || interval > MAX_INTERVAL) revert InvalidInterval();
        if (firstAt != 0 && firstAt < block.timestamp) revert InvalidTime();
        if (maxPayments == 0 || maxPayments > MAX_PAYMENTS) revert InvalidPaymentCount();
        if (bytes(note).length > MAX_MEMO_BYTES) revert NoteTooLong();
        uint64 nextAt = firstAt == 0 ? _toUint64(block.timestamp) : firstAt;
        // Each execution advances nextAt, including the final execution.
        _toUint64(uint256(nextAt) + uint256(interval) * maxPayments);
        id = nextScheduleId++;
        _schedules[id] = Schedule({
            payer: msg.sender,
            payee: payee,
            amount: amount,
            interval: interval,
            nextAt: nextAt,
            remaining: maxPayments,
            executed: 0,
            active: true,
            createdBlock: _toUint64(block.number),
            note: note
        });
        _scheduleIds[msg.sender].push(id);
        _scheduleIds[payee].push(id);
        emit ScheduleCreated(id, msg.sender, payee, amount, interval, nextAt, maxPayments, note);
    }

    /// @notice Allows anyone to execute one due payment from the payer directly to the payee.
    /// @dev Missed periods stay payable one call at a time, even in the same block.
    /// Failed transfers roll back all state changes; there is no automatic execution service.
    function executeSchedule(uint256 id) external nonReentrant {
        Schedule storage schedule = _schedule(id);
        if (!schedule.active || schedule.remaining == 0) revert InvalidStatus();
        if (block.timestamp < schedule.nextAt) revert InvalidTime();
        schedule.nextAt += schedule.interval;
        schedule.remaining -= 1;
        schedule.executed += 1;
        if (schedule.remaining == 0) schedule.active = false;
        _transferUSDC(schedule.payer, schedule.payee, schedule.amount);
        emit ScheduleExecuted(id, schedule.payer, schedule.payee, schedule.amount, schedule.executed, msg.sender);
    }

    /// @notice Allows only the payer to cancel an active schedule.
    function cancelSchedule(uint256 id) external nonReentrant {
        Schedule storage schedule = _schedule(id);
        if (msg.sender != schedule.payer) revert Unauthorized();
        if (!schedule.active) revert InvalidStatus();
        schedule.active = false;
        emit ScheduleCancelled(id, msg.sender);
    }

    /// @notice Returns a schedule, reverting with NotFound for unknown IDs.
    function getSchedule(uint256 id) external view returns (Schedule memory) {
        return _schedule(id);
    }

    /// @notice Lists schedules where the user is either payer or payee.
    function scheduleIdsOf(address user) external view returns (uint256[] memory) {
        return _scheduleIds[user];
    }

    /// @dev Looks up an invoice and rejects unknown IDs.
    function _invoice(uint256 id) private view returns (Invoice storage invoice) {
        if (id == 0 || id >= nextInvoiceId) revert NotFound();
        invoice = _invoices[id];
    }

    /// @dev Looks up a schedule and rejects unknown IDs.
    function _schedule(uint256 id) private view returns (Schedule storage schedule) {
        if (id == 0 || id >= nextScheduleId) revert NotFound();
        schedule = _schedules[id];
    }

    /// @dev Transfers directly between wallets, accepting no return data or an encoded true.
    /// Rejects non-contract tokens and malformed return values using custom errors.
    function _transferUSDC(address from, address to, uint256 amount) private {
        if (usdc.code.length == 0) revert InvalidToken();
        (bool success, bytes memory returndata) = usdc.call(
            abi.encodeWithSelector(bytes4(0x23b872dd), from, to, amount)
        );
        if (!success) revert TokenTransferFailed();
        if (returndata.length != 0) {
            if (returndata.length < 32) revert TokenTransferFailed();
            uint256 result;
            assembly {
                result := mload(add(returndata, 32))
            }
            if (result != 1) revert TokenTransferFailed();
        }
    }

    /// @dev Prevents silent narrowing of timestamp and block values.
    function _toUint64(uint256 value) private pure returns (uint64) {
        if (value > type(uint64).max) revert ValueOverflow();
        return uint64(value);
    }
}
