import hre from "hardhat";

function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
    const [signer] = await hre.ethers.getSigners();

    const tokenAddress = "TokenAddress";
    const ownerAddress = "OwnerAddress";

    const TokenVestingFactory = await hre.ethers.getContractFactory("TokenVesting", signer);
    const tokenVesting = await TokenVestingFactory.deploy(ownerAddress, tokenAddress);

    await tokenVesting.waitForDeployment();

    console.log("TokenVesting contract deployed to:", tokenVesting.target);

    console.log("Waiting for block confirmations...");
    await delay(30000); // Wait for 30 seconds before verifying the contract

    await hre.run("verify:verify", {
        address: tokenVesting.target,
        constructorArguments: [ownerAddress, tokenAddress],
    });
}

main().then(res => res).catch(err => console.log(err));
