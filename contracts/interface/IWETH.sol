// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.27;

interface IWETH {
    function deposit() external payable;
    function withdraw(uint256) external;
    function transfer(address to, uint256 value) external returns (bool);
    function balanceOf(address owner) external view returns (uint256);
}