// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.27;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IWETH} from "./IWETH.sol";
import {ITokenVesting} from "./ITokenVesting.sol";

interface ITokenSale {
    enum RoundType {
        PUBLIC,
        PRIVATE,
        TEAM
    }

    struct Round {
        RoundType roundType;
        address paymentToken;
        uint256 price;
        uint256 tokenAmount;
        uint256 soldAmount;
        uint256 startTime;
        uint256 endTime;
        uint256 vestingStartTime;
        uint256 vestingEndTime; 
        uint256 vestingCliffPeriod;
        uint256 vestingSlicePeriod;
    }
    
    struct Purchase {
        uint256 roundId;
        uint256 tokenAmount;
    }

    error IsNotContract(address _address);
    error VestingContractIsNotSet();
    error VestingAlreadySet();
    error NoTokensToRound();
    error NoTokensToBuy();
    error StartTimeInPast();
    error EndTimeBeforeStartTime();
    error InvalidPrice();
    error InvalidPaymentToken();
    error InvalidRoundId();
    error RoundNotActive();
    error InsufficientTokensInRound();
    error InsufficientEthSent();
    error PaymentAmountIsZero();
    error EthNotAllowedForErc20Purchase();
    error EndTimeBeforeVestingStartTime();
    error VestingSlicePeriodIsZero();
    error VestingEndTimeInPast();
    error VestingEndTimeBeforeVestingStartTime();
    error VestingCliffAndSlicePeriodTooLong();

    event RoundCreated(
        uint256 indexed roundId,
        RoundType roundType,
        address paymentToken,
        uint256 tokenAmount,
        uint256 price,
        uint256 startTime,
        uint256 endTime
    );
    event TokensPurchased(
        address indexed buyer,
        uint256 indexed roundId,
        uint256 amount,
        uint256 paymentAmount
    );
    event VestingContractSet(address indexed vestingContract);

    function SALE_TOKEN() external view returns (IERC20);
    function WETH_TOKEN() external view returns (IWETH);
    function vestingContract() external view returns (address);
    function SALE_TOKEN_PRECISION() external view returns (uint256);

    function roundsById(
        uint256
    )
        external
        view
        returns (
            RoundType roundType,
            address paymentToken,
            uint256 price,
            uint256 tokenAmount,
            uint256 soldAmount,
            uint256 startTime,
            uint256 endTime,
            uint256 vestingStartTime,
            uint256 vestingEndTime,
            uint256 vestingCliffPeriod,
            uint256 vestingSlicePeriod
        );
    function userPurchases(address, uint256) external view returns (uint256 roundId, uint256 tokenAmount);

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
    ) external;

    function setVestingContract(address _vestingContract) external;


    function buyTokens(uint256 _roundId, uint256 _amount) external payable;

    function withdrawTokens(address _recipient, address _token, uint256 _amount) external;
    function withdrawAllTokens(address _token) external;

    function pause() external;
    function unpause() external;

    function getPaymentAmountForTokens(uint256 _roundId, uint256 _tokenAmount) external view returns (uint256);
    function getTokenAmountForPayment(uint256 _roundId, uint256 _paymentAmount) external view returns (uint256);
    function getUserPurchases(address _user) external view returns (Purchase[] memory);
    function getUserPurchasesCount(address _user) external view returns (uint256);
    function getAllRounds() external view returns (Round[] memory);
    function getRoundsCount() external view returns (uint256);
}