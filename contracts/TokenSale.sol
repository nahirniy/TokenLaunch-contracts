// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.27;

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ITokenVesting} from "./interface/ITokenVesting.sol";
import {IWETH} from"./interface/IWETH.sol";
import {ITokenSale} from "./interface/ITokenSale.sol";


/// @title TokenSale
/// @notice Contract for selling tokens with vesting
contract TokenSale is ITokenSale, Ownable, Pausable {
    using SafeERC20 for IERC20;

    /// @notice The token being sold
    IERC20 public immutable SALE_TOKEN;

    /// @notice Wrapped ETH token
    IWETH public immutable WETH_TOKEN;

    /// @notice Precision factor for sale token calculations
    uint256 public immutable SALE_TOKEN_PRECISION;

    /// @notice Address of the vesting contract
    address public vestingContract;

    /// @notice Array of all sale rounds
    Round[] rounds;

    /// @notice Mapping from round ID to Round details
    mapping(uint256 => Round) public roundsById;

    /// @notice Mapping from user address to their purchases
    mapping(address => Purchase[]) public userPurchases;

    /**
     * @notice Constructor to initialize the TokenSale contract
     * @param _saleToken Address of the token to be sold
     * @param _wethToken Address of the Wrapped ETH token
     * @param _owner Address of the contract owner
     */
    constructor(address _saleToken, address _wethToken, address _owner) Ownable(_owner) {
        if (!_isContract(_saleToken)) revert IsNotContract(_saleToken);
        if (!_isContract(_wethToken)) revert IsNotContract(_wethToken);

        SALE_TOKEN = IERC20(_saleToken);
        WETH_TOKEN = IWETH(_wethToken);
        SALE_TOKEN_PRECISION = 10 ** IERC20Metadata(_saleToken).decimals();
    }

    /**
     * @notice Modifier to check if a round exists
     * @param _roundId ID of the round to check
     */
    modifier roundExists(uint256 _roundId) {
        if (_roundId == 0 || _roundId > rounds.length) revert InvalidRoundId();
        _;
    }

    /**
     * @notice Creates a new sale round
     * @param _roundType Type of the round
     * @param _paymentToken Address of the payment token
     * @param _price Price per token
     * @param _tokenAmount Number of tokens available in the round
     * @param _startTime Timestamp when the round starts
     * @param _endTime Timestamp when the round ends
     * @param _vestingStartTime Timestamp when vesting starts
     * @param _vestingEndTime Timestamp when vesting ends
     * @param _vestingCliffPeriod Duration of the cliff period for vesting
     * @param _vestingSlicePeriod Duration of each slice period for vesting
     */
    function createRound(
        RoundType _roundType,
        address _paymentToken,
        uint256 _price,
        uint256 _tokenAmount,
        uint256 _startTime,
        uint256 _endTime,
        uint256 _vestingStartTime,
        uint256 _vestingEndTime,
        uint256 _vestingCliffPeriod,
        uint256 _vestingSlicePeriod
    ) external onlyOwner {
        if (vestingContract == address(0)) revert VestingContractIsNotSet();
        if (_startTime <= block.timestamp) revert StartTimeInPast();
        if (_endTime <= _startTime) revert EndTimeBeforeStartTime();
        if (_price == 0) revert InvalidPrice();
        if (_tokenAmount == 0) revert NoTokensToRound();
        if (!_isContract(_paymentToken)) revert IsNotContract(_paymentToken);
        if (_vestingStartTime < _endTime) revert EndTimeBeforeVestingStartTime();
        if (_vestingSlicePeriod == 0) revert VestingSlicePeriodIsZero();
        if (_vestingEndTime <= _vestingStartTime) revert VestingEndTimeBeforeVestingStartTime();
        if (_vestingCliffPeriod + _vestingSlicePeriod > _vestingEndTime - _vestingStartTime) revert VestingCliffAndSlicePeriodTooLong();

        Round memory newRound = Round({
            roundType: _roundType,
            paymentToken: _paymentToken,
            price: _price,
            tokenAmount: _tokenAmount,
            soldAmount: 0,
            startTime: _startTime,
            endTime: _endTime,
            vestingStartTime: _vestingStartTime,
            vestingEndTime: _vestingEndTime,
            vestingCliffPeriod: _vestingCliffPeriod,
            vestingSlicePeriod: _vestingSlicePeriod
        });

        rounds.push(newRound);
        roundsById[rounds.length] = newRound;

        emit RoundCreated(rounds.length, _roundType, _paymentToken, _tokenAmount, _price, _startTime, _endTime);
    }

    /**
     * @notice Allows a user to buy tokens from a specific round
     * @param _roundId ID of the round to purchase from
     * @param _amount Number of tokens to purchase
     */
    function buyTokens(uint256 _roundId, uint256 _amount) external payable whenNotPaused roundExists(_roundId) {
        Round memory round = roundsById[_roundId];
        if (_amount == 0) revert NoTokensToBuy();
        if (block.timestamp < round.startTime || block.timestamp > round.endTime) revert RoundNotActive();
        if (round.soldAmount + _amount > round.tokenAmount) revert InsufficientTokensInRound();

        uint256 paymentAmount = getPaymentAmountForTokens(_roundId, _amount);
        if (paymentAmount == 0) revert PaymentAmountIsZero();

        if (round.paymentToken == address(WETH_TOKEN)) {
            if (msg.value < paymentAmount) revert InsufficientEthSent();

            uint256 wethBalanceBefore = WETH_TOKEN.balanceOf(address(this));
            WETH_TOKEN.deposit{value: msg.value}();

            uint256 excess = WETH_TOKEN.balanceOf(address(this)) - (wethBalanceBefore + paymentAmount);

            if (excess > 0) WETH_TOKEN.transfer(msg.sender, excess);
        } else {
            if (msg.value != 0) revert EthNotAllowedForErc20Purchase();
            IERC20(round.paymentToken).safeTransferFrom(msg.sender, address(this), paymentAmount);
        }

        SALE_TOKEN.approve(vestingContract, _amount);
        ITokenVesting(vestingContract).createVesting(
            msg.sender,
            round.vestingStartTime,
            round.vestingEndTime,
            round.vestingCliffPeriod,
            round.vestingSlicePeriod,
            _amount,
            ITokenVesting.VestingType(uint8(round.roundType))
        );

        Purchase memory newPurchase = Purchase({
            roundId: _roundId,
            tokenAmount: _amount
        });

        userPurchases[msg.sender].push(newPurchase);
        roundsById[_roundId].soldAmount += _amount;

        emit TokensPurchased(msg.sender, _roundId, _amount, paymentAmount);
    }

    /**
     * @notice Sets the vesting contract address
     * @param _vestingContract Address of the vesting contract
     */
    function setVestingContract(address _vestingContract) external onlyOwner {
        if (vestingContract != address(0)) revert VestingAlreadySet();
        if (!_isContract(_vestingContract)) revert IsNotContract(_vestingContract);

        vestingContract = _vestingContract;
        emit VestingContractSet(_vestingContract);
    }

    /**
     * @notice Withdraws a specific amount of tokens to a recipient
     * @param _recipient Address of the recipient
     * @param _token Address of the token to withdraw
     * @param _amount Amount of tokens to withdraw
     */
    function withdrawTokens(address _recipient, address _token, uint256 _amount) external onlyOwner {
        IERC20(_token).safeTransfer(_recipient, _amount);
    }

    /**
     * @notice Withdraws all tokens of a specific type to the owner
     * @param _token Address of the token to withdraw
     */
    function withdrawAllTokens(address _token) external onlyOwner {
        uint256 balance = IERC20(_token).balanceOf(address(this));
        IERC20(_token).safeTransfer(msg.sender, balance);
    }

    /**
     * @notice Pauses the contract functionalities
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpauses the contract functionalities
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Calculates the payment amount required for a given number of tokens in a round
     * @param _roundId ID of the round
     * @param _tokenAmount Number of tokens
     * @return Payment amount required
     */
    function getPaymentAmountForTokens(uint256 _roundId, uint256 _tokenAmount) public view roundExists(_roundId) returns (uint256) {
        Round memory round = roundsById[_roundId];
        return _tokenAmount * round.price / SALE_TOKEN_PRECISION;
    }

    /**
     * @notice Calculates the number of tokens that can be purchased for a given payment amount in a round
     * @param _roundId ID of the round
     * @param _paymentAmount Payment amount
     * @return Number of tokens
     */
    function getTokenAmountForPayment(uint256 _roundId, uint256 _paymentAmount) public view roundExists(_roundId) returns (uint256) {
        Round memory round = roundsById[_roundId];
        return _paymentAmount * SALE_TOKEN_PRECISION / round.price;
    }

    /**
     * @notice Gets the total earnings for a specific round
     * @param _roundId ID of the round
     * @return Total earnings in payment tokens
     */
    function getTotalEarningsForRound(uint256 _roundId) public view roundExists(_roundId) returns (uint256) {
        Round memory round = roundsById[_roundId];
        return round.soldAmount * round.price / SALE_TOKEN_PRECISION;
    }

    /**
     * @notice Retrieves all purchases made by a user
     * @param _user Address of the user
     * @return Array of Purchase structs
     */
    function getUserPurchases(address _user) public view returns (Purchase[] memory) {
        return userPurchases[_user];
    }

    /**
     * @notice Retrieves the number of purchases made by a user
     * @param _user Address of the user
     * @return Number of purchases
     */
    function getUserPurchasesCount(address _user) public view returns (uint256) {
        return userPurchases[_user].length;
    }

    /**
     * @notice Retrieves all sale rounds
     * @return Array of Round structs
     */
    function getAllRounds() public view returns (Round[] memory) {
        return rounds;
    }

    /**
     * @notice Retrieves the total number of sale rounds
     * @return Number of rounds
     */
    function getRoundsCount() public view returns (uint256) {
        return rounds.length;
    }

    /**
     * @notice Checks if an address is a contract
     * @param _address Address to check
     * @return True if the address is a contract, false otherwise
     */
    function _isContract(address _address) private view returns (bool) {
        uint32 size;
        assembly {
            size := extcodesize(_address)
        }
        return (size > 0);
    }
}