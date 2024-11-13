// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.27;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockWETH is ERC20 {
    constructor(uint256 initialSupply) ERC20("Wrapped Ether", "WETH") {
        _mint(msg.sender, initialSupply);
    }

    function deposit() external payable {
        _mint(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external {
        require(balanceOf(msg.sender) >= amount, "Insufficient WETH balance");
        _burn(msg.sender, amount);
        payable(msg.sender).transfer(amount);
    }
}
