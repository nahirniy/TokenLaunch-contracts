// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.27;

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ITokenVesting} from "./interface/ITokenVesting.sol";

/// @title TokenVesting
/// @notice Contract for managing token vesting schedules
contract TokenVesting is ITokenVesting, Ownable {
    using SafeERC20 for IERC20;

    /// @notice The ERC20 token being vested
    IERC20 public immutable TOKEN;

    /// @notice Address of the presale contract
    address public presaleContract;

    /// @notice Total amount of tokens vested
    uint256 public vestingTotalAmount;

    /// @notice Mapping from user address to their vesting schedules
    mapping(address => VestingSchedule[]) public vestings;

    /**
     * @notice Constructor to initialize the TokenVesting contract
     * @param _owner Address of the contract owner
     * @param _token Address of the ERC20 token to be vested
     */
    constructor(address _owner, address _token) Ownable(_owner) {
        if (!_isContract(_token)) revert TokenIsNotContract();

        TOKEN = IERC20(_token);
    }

    /**
     * @notice Modifier to allow only the owner or the presale contract to execute functions
     */
    modifier onlyOwnerOrPresale() {
        if (msg.sender != owner() && msg.sender != presaleContract) {
            revert OnlyOwnerOrPresaleAllowed();
        }
        _;
    }

    /**
     * @notice Creates a new vesting schedule for a recipient
     * @param recipient Address of the token recipient
     * @param startTime Timestamp when vesting starts
     * @param endTime Timestamp when vesting ends
     * @param cliffPeriod Duration of the cliff period
     * @param slicePeriod Duration of each slice period
     * @param amount Amount of tokens to vest
     * @param vestingType Type of vesting
     */
    function createVesting(
        address recipient,
        uint256 startTime,
        uint256 endTime,
        uint256 cliffPeriod,
        uint256 slicePeriod,
        uint256 amount,
        VestingType vestingType
    ) external onlyOwnerOrPresale {
        if (recipient == address(0)) revert RecipientIsZeroAddress();
        if (slicePeriod == 0) revert SlicePeriodIsZero();
        if (startTime == 0) revert StartTimeIsZero();
        if (amount == 0) revert NoTokensToVesting();
        if (endTime < block.timestamp) revert EndTimeInPast();
        if (endTime <= startTime) revert EndTimeBeforeStartTime();
        if (cliffPeriod + slicePeriod > endTime - startTime) revert CliffAndSlicePeriodTooLong();

        VestingSchedule memory vesting = VestingSchedule({
            recipient: recipient,
            startTime: startTime,
            cliffTime: startTime + cliffPeriod,
            endTime: endTime,
            slicePeriod: slicePeriod,
            amount: amount,
            claimed: 0,
            vestingType: vestingType
        });

        vestings[recipient].push(vesting);
        vestingTotalAmount += amount;
        TOKEN.transferFrom(msg.sender, address(this), amount);

        emit VestingScheduleCreated(
            msg.sender,
            recipient,
            startTime,
            startTime + cliffPeriod,
            endTime,
            slicePeriod,
            amount,
            vestingType
        );
    }

    /**
     * @notice Allows a user to claim their vested tokens
     */
    function claimTokens() external {
        VestingSchedule[] storage recipientVestings = vestings[msg.sender];

        uint256 totalClaimableAmount;
        for (uint256 i = 0; i < recipientVestings.length; i++) {
            VestingSchedule storage vesting = recipientVestings[i];

            uint256 claimableAmount = _calculateClaimableAmount(vesting);
            if (claimableAmount > 0) {
                vesting.claimed += claimableAmount;
                totalClaimableAmount += claimableAmount;
            }
        }

        if (totalClaimableAmount == 0) revert NoTokensToClaim();

        vestingTotalAmount -= totalClaimableAmount;
        TOKEN.transfer(msg.sender, totalClaimableAmount);

        emit TokensClaimed(msg.sender, totalClaimableAmount);
    }

    /**
     * @notice Sets the address of the presale contract
     * @param _presaleContract Address of the presale contract
     */
    function setPresaleContract(address _presaleContract) external onlyOwner {
        if (presaleContract != address(0)) revert PresaleAlreadySet();
        if (!_isContract(_presaleContract)) revert PresaleIsNotContract();

        presaleContract = _presaleContract;
        emit PresaleContractSet(_presaleContract);
    }

    /**
     * @notice Retrieves the total claimable amount for a recipient
     * @param _recipient Address of the recipient
     * @return Total claimable tokens
     */
    function getClaimableAmount(address _recipient) external view returns (uint256) {
        VestingSchedule[] storage recipientVestings = vestings[_recipient];

        uint256 totalClaimable = 0;
        for (uint256 i = 0; i < recipientVestings.length; i++) {
            VestingSchedule storage vesting = recipientVestings[i];
            totalClaimable += _calculateClaimableAmount(vesting);
        }

        return totalClaimable;
    }

    /**
     * @notice Retrieves all vesting schedules for a recipient
     * @param _recipient Address of the recipient
     * @return Array of VestingSchedule structs
     */
    function getVestings(address _recipient) external view returns (VestingSchedule[] memory) {
        return vestings[_recipient];
    }

    /**
     * @notice Retrieves the number of vesting schedules for a recipient
     * @param _recipient Address of the recipient
     * @return Number of vesting schedules
     */
    function getVestingsCount(address _recipient) external view returns (uint256) {
        return vestings[_recipient].length;
    }

    /**
     * @notice Calculates the claimable amount for a given vesting schedule
     * @param _vesting VestingSchedule struct
     * @return Claimable token amount
     *
     * Calculation:
     * C = (At * Sc / St) - Ca
     *
     * Where:
     * C — Claimable Amount: the amount of tokens that can be claimed at the current time.
     * At — Tokens Total: the total amount of tokens for vesting (amount).
     * Sc — Slices Completed: the number of completed slices at the current time. (Current Time - Cliff Time) / Slice Period
     * St — Slices Total: the total number of slices over the entire vesting period. (End Time - Cliff Time) / Slice Period
     * Ca — Claimed Already Tokens: the amount of tokens that have already been released (claimed).
     * *Cliff Time = (Start Time + Cliff Period)
     */
    function _calculateClaimableAmount(VestingSchedule memory _vesting) private view returns (uint256) {
        uint256 currentTime = block.timestamp;

        if (currentTime < _vesting.cliffTime) {
            return 0;
        }

        if (currentTime >= _vesting.endTime) {
            return _vesting.amount - _vesting.claimed;
        }

        uint256 timeAfterCliff = currentTime - _vesting.cliffTime;

        uint256 completedSlices = timeAfterCliff / _vesting.slicePeriod;
        uint256 totalSlices = (_vesting.endTime - _vesting.cliffTime) / _vesting.slicePeriod;

        uint256 claimableAmount = (_vesting.amount * completedSlices) / totalSlices;

        return claimableAmount - _vesting.claimed;
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