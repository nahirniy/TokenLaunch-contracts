Here's the README file structured for your contracts:

# Token Vesting and Token Sale Contracts

## Overview

This repository contains Solidity smart contracts developed for a token vesting and sale solution. The `TokenVesting` contract manages vesting schedules for token recipients, while the `TokenSale` contract facilitates the sale of tokens, with support for vesting features and purchases using ETH or other ERC20 tokens.

## Smart Contracts

1. **TokenVesting Contract**: 
   - Manages vesting schedules for users, allowing for periodic release of tokens based on defined vesting periods and cliff times.
   - Allows only the contract owner or an associated presale contract to create new vesting schedules.
   - Users can claim vested tokens periodically as they become available.
   - Provides functionality to view claimable amounts, retrieve all vesting schedules for an address, and check the number of vesting schedules.

2. **TokenSale Contract**:
   - Facilitates the sale of ERC20 tokens with optional vesting periods.
   - Allows users to purchase tokens using ETH or wrapped ETH (WETH).
   - Integrates with the `TokenVesting` contract to create vesting schedules for token buyers.
   - Supports multiple sale rounds with specific pricing and duration.

## Technologies Used

- **Solidity**: Programming language used for developing the smart contracts.
- **OpenZeppelin Library**: Utilized for secure ERC20 and utility functions.
- **Hardhat Framework**: For local development, testing, and deployment.

## Contracts Information

- **TokenVesting Contract**: Manages vesting logic for token recipients.
- **TokenSale Contract**: Handles token sale logic with integrated vesting.

## How to Buy Tokens

1. **Calculate Purchase Amount**:
   - Use functions such as `getPurchaseTokenAmount()` or `getNativeTokenAmount()` to determine the amount of tokens you can receive for a specific amount of ETH or other tokens.

2. **Buy Tokens with ETH**:
   - Call `buyWithETH()` with the desired amount of tokens (in 18-decimal format) and provide the required ETH in the `value` field. Any excess ETH will be refunded.

3. **Claim Vested Tokens**:
   - After the vesting period starts, call `claimTokens()` to claim any available tokens based on your vesting schedule.

4. **Check Vesting Details**:
   - Use `getVestings()` or `getClaimableAmount()` to view vesting details and total claimable amounts.

## Running the Project Locally

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/your-repo/token-vesting-sale.git
   cd token-vesting-sale
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Compile Contracts**:
   ```bash
   npx hardhat compile
   ```

4. **Run Tests**:
   ```bash
   npx hardhat test
   ```

5. **Deploy Contracts**:
   ```bash
   npx hardhat run scripts/deploy.ts --network sepolia
   ```

### Contact Information

For any questions or feedback regarding the contracts, please reach out via [Telegram](https://t.me/nahirniy) or [email](mailto:nahirniyy@gmail.com).
