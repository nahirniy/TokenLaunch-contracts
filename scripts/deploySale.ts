import hre from "hardhat";

function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
    const [signer] = await hre.ethers.getSigners();

    const saleTokenAddress = "TokenAddress";
    const wethTokenAddress = "TokenAddress";
    const ownerAddress = "OwnerAddress";

    const TokenVestingFactory = await hre.ethers.getContractFactory("TokenSale", signer);
    const tokenVesting = await TokenVestingFactory.deploy(saleTokenAddress, wethTokenAddress, ownerAddress);

    await tokenVesting.waitForDeployment();

    console.log("TokenVesting contract deployed to:", tokenVesting.target);

    console.log("Waiting for block confirmations...");
    await delay(30000); // Wait for 30 seconds before verifying the contract

    await hre.run("verify:verify", {
        address: tokenVesting.target,
        constructorArguments: [saleTokenAddress, wethTokenAddress, ownerAddress],
    });
}

main().then(res => res).catch(err => console.log(err));
