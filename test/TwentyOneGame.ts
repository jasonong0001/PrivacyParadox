import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { TwentyOneGame, TwentyOneGame__factory } from "../types";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

async function deployFixture() {
  const factory = (await ethers.getContractFactory("TwentyOneGame")) as TwentyOneGame__factory;
  const gameContract = (await factory.deploy()) as TwentyOneGame;
  const gameContractAddress = await gameContract.getAddress();

  return { gameContract, gameContractAddress };
}

describe("TwentyOneGame", function () {
  let signers: Signers;
  let gameContract: TwentyOneGame;
  let gameContractAddress: string;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { deployer: ethSigners[0], alice: ethSigners[1], bob: ethSigners[2] };
  });

  beforeEach(async function () {
    // Check whether the tests are running against an FHEVM mock environment
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }

    ({ gameContract, gameContractAddress } = await deployFixture());
  });

  describe("startGame", function () {
    it("assigns an encrypted secret within range and marks session active", async function () {
      const startTx = await gameContract.connect(signers.alice).startGame();
      await startTx.wait();

      const encryptedSecret = await gameContract.getEncryptedSecret(signers.alice.address);
      const clearSecret = await fhevm.userDecryptEuint(
        FhevmType.euint8,
        encryptedSecret,
        gameContractAddress,
        signers.alice,
      );

      const secretValue = Number(clearSecret);

      expect(secretValue).to.be.gte(1);
      expect(secretValue).to.be.lte(20);
      expect(await gameContract.hasActiveGame(signers.alice.address)).to.eq(true);
      expect(await gameContract.hasResult(signers.alice.address)).to.eq(false);
    });
  });

  describe("submitEncryptedGuess", function () {
    it("returns true when the guess complements the secret to 21", async function () {
      const startTx = await gameContract.connect(signers.alice).startGame();
      await startTx.wait();

      const encryptedSecret = await gameContract.getEncryptedSecret(signers.alice.address);
      const clearSecret = await fhevm.userDecryptEuint(
        FhevmType.euint8,
        encryptedSecret,
        gameContractAddress,
        signers.alice,
      );

      const secretValue = Number(clearSecret);
      const complement = 21 - secretValue;
      const encryptedGuess = await fhevm
        .createEncryptedInput(gameContractAddress, signers.alice.address)
        .add8(complement)
        .encrypt();

      const submitTx = await gameContract
        .connect(signers.alice)
        .submitEncryptedGuess(encryptedGuess.handles[0], encryptedGuess.inputProof);
      await submitTx.wait();

      const encryptedResult = await gameContract.getEncryptedResult(signers.alice.address);
      const clearResult = await fhevm.userDecryptEbool(encryptedResult, gameContractAddress, signers.alice);

      expect(clearResult).to.eq(true);
      expect(await gameContract.hasActiveGame(signers.alice.address)).to.eq(false);
      expect(await gameContract.hasResult(signers.alice.address)).to.eq(true);
    });

    it("returns false when the guess does not complement the secret", async function () {
      const startTx = await gameContract.connect(signers.alice).startGame();
      await startTx.wait();

      const encryptedGuess = await fhevm
        .createEncryptedInput(gameContractAddress, signers.alice.address)
        .add8(0)
        .encrypt();

      const submitTx = await gameContract
        .connect(signers.alice)
        .submitEncryptedGuess(encryptedGuess.handles[0], encryptedGuess.inputProof);
      await submitTx.wait();

      const encryptedResult = await gameContract.getEncryptedResult(signers.alice.address);
      const clearResult = await fhevm.userDecryptEbool(encryptedResult, gameContractAddress, signers.alice);

      expect(clearResult).to.eq(false);
  });
  });
});
