import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm, deployments } from "hardhat";
import { TwentyOneGame } from "../types";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Signers = {
  alice: HardhatEthersSigner;
};

describe("TwentyOneGameSepolia", function () {
  let signers: Signers;
  let gameContract: TwentyOneGame;
  let gameContractAddress: string;
  let step: number;
  let steps: number;

  function progress(message: string) {
    console.log(`${++step}/${steps} ${message}`);
  }

  before(async function () {
    if (fhevm.isMock) {
      console.warn(`This hardhat test suite can only run on Sepolia Testnet`);
      this.skip();
    }

    try {
      const gameDeployment = await deployments.get("TwentyOneGame");
      gameContractAddress = gameDeployment.address;
      gameContract = await ethers.getContractAt("TwentyOneGame", gameDeployment.address);
    } catch (e) {
      (e as Error).message += ". Call 'npx hardhat deploy --network sepolia'";
      throw e;
    }

    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { alice: ethSigners[0] };
  });

  beforeEach(async () => {
    step = 0;
    steps = 0;
  });

  it("completes a full game round on Sepolia", async function () {
    steps = 9;

    this.timeout(4 * 40000);

    progress("Calling startGame()...");
    const startTx = await gameContract.connect(signers.alice).startGame();
    await startTx.wait();

    progress("Fetching encrypted secret...");
    const encryptedSecret = await gameContract.getEncryptedSecret(signers.alice.address);
    expect(encryptedSecret).to.not.eq(ethers.ZeroHash);

    progress("Decrypting secret...");
    const clearSecret = await fhevm.userDecryptEuint(
      FhevmType.euint8,
      encryptedSecret,
      gameContractAddress,
      signers.alice,
    );
    const secretValue = Number(clearSecret);
    progress(`Decrypted secret=${secretValue}`);

    progress("Encrypting complement guess...");
    const complement = 21 - secretValue;
    const encryptedGuess = await fhevm
      .createEncryptedInput(gameContractAddress, signers.alice.address)
      .add8(complement)
      .encrypt();

    progress("Submitting encrypted guess...");
    const submitTx = await gameContract
      .connect(signers.alice)
      .submitEncryptedGuess(encryptedGuess.handles[0], encryptedGuess.inputProof);
    await submitTx.wait();

    progress("Retrieving encrypted result...");
    const encryptedResult = await gameContract.getEncryptedResult(signers.alice.address);

    progress("Decrypting result...");
    const clearResult = await fhevm.userDecryptEuint(
      FhevmType.ebool,
      encryptedResult,
      gameContractAddress,
      signers.alice,
    );
    progress(`Clear result=${clearResult}`);

    expect(clearResult).to.eq(1n);
  });
});
