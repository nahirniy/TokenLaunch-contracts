import { ethers } from "hardhat";
import { expect } from "chai";
import { TokenSale, MockERC20, MockWETH, TokenVesting } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("TokenSale", function () {
    let tokenSale: TokenSale;
    let saleToken: MockERC20;
    let paymentToken: MockERC20;
    let wethToken: MockWETH;
    let tokenVesting: TokenVesting;
    let owner: HardhatEthersSigner;
    let buyer: HardhatEthersSigner;
    let otherAccount: HardhatEthersSigner;

    const INITIAL_SUPPLY = ethers.parseEther("1000000");
    const ROUND_TOKEN_AMOUNT = ethers.parseEther("100000");
    const TOKEN_PRICE = ethers.parseEther("0.1"); // 1 token = 0.1 ETH or 0.1 ERC20

    const deployTokenSaleFixture = async () => {
        const [owner, buyer, otherAccount] = await ethers.getSigners();

        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const MockWETH = await ethers.getContractFactory("MockWETH");
        
        const saleToken = await MockERC20.deploy(INITIAL_SUPPLY);
        const paymentToken = await MockERC20.deploy(INITIAL_SUPPLY);
        const wethToken = await MockWETH.deploy(INITIAL_SUPPLY);

        const TokenVesting = await ethers.getContractFactory("TokenVesting");
        const tokenVesting = await TokenVesting.deploy(owner.address, saleToken.target);

        const TokenSale = await ethers.getContractFactory("TokenSale");
        const tokenSale = await TokenSale.deploy(saleToken.target, wethToken.target, owner.address);

        await tokenSale.setVestingContract(tokenVesting.target);
        await tokenVesting.setPresaleContract(tokenSale.target);

        await saleToken.transfer(tokenSale.target, INITIAL_SUPPLY);

        return { tokenSale, saleToken, wethToken, paymentToken, tokenVesting, owner, buyer, otherAccount };
    };

    const createRound = async (overrides = {}) => {
        const defaultParams = {
            roundType: 0, // PUBLIC
            paymentToken: paymentToken.target,
            price: TOKEN_PRICE,
            tokenAmount: ROUND_TOKEN_AMOUNT,
            startTime: await time.latest() + 3600, // 1 hour from now
            endTime: (await time.latest()) + 3600 + 86400, // 24 hours duration
            vestingStartTime: (await time.latest()) + 3600 + 3600 + 86400,
            vestingEndTime: (await time.latest()) + 3600 + 86400 + 2592000, // 30 days vesting
            vestingCliffPeriod: 86400, // 1 day cliff
            vestingSlicePeriod: 86400, // 1 day slice period
            sender: owner,
        };

        const params = { ...defaultParams, ...overrides };

        await tokenSale.connect(params.sender).createRound(
            params.roundType,
            params.paymentToken,
            params.price,
            params.tokenAmount,
            params.startTime,
            params.endTime,
            params.vestingStartTime,
            params.vestingEndTime,
            params.vestingCliffPeriod,
            params.vestingSlicePeriod
        );

        return params;
    };

    beforeEach(async () => {
        const fixture = await loadFixture(deployTokenSaleFixture);
        tokenSale = fixture.tokenSale;
        saleToken = fixture.saleToken;
        paymentToken = fixture.paymentToken;
        wethToken = fixture.wethToken;
        tokenVesting = fixture.tokenVesting;
        owner = fixture.owner;
        buyer = fixture.buyer;
        otherAccount = fixture.otherAccount;
    });

    describe("Deployment functionality", function () {
        it("Should correctly set the sale token", async function () {
            expect(await tokenSale.SALE_TOKEN()).to.be.eq(saleToken.target);
        });

        it("Should correctly set the WETH token", async function () {
            expect(await tokenSale.WETH_TOKEN()).to.be.eq(wethToken.target);
        });

        it("Should correctly set the vesting contract", async function () {
            expect(await tokenSale.vestingContract()).to.be.eq(tokenVesting.target);
        });

        it("Should correctly set the owner", async function () {
            expect(await tokenSale.owner()).to.be.eq(owner.address);
        });

        it("Should correctly set the token precision", async function () {
            expect(await tokenSale.SALE_TOKEN_PRECISION()).to.be.eq(ethers.parseUnits("1", 18));
        });

        it("Should prevent deploy with non-contract address for sale token", async function () {
            const TokenSale = await ethers.getContractFactory("TokenSale");
            await expect(TokenSale.deploy(ethers.ZeroAddress, wethToken.target, owner.address)).to.be.revertedWithCustomError(
                tokenSale,
                "IsNotContract",
            ).withArgs(ethers.ZeroAddress);
        });

        it("Should prevent deploy with non-contract address for weth", async function () {
            const TokenSale = await ethers.getContractFactory("TokenSale");
            await expect(TokenSale.deploy(saleToken.target, ethers.ZeroAddress, owner.address)).to.be.revertedWithCustomError(
                tokenSale,
                "IsNotContract",
            ).withArgs(ethers.ZeroAddress);
        });

        it("Should prevent set vesting If it is not called by the owner", async function () {
            await expect(tokenSale.connect(otherAccount).setVestingContract(tokenVesting.target)).to.be.revertedWithCustomError(
                tokenSale,
                "OwnableUnauthorizedAccount",
            );
        });

        it("Should prevent set vesting if it is non-contract address", async function () {
            // To test this scenario need to other sale contract since for main contract vesting is already set
            const TokenSale = await ethers.getContractFactory("TokenSale");
            const tokenSale = await TokenSale.deploy(saleToken.target, wethToken.target, owner.address);

            await expect(tokenSale.setVestingContract(ethers.ZeroAddress)).to.be.revertedWithCustomError(
                tokenSale,
                "IsNotContract",
            ).withArgs(ethers.ZeroAddress);
        });

        it("Should prevent set presale if it is already set", async function () {
            await expect(tokenSale.setVestingContract(tokenVesting.target)).to.be.revertedWithCustomError(
                tokenSale,
                "VestingAlreadySet",
            );
        });

        it("Should prevent deploy with non-contract address for token", async function () {
            const TokenVesting = await ethers.getContractFactory("TokenVesting");
            await expect(TokenVesting.deploy(owner.address, ethers.ZeroAddress)).to.be.revertedWithCustomError(
                tokenVesting,
                "TokenIsNotContract",
            );
        });
    });

    describe("Round creation functionality", function () {
        it("Should create a round successfully", async function () {
            const roundParams = await createRound();

            const round = await tokenSale.roundsById(1);
            const rounds = await tokenSale.getAllRounds();

            expect(rounds.length).to.be.eq(await tokenSale.getRoundsCount());
            expect(round.roundType).to.be.eq(roundParams.roundType);
            expect(round.paymentToken).to.be.eq(roundParams.paymentToken);
            expect(round.price).to.be.eq(roundParams.price);
            expect(round.tokenAmount).to.be.eq(roundParams.tokenAmount);
            expect(round.startTime).to.be.eq(roundParams.startTime);
            expect(round.endTime).to.be.eq(roundParams.endTime);
        });

        it("Should prevent if it is not called by the owner", async function () {
            await expect(tokenSale.connect(otherAccount).createRound(0, ethers.ZeroAddress, 0, 0, 0, 0, 0, 0, 0, 0)).to.be.revertedWithCustomError(
                tokenSale,
                "OwnableUnauthorizedAccount",
            );
        });

        it("Should prevent if vesting contract is not set", async function () {
            // To test this scenario need to other sale contract since for main contract vesting is already set
            const TokenSale = await ethers.getContractFactory("TokenSale");
            const newTokenSale = await TokenSale.deploy(saleToken.target, wethToken.target, owner.address);

            await expect(newTokenSale.createRound(0, ethers.ZeroAddress, 0, 0, 0, 0, 0, 0, 0, 0))
                .to.be.revertedWithCustomError(newTokenSale, "VestingContractIsNotSet");
        });

        it("Should prevent if start time is in the past", async function () {
            await expect(createRound({ startTime: await time.latest() - 3600 }))
                .to.be.revertedWithCustomError(tokenSale, "StartTimeInPast");
        });

        it("Should prevent if end time is before start time", async function () {
            const startTime = await time.latest() + 3600;
            await expect(createRound({ startTime, endTime: startTime - 1 }))
                .to.be.revertedWithCustomError(tokenSale, "EndTimeBeforeStartTime");
        });

        it("Should prevent if price is zero", async function () {
            await expect(createRound({ price: 0 }))
                .to.be.revertedWithCustomError(tokenSale, "InvalidPrice");
        });

        it("Should prevent if token amount is zero", async function () {
            await expect(createRound({ tokenAmount: 0 }))
                .to.be.revertedWithCustomError(tokenSale, "NoTokensToRound");
        });

        it("Should prevent if payment token is not a contract", async function () {
            await expect(createRound({ paymentToken: ethers.ZeroAddress }))
                .to.be.revertedWithCustomError(tokenSale, "IsNotContract");
        });
        
        it("Should prevent if end time before vesting start time", async function () {
            const now = await time.latest();
            await expect(createRound({ vestingStartTime: now }))
                .to.be.revertedWithCustomError(tokenSale, "EndTimeBeforeVestingStartTime");
        });

        it("Should prevent if vesting end time before vesting start time", async function () {
            const now = await time.latest();
            await expect(createRound({ vestingEndTime: now, }))
                .to.be.revertedWithCustomError(tokenSale, "VestingEndTimeBeforeVestingStartTime");
        });

        it("Should prevent if vesting cliff and slice period larger than total vesting duration", async function () {
            const vestingCliffPeriod = 30 * 24 * 3600; // 30 days
            await expect(createRound({ vestingCliffPeriod })).to.be.revertedWithCustomError(tokenSale, "VestingCliffAndSlicePeriodTooLong");
        });

        it("Should prevent if vesting slice period is zero", async function () {
            const now = await time.latest();
            await expect(createRound({ vestingSlicePeriod: 0, }))
                .to.be.revertedWithCustomError(tokenSale, "VestingSlicePeriodIsZero");
        });
        
        it("Should prevent if round doesn't exist", async function () {
            const notExistRoundId = 2

            await expect(tokenSale.buyTokens(0, 1)).to.be.revertedWithCustomError(tokenSale, "InvalidRoundId");
            await expect(tokenSale.buyTokens(notExistRoundId, 1)).to.be.revertedWithCustomError(tokenSale, "InvalidRoundId");
            await expect(tokenSale.getPaymentAmountForTokens(notExistRoundId, 1)).to.be.revertedWithCustomError(tokenSale, "InvalidRoundId");
            await expect(tokenSale.getTokenAmountForPayment(notExistRoundId, 1)).to.be.revertedWithCustomError(tokenSale, "InvalidRoundId");
            await expect(tokenSale.getTotalEarningsForRound(notExistRoundId)).to.be.revertedWithCustomError(tokenSale, "InvalidRoundId");
        });
    });

    describe("Token purchase functionality", function () {
        let roundId: number;
        let roundParams: any;

        beforeEach(async function () {
            roundParams = await createRound();
            roundId = 1;
            await time.increaseTo(roundParams.startTime);
        });

        it("Should correctly buy tokens with ERC20 token", async function () {
            const buyAmount = ethers.parseEther("1000");
            const paymentAmount = await tokenSale.getPaymentAmountForTokens(roundId, buyAmount);

            await paymentToken.transfer(buyer.address, paymentAmount);
            await paymentToken.connect(buyer).approve(tokenSale.target, paymentAmount);
            await tokenSale.connect(buyer).buyTokens(roundId, buyAmount);

            expect(await paymentToken.balanceOf(tokenSale.target)).to.be.eq(paymentAmount);
            expect(await saleToken.balanceOf(tokenVesting.target)).to.be.eq(buyAmount);
            expect(await tokenSale.getTokenAmountForPayment(1, paymentAmount)).to.be.eq(buyAmount);
            expect(await tokenSale.getTotalEarningsForRound(1)).to.be.eq(paymentAmount);

            const userPurchases = await tokenSale.getUserPurchases(buyer.address);
            expect(userPurchases.length).to.be.eq(await tokenSale.getUserPurchasesCount(buyer.address));
            expect(userPurchases[0].roundId).to.be.eq(roundId);
            expect(userPurchases[0].tokenAmount).to.be.eq(buyAmount);

            const vestings = await tokenVesting.getVestings(buyer.address);
            const vesting = vestings[0];

            expect(vesting.startTime).to.be.eq(roundParams.vestingStartTime);
            expect(vesting.endTime).to.be.eq(roundParams.vestingEndTime);
            expect(vesting.cliffTime).eq(roundParams.vestingStartTime + roundParams.vestingCliffPeriod);
            expect(vesting.slicePeriod).to.be.eq(roundParams.vestingSlicePeriod);
            expect(vesting.amount).to.be.eq(buyAmount);

            await time.increase(roundParams.vestingStartTime);
            await tokenVesting.connect(buyer).claimTokens();

            expect(await saleToken.balanceOf(buyer.address)).to.be.eq(buyAmount);
            expect(await saleToken.balanceOf(tokenVesting.target)).to.be.eq(0);
        });

        it("Should correctly buy tokens with WETH", async function () {
            const wethRoundParams = await createRound({ paymentToken: wethToken.target });
            const wethRoundId = 2;
            await time.increaseTo(wethRoundParams.startTime);

            const buyAmount = ethers.parseEther("1000");
            const paymentAmount = await tokenSale.getPaymentAmountForTokens(wethRoundId, buyAmount);

            await tokenSale.connect(buyer).buyTokens(wethRoundId, buyAmount, { value: paymentAmount });

            expect(await wethToken.balanceOf(tokenSale.target)).to.be.eq(paymentAmount);
            expect(await saleToken.balanceOf(tokenVesting.target)).to.be.eq(buyAmount);
            expect(await tokenSale.getTokenAmountForPayment(2, paymentAmount)).to.be.eq(buyAmount);
            expect(await tokenSale.getTotalEarningsForRound(2)).to.be.eq(paymentAmount);

            const userPurchases = await tokenSale.getUserPurchases(buyer.address);
            expect(userPurchases.length).to.be.eq(await tokenSale.getUserPurchasesCount(buyer.address));
            expect(userPurchases[0].roundId).to.be.eq(wethRoundId);
            expect(userPurchases[0].tokenAmount).to.be.eq(buyAmount);

            const vestings = await tokenVesting.getVestings(buyer.address);
            const vesting = vestings[0];

            expect(vesting.startTime).to.be.eq(wethRoundParams.vestingStartTime);
            expect(vesting.endTime).to.be.eq(wethRoundParams.vestingEndTime);
            expect(vesting.cliffTime).eq(wethRoundParams.vestingStartTime + wethRoundParams.vestingCliffPeriod);
            expect(vesting.slicePeriod).to.be.eq(wethRoundParams.vestingSlicePeriod);
            expect(vesting.amount).to.be.eq(buyAmount);

            await time.increase(roundParams.vestingStartTime);
            await tokenVesting.connect(buyer).claimTokens();

            expect(await saleToken.balanceOf(buyer.address)).to.be.eq(buyAmount);
            expect(await saleToken.balanceOf(tokenVesting.target)).to.be.eq(0);
        });

        it("Should correctly buy tokens in several different rounds", async function () {
            // Public Round
            const publicRoundParams = roundParams;
            const publicRoundId = roundId;

            // Private Round
            const privateRoundParams = await createRound({ 
                roundType: 1, 
                paymentToken: wethToken.target, 
                price: TOKEN_PRICE / 2n, 
                tokenAmount: ROUND_TOKEN_AMOUNT * 2n 
            });
            const privateRoundId = 2;

            // Team Round
            const teamRoundParams = await createRound({ 
                roundType: 2, 
                paymentToken: paymentToken.target,
                price: TOKEN_PRICE / 2n,
                tokenAmount: ROUND_TOKEN_AMOUNT * 2n 
            });
            const teamRoundId = 3;
            
            await time.increaseTo(Math.max(publicRoundParams.startTime, privateRoundParams.startTime, teamRoundParams.startTime));

            const publicBuyAmount = ethers.parseEther("1000");
            const publicPaymentAmount = await tokenSale.getPaymentAmountForTokens(publicRoundId, publicBuyAmount);
            await paymentToken.transfer(buyer.address, publicPaymentAmount);
            await paymentToken.connect(buyer).approve(tokenSale.target, publicPaymentAmount);
            await tokenSale.connect(buyer).buyTokens(publicRoundId, publicBuyAmount);

            const privateBuyAmount = ethers.parseEther("500");
            const privatePaymentAmount = await tokenSale.getPaymentAmountForTokens(privateRoundId, privateBuyAmount);
            await tokenSale.connect(buyer).buyTokens(privateRoundId, privateBuyAmount, { value: privatePaymentAmount });

            const teamBuyAmount = ethers.parseEther("2000");
            const teamPaymentAmount = await tokenSale.getPaymentAmountForTokens(teamRoundId, teamBuyAmount);
            await paymentToken.transfer(buyer.address, teamPaymentAmount);
            await paymentToken.connect(buyer).approve(tokenSale.target, teamPaymentAmount);
            await tokenSale.connect(buyer).buyTokens(teamRoundId, teamBuyAmount);

            const userPurchases = await tokenSale.getUserPurchases(buyer.address);
            expect(userPurchases.length).to.be.eq(3);
            expect(userPurchases[0].roundId).to.be.eq(publicRoundId);
            expect(userPurchases[0].tokenAmount).to.be.eq(publicBuyAmount);
            expect(userPurchases[1].roundId).to.be.eq(privateRoundId);
            expect(userPurchases[1].tokenAmount).to.be.eq(privateBuyAmount);
            expect(userPurchases[2].roundId).to.be.eq(teamRoundId);
            expect(userPurchases[2].tokenAmount).to.be.eq(teamBuyAmount);

            expect(await paymentToken.balanceOf(tokenSale.target)).to.be.eq(publicPaymentAmount + teamPaymentAmount);
            expect(await wethToken.balanceOf(tokenSale.target)).to.be.eq(privatePaymentAmount);
            expect(await saleToken.balanceOf(tokenVesting.target)).to.be.eq(publicBuyAmount + privateBuyAmount + teamBuyAmount);

            await time.increaseTo(Math.max(publicRoundParams.vestingEndTime, privateRoundParams.vestingEndTime, teamRoundParams.vestingEndTime));
            await tokenVesting.connect(buyer).claimTokens();

            expect(await saleToken.balanceOf(buyer.address)).to.be.eq(publicBuyAmount + privateBuyAmount + teamBuyAmount);
            expect(await saleToken.balanceOf(tokenVesting.target)).to.be.eq(0);
        });

        it("Should correctly buy tokens in the same round twice", async function () {
            const firstBuyAmount = ethers.parseEther("1000");
            const firstPaymentAmount = await tokenSale.getPaymentAmountForTokens(roundId, firstBuyAmount);
            await paymentToken.transfer(buyer.address, firstPaymentAmount * 2n); 
            await paymentToken.connect(buyer).approve(tokenSale.target, firstPaymentAmount * 2n);
            await tokenSale.connect(buyer).buyTokens(roundId, firstBuyAmount);
    
            const secondBuyAmount = ethers.parseEther("500");
            const secondPaymentAmount = await tokenSale.getPaymentAmountForTokens(roundId, secondBuyAmount);
            await tokenSale.connect(buyer).buyTokens(roundId, secondBuyAmount);
    
            const userPurchases = await tokenSale.getUserPurchases(buyer.address);
            expect(userPurchases.length).to.be.eq(2);
            expect(userPurchases[0].roundId).to.be.eq(roundId);
            expect(userPurchases[0].tokenAmount).to.be.eq(firstBuyAmount);
            expect(userPurchases[1].roundId).to.be.eq(roundId);
            expect(userPurchases[1].tokenAmount).to.be.eq(secondBuyAmount);
    
            expect(await paymentToken.balanceOf(tokenSale.target)).to.be.eq(firstPaymentAmount + secondPaymentAmount);
            expect(await saleToken.balanceOf(tokenVesting.target)).to.be.eq(firstBuyAmount + secondBuyAmount);
    
            const round = await tokenSale.roundsById(roundId);
            expect(round.soldAmount).to.be.eq(firstBuyAmount + secondBuyAmount);

            await time.increaseTo(roundParams.vestingEndTime);
            await tokenVesting.connect(buyer).claimTokens();

            expect(await saleToken.balanceOf(buyer.address)).to.be.eq(firstBuyAmount + secondBuyAmount);
            expect(await saleToken.balanceOf(tokenVesting.target)).to.be.eq(0);
        });

        it("Should correctly return excess of ETH in WETH to sender", async function () {
            const wethRoundParams = await createRound({ paymentToken: wethToken.target });
            const wethRoundId = 2;
            await time.increaseTo(wethRoundParams.startTime);

            const buyAmount = ethers.parseEther("1000");
            const excessAmount = ethers.parseEther("1");
            const paymentAmount = await tokenSale.getPaymentAmountForTokens(wethRoundId, buyAmount);

            await tokenSale.connect(buyer).buyTokens(wethRoundId, buyAmount, { value: paymentAmount + excessAmount });

            expect(await wethToken.balanceOf(buyer.address)).to.be.eq(excessAmount);
            expect(await wethToken.balanceOf(tokenSale.target)).to.be.eq(paymentAmount);
            const userPurchases = await tokenSale.getUserPurchases(buyer.address);
            expect(userPurchases.length).to.be.eq(await tokenSale.getUserPurchasesCount(buyer.address));
            expect(userPurchases[0].roundId).to.be.eq(wethRoundId);
            expect(userPurchases[0].tokenAmount).to.be.eq(buyAmount);
        });

        it("Should prevent when contract is paused", async function () {
            await tokenSale.connect(owner).pause(); 
            await expect(tokenSale.connect(buyer).buyTokens(roundId, 1)).to.be.revertedWithCustomError(tokenSale, "EnforcedPause");
        });

        it("Should prevent if no tokens to buy", async function () {
            await expect(tokenSale.connect(buyer).buyTokens(roundId, 0)).to.be.revertedWithCustomError(tokenSale, "NoTokensToBuy");
        });

        it("Should prevent if round doesn't has enough tokens to buy", async function () {
            const buyAmount = ROUND_TOKEN_AMOUNT + 1n;
            await expect(tokenSale.connect(buyer).buyTokens(roundId, buyAmount))
                .to.be.revertedWithCustomError(tokenSale, "InsufficientTokensInRound");
        });

        it("Should prevent if round is not active", async function () {
            await time.increaseTo(roundParams.endTime + 1);

            const buyAmount = ethers.parseEther("1000");
            await expect(tokenSale.connect(buyer).buyTokens(roundId, buyAmount))
                .to.be.revertedWithCustomError(tokenSale, "RoundNotActive");

            await createRound();
            await expect(tokenSale.connect(buyer).buyTokens(2, buyAmount))
                .to.be.revertedWithCustomError(tokenSale, "RoundNotActive");
        });

        it("Should prevent if ETH sent for ERC20 purchase", async function () {
            const buyAmount = ethers.parseEther("1000");
            await expect(tokenSale.connect(buyer).buyTokens(roundId, buyAmount, { value: 1 }))
                .to.be.revertedWithCustomError(tokenSale, "EthNotAllowedForErc20Purchase");
        });

        it("Should prevent if payment amount is zero", async function () {
            const roundParams = await createRound( { price: 1 } );
            // it happens when (amount tokens to buy * price for token) less than sale token presicion, its okay approach

            await time.increaseTo(roundParams.startTime + 500);
            await expect(tokenSale.connect(buyer).buyTokens(2, 1))
                .to.be.revertedWithCustomError(tokenSale, "PaymentAmountIsZero");
        });

        it("Should prevent if not enough ether sent during buying", async function () {
            const wethRoundParams = await createRound({ paymentToken: wethToken.target });
            const wethRoundId = 2;
            await time.increaseTo(wethRoundParams.startTime);

            await time.increaseTo(wethRoundParams.startTime + 500);
            await expect(tokenSale.connect(buyer).buyTokens(wethRoundId, 100))
                .to.be.revertedWithCustomError(tokenSale, "InsufficientEthSent");
        });
    });

    describe("Admin functionality", function () {
        it("Should correctly withdraw tokens from contract", async function () {
            const withdrawAmount = ethers.parseEther("1000");
            await tokenSale.withdrawTokens(owner.address, saleToken.target, withdrawAmount);

            expect(await saleToken.balanceOf(owner.address)).to.be.eq(withdrawAmount);
            expect(await saleToken.balanceOf(tokenSale.target)).to.be.eq(INITIAL_SUPPLY - withdrawAmount);
        });

        it("Should correctly withdraw all tokens from contract", async function () {
            const withdrawAmount = await saleToken.balanceOf(tokenSale.target);
            await tokenSale.withdrawAllTokens(saleToken.target);

            expect(await saleToken.balanceOf(owner.address)).to.be.eq(withdrawAmount);
            expect(await saleToken.balanceOf(tokenSale.target)).to.be.eq(0);
        });

        it("Should allow owner to pause and unpause the contract", async function () {
            await tokenSale.pause();
            expect(await tokenSale.paused()).to.be.true;

            await tokenSale.unpause();
            expect(await tokenSale.paused()).to.be.false;
        });

        it("Should revert if non-owner tries to withdraw tokens", async function () {
            await expect(tokenSale.connect(otherAccount).withdrawTokens(buyer.address, saleToken.target, 1))
                .to.be.revertedWithCustomError(tokenSale, "OwnableUnauthorizedAccount");
            await expect(tokenSale.connect(otherAccount).withdrawAllTokens(saleToken.target))
                .to.be.revertedWithCustomError(tokenSale, "OwnableUnauthorizedAccount");
        });

        it("Should revert if non-owner tries to pause", async function () {
            await expect(tokenSale.connect(otherAccount).pause())
                .to.be.revertedWithCustomError(tokenSale, "OwnableUnauthorizedAccount");
            await expect(tokenSale.connect(otherAccount).unpause())
                .to.be.revertedWithCustomError(tokenSale, "OwnableUnauthorizedAccount");
        });
    });
});