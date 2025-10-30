import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

/**
 * Tutorial: Deploy and Interact Locally (--network localhost)
 * ===========================================================
 *
 * 1. From a separate terminal window:
 *
 *   npx hardhat node
 *
 * 2. Deploy the TwentyOneGame contract
 *
 *   npx hardhat --network localhost deploy
 *
 * 3. Interact with the TwentyOneGame contract
 *
 *   npx hardhat --network localhost task:start-game
 *   npx hardhat --network localhost task:decrypt-secret
 *   npx hardhat --network localhost task:submit-guess --guess 10
 *
 *
 * Tutorial: Deploy and Interact on Sepolia (--network sepolia)
 * ===========================================================
 *
 * 1. Deploy the TwentyOneGame contract
 *
 *   npx hardhat --network sepolia deploy
 *
 * 2. Interact with the TwentyOneGame contract
 *
 *   npx hardhat --network sepolia task:start-game
 *   npx hardhat --network sepolia task:submit-guess --guess 12
 *
 */

/**
 * Example:
 *   - npx hardhat --network localhost task:address
 *   - npx hardhat --network sepolia task:address
 */
task("task:address", "Prints the TwentyOneGame address").setAction(async function (_taskArguments: TaskArguments, hre) {
  const { deployments } = hre;

  const twentyOneGame = await deployments.get("TwentyOneGame");

  console.log("TwentyOneGame address is " + twentyOneGame.address);
});

/**
 * Example:
 *   - npx hardhat --network localhost task:decrypt-count
 *   - npx hardhat --network sepolia task:decrypt-count
 */
task("task:decrypt-secret", "Decrypt the secret number for a player")
  .addOptionalParam("address", "Optionally specify the game contract address")
  .addOptionalParam("player", "Address whose secret should be decrypted")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const deployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("TwentyOneGame");
    console.log(`TwentyOneGame: ${deployment.address}`);

    const signers = await ethers.getSigners();
    const targetAddress = taskArguments.player ?? signers[0].address;

    const gameContract = await ethers.getContractAt("TwentyOneGame", deployment.address);

    const encryptedSecret = await gameContract.getEncryptedSecret(targetAddress);
    const clearSecret = await fhevm.userDecryptEuint(
      FhevmType.euint8,
      encryptedSecret,
      deployment.address,
      signers[0],
    );
    console.log(`Encrypted secret: ${encryptedSecret}`);
    console.log(`Clear secret    : ${clearSecret}`);
  });

task("task:start-game", "Starts a new game and decrypts the assigned secret")
  .addOptionalParam("address", "Optionally specify the game contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const deployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("TwentyOneGame");
    console.log(`TwentyOneGame: ${deployment.address}`);

    const signers = await ethers.getSigners();

    const gameContract = await ethers.getContractAt("TwentyOneGame", deployment.address);

    const tx = await gameContract.connect(signers[0]).startGame();
    const receipt = await tx.wait();
    console.log(`startGame tx: ${tx.hash} status=${receipt?.status}`);

    const encryptedSecret = await gameContract.getEncryptedSecret(signers[0].address);
    const clearSecret = await fhevm.userDecryptEuint(
      FhevmType.euint8,
      encryptedSecret,
      deployment.address,
      signers[0],
    );

    console.log("Encrypted secret:", encryptedSecret);
    console.log("Clear secret   :", clearSecret);
  });

task("task:submit-guess", "Submits an encrypted guess and decrypts the result")
  .addOptionalParam("address", "Optionally specify the game contract address")
  .addParam("guess", "The guess that should complement to 21")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    const value = parseInt(taskArguments.guess);
    if (!Number.isInteger(value)) {
      throw new Error(`Argument --guess is not an integer`);
    }
    if (value < 0 || value > 21) {
      throw new Error(`Argument --guess must be between 0 and 21`);
    }

    await fhevm.initializeCLIApi();

    const deployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("TwentyOneGame");
    console.log(`TwentyOneGame: ${deployment.address}`);

    const signers = await ethers.getSigners();

    const gameContract = await ethers.getContractAt("TwentyOneGame", deployment.address);

    const encryptedInput = await fhevm
      .createEncryptedInput(deployment.address, signers[0].address)
      .add8(value)
      .encrypt();

    const tx = await gameContract
      .connect(signers[0])
      .submitEncryptedGuess(encryptedInput.handles[0], encryptedInput.inputProof);
    console.log(`Wait for tx:${tx.hash}...`);

    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);

    const encryptedResult = await gameContract.getEncryptedResult(signers[0].address);
    const clearResult = await fhevm.userDecryptEbool(
      encryptedResult,
      deployment.address,
      signers[0],
    );

    console.log("Encrypted result:", encryptedResult);
    console.log("Was correct    :", clearResult);
  });
