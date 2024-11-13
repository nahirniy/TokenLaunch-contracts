// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.27;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ITokenVesting {
    enum VestingType {
        PUBLIC,
        PRIVATE,
        TEAM
    }

    struct VestingSchedule {
        address recipient;
        uint256 startTime;
        uint256 cliffTime;
        uint256 endTime;
        uint256 slicePeriod;
        uint256 amount;
        uint256 claimed;
        VestingType vestingType;
    }

    error TokenIsNotContract();
    error PresaleIsNotContract();
    error PresaleAlreadySet();
    error OnlyOwnerOrPresaleAllowed();
    error RecipientIsZeroAddress();
    error StartTimeIsZero();
    error SlicePeriodIsZero();
    error NoTokensToVesting();
    error NoTokensToClaim();
    error EndTimeBeforeStartTime();
    error EndTimeInPast();
    error CliffAndSlicePeriodTooLong();

    event VestingScheduleCreated(
        address indexed creator,
        address indexed recipient,
        uint256 startTime,
        uint256 cliffTime,
        uint256 endTime,
        uint256 slicePeriod,
        uint256 amount,
        VestingType vestingType
    );
    event TokensClaimed(address indexed recipient, uint256 amount);
    event PresaleContractSet(address indexed presaleContract);

    function TOKEN() external view returns (IERC20);
    function presaleContract() external view returns (address);

    function vestings(address _recipient, uint256 _index) external view returns (
        address recipient,
        uint256 startTime,
        uint256 cliffTime,
        uint256 endTime,
        uint256 slicePeriod,
        uint256 amount,
        uint256 claimed,
        VestingType vestingType
    );

    function createVesting(
        address recipient,
        uint256 startTime,
        uint256 endTime,
        uint256 cliffPeriod,
        uint256 slicePeriod,
        uint256 amount,
        VestingType vestingType
    ) external;
    function claimTokens() external;
    function setPresaleContract(address _presaleContract) external;

    function getClaimableAmount(address _recipient) external view returns (uint256);
    function getVestings(address _recipient) external view returns (VestingSchedule[] memory);
    function getVestingsCount(address _recipient) external view returns (uint256);
}