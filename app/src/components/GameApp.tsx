import { useEffect, useMemo, useState } from 'react';
import { Contract } from 'ethers';
import { useAccount, useReadContract } from 'wagmi';
import { isAddress, type Address } from 'viem';

import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '../config/contracts';
import '../styles/GameApp.css';

type DecryptionTarget = 'secret' | 'result';

const ZERO_HANDLE_REGEX = /^0x0+$/i;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

function isZeroCiphertext(value?: unknown): boolean {
  if (typeof value !== 'string') {
    return true;
  }
  return ZERO_HANDLE_REGEX.test(value);
}

export function GameApp() {
  const { address, isConnected } = useAccount();
  const { instance, isLoading: isZamaLoading, error: zamaError } = useZamaInstance();
  const signerPromise = useEthersSigner();

  const [activeContractAddress, setActiveContractAddress] = useState(CONTRACT_ADDRESS.trim());
  const [addressInput, setAddressInput] = useState(CONTRACT_ADDRESS);
  const [secretValue, setSecretValue] = useState<number | null>(null);
  const [guessInput, setGuessInput] = useState('');
  const [resultValue, setResultValue] = useState<boolean | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDecryptingSecret, setIsDecryptingSecret] = useState(false);
  const [isDecryptingResult, setIsDecryptingResult] = useState(false);

  const normalizedContractAddress = useMemo<Address | undefined>(() => {
    const normalized = activeContractAddress.trim();
    if (!isAddress(normalized) || normalized === ZERO_ADDRESS) {
      return undefined;
    }
    return normalized as Address;
  }, [activeContractAddress]);

  const isContractConfigured = Boolean(normalizedContractAddress);

  const hasActiveGameQuery = useReadContract({
    address: normalizedContractAddress,
    abi: CONTRACT_ABI,
    functionName: 'hasActiveGame',
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address) && isContractConfigured,
    },
  });

  const hasResultQuery = useReadContract({
    address: normalizedContractAddress,
    abi: CONTRACT_ABI,
    functionName: 'hasResult',
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address) && isContractConfigured,
    },
  });

  const encryptedSecretQuery = useReadContract({
    address: normalizedContractAddress,
    abi: CONTRACT_ABI,
    functionName: 'getEncryptedSecret',
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address) && isContractConfigured,
    },
  });

  const encryptedResultQuery = useReadContract({
    address: normalizedContractAddress,
    abi: CONTRACT_ABI,
    functionName: 'getEncryptedResult',
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address) && isContractConfigured,
    },
  });

  const hasActiveGame = Boolean(hasActiveGameQuery.data);
  const hasResult = Boolean(hasResultQuery.data);
  const encryptedSecret = encryptedSecretQuery.data as string | undefined;
  const encryptedResult = encryptedResultQuery.data as string | undefined;

  useEffect(() => {
    if (!hasResult) {
      setResultValue(null);
    }
    if (!hasActiveGame) {
      setSecretValue(null);
    }
  }, [hasActiveGame, hasResult]);

  useEffect(() => {
    if (!isContractConfigured) {
      setSecretValue(null);
      setResultValue(null);
    }
  }, [isContractConfigured]);

  const guessComplement = useMemo(() => {
    if (secretValue === null) {
      return '';
    }
    const complement = 21 - secretValue;
    if (complement < 0) {
      return '0';
    }
    return String(complement);
  }, [secretValue]);

  const addressPreview = useMemo(() => {
    if (!normalizedContractAddress) {
      return 'Not configured';
    }
    return `${normalizedContractAddress.slice(0, 6)}...${normalizedContractAddress.slice(-4)}`;
  }, [normalizedContractAddress]);

  useEffect(() => {
    if (guessComplement !== '') {
      setGuessInput(guessComplement);
    }
  }, [guessComplement]);

  const resetQueries = async () => {
    if (!normalizedContractAddress) {
      return;
    }

    await Promise.all([
      hasActiveGameQuery.refetch(),
      hasResultQuery.refetch(),
      encryptedSecretQuery.refetch(),
      encryptedResultQuery.refetch(),
    ]);
  };

  const handleApplyContractAddress = () => {
    const normalized = addressInput.trim();

    if (!isAddress(normalized) || normalized === ZERO_ADDRESS) {
      setStatusMessage('Enter a valid deployed contract address on Sepolia.');
      return;
    }

    setActiveContractAddress(normalized);
    setSecretValue(null);
    setResultValue(null);
    setGuessInput('');
    setStatusMessage('Contract address configured.');
  };

  const decryptHandle = async (handle: string, target: DecryptionTarget): Promise<number> => {
    const contractAddress = normalizedContractAddress;
    if (!instance || !address || !signerPromise || !contractAddress) {
      throw new Error('Missing FHE prerequisites');
    }

    const keypair = instance.generateKeypair();
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const durationDays = '10';
    const contracts = [contractAddress];
    const eip712 = instance.createEIP712(keypair.publicKey, contracts, timestamp, durationDays);

    const signer = await signerPromise;
    if (!signer) {
      throw new Error('Wallet signer unavailable');
    }

    const signature = await signer.signTypedData(
      eip712.domain,
      { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
      eip712.message
    );

    const response = await instance.userDecrypt(
      [
        {
          handle,
          contractAddress,
        },
      ],
      keypair.privateKey,
      keypair.publicKey,
      signature.replace('0x', ''),
      contracts,
      address,
      timestamp,
      durationDays
    );

    const decryptedValue = response[handle];
    if (!decryptedValue) {
      throw new Error(`Unable to decrypt ${target}`);
    }

    return Number(decryptedValue);
  };

  const handleStartGame = async () => {
    const contractAddress = normalizedContractAddress;
    if (!contractAddress) {
      setStatusMessage('Set the game contract address before starting.');
      return;
    }

    if (!address || !signerPromise) {
      setStatusMessage('Connect your wallet to start.');
      return;
    }

    try {
      setIsSubmitting(true);
      setStatusMessage('Starting encrypted game...');

      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Wallet signer unavailable');
      }

      const contract = new Contract(contractAddress, CONTRACT_ABI, signer);
      const tx = await contract.startGame();
      await tx.wait();

      setStatusMessage('Encrypted number assigned. Decrypt to reveal it.');
      setResultValue(null);
      await resetQueries();
    } catch (error) {
      console.error('startGame failed:', error);
      setStatusMessage(
        error instanceof Error ? `Failed to start game: ${error.message}` : 'Failed to start game.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDecryptSecret = async () => {
    const contractAddress = normalizedContractAddress;
    if (!contractAddress) {
      setStatusMessage('Set the game contract address before decrypting.');
      return;
    }

    if (!address || !instance) {
      setStatusMessage('Connect wallet and wait for encryption service.');
      return;
    }

    if (!encryptedSecret || isZeroCiphertext(encryptedSecret)) {
      setStatusMessage('No encrypted number available yet. Start a game first.');
      return;
    }

    try {
      setIsDecryptingSecret(true);
      setStatusMessage('Decrypting your secret number...');
      const value = await decryptHandle(encryptedSecret, 'secret');
      setSecretValue(value);
      setStatusMessage('Secret number decrypted locally. Compute your response to reach 21.');
    } catch (error) {
      console.error('secret decryption failed:', error);
      setStatusMessage(
        error instanceof Error ? `Failed to decrypt secret: ${error.message}` : 'Failed to decrypt secret.'
      );
    } finally {
      setIsDecryptingSecret(false);
    }
  };

  const handleSubmitGuess = async () => {
    const contractAddress = normalizedContractAddress;
    if (!contractAddress) {
      setStatusMessage('Set the game contract address before submitting.');
      return;
    }

    if (!address || !instance || !signerPromise) {
      setStatusMessage('Connect wallet and wait for encryption service.');
      return;
    }

    const parsedGuess = Number(guessInput);
    if (!Number.isInteger(parsedGuess) || parsedGuess < 0 || parsedGuess > 21) {
      setStatusMessage('Provide an integer guess between 0 and 21.');
      return;
    }

    try {
      setIsSubmitting(true);
      setStatusMessage('Encrypting your answer and submitting...');

      const inputBuffer = instance.createEncryptedInput(contractAddress, address);
      inputBuffer.add8(parsedGuess);
      const encryptedInput = await inputBuffer.encrypt();

      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Wallet signer unavailable');
      }

      const contract = new Contract(contractAddress, CONTRACT_ABI, signer);
      const tx = await contract.submitEncryptedGuess(
        encryptedInput.handles[0],
        encryptedInput.inputProof
      );
      await tx.wait();

      setStatusMessage('Guess submitted. Decrypt the result to check correctness.');
      await resetQueries();
    } catch (error) {
      console.error('submitEncryptedGuess failed:', error);
      setStatusMessage(
        error instanceof Error ? `Failed to submit guess: ${error.message}` : 'Failed to submit guess.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDecryptResult = async () => {
    const contractAddress = normalizedContractAddress;
    if (!contractAddress) {
      setStatusMessage('Set the game contract address before decrypting results.');
      return;
    }

    if (!address || !instance) {
      setStatusMessage('Connect wallet and wait for encryption service.');
      return;
    }

    if (!encryptedResult || isZeroCiphertext(encryptedResult)) {
      setStatusMessage('No encrypted result available. Submit a guess first.');
      return;
    }

    try {
      setIsDecryptingResult(true);
      setStatusMessage('Decrypting the game result...');
      const value = await decryptHandle(encryptedResult, 'result');
      setResultValue(value === 1);
      setStatusMessage(value === 1 ? 'Success! Your numbers sum to 21.' : 'Not quite. Try another round.');
    } catch (error) {
      console.error('result decryption failed:', error);
      setStatusMessage(
        error instanceof Error ? `Failed to decrypt result: ${error.message}` : 'Failed to decrypt result.'
      );
    } finally {
      setIsDecryptingResult(false);
    }
  };

  return (
    <div className="game-app">
      <header className="game-app__header">
        <h2 className="game-app__subtitle">Encrypted Twenty One Challenge</h2>
        <p className="game-app__description">
          Start a session to receive an encrypted random number between 1 and 20. Decrypt it locally, compute the
          complement to 21, encrypt your answer with Zama, and submit it back on-chain. Finally, decrypt the encrypted
          result to see if you won.
        </p>
      </header>

      <div className="game-app__card">
        <section className="game-section">
          <h3 className="game-section__title">0. Configure Contract</h3>
          <p className="game-section__text">
            Provide the Sepolia address of your deployed TwentyOneGame contract. All reads use viem while writes use
            ethers. The address is kept in-memory for this session only.
          </p>
          <div className="input-group">
            <label htmlFor="contract-address" className="input-label">Contract address</label>
            <input
              id="contract-address"
              type="text"
              value={addressInput}
              onChange={(event) => setAddressInput(event.target.value)}
              className="address-input"
              placeholder="0x..."
              spellCheck={false}
            />
          </div>
          <div className="button-row">
            <button className="secondary-button" onClick={handleApplyContractAddress}>
              Apply Address
            </button>
          </div>
          <div className="status-line">
            <span className="status-line__label">Active contract:</span>
            <span className="status-line__value">{addressPreview}</span>
          </div>
        </section>

        <section className="game-section">
          <h3 className="game-section__title">1. Start Session</h3>
          <p className="game-section__text">
            Launch a new round to lock an encrypted secret number for your address. Each session stores a single number
            until you submit a guess.
          </p>
          <button
            className="primary-button"
            onClick={handleStartGame}
            disabled={!isConnected || isSubmitting || isZamaLoading || !isContractConfigured}
          >
            {isSubmitting ? 'Processing...' : 'Start Game'}
          </button>
          <div className="status-line">
            <span className="status-line__label">Active session:</span>
            <span className="status-line__value">
              {isContractConfigured ? (hasActiveGame ? 'Yes' : 'No') : 'Awaiting contract'}
            </span>
          </div>
        </section>

        <section className="game-section">
          <h3 className="game-section__title">2. Decrypt Secret</h3>
          <p className="game-section__text">
            Use the Zama Relayer to decrypt your ciphertext locally. The secret number never leaves your browser.
          </p>
          <button
            className="secondary-button"
            onClick={handleDecryptSecret}
            disabled={isDecryptingSecret || !hasActiveGame || isZamaLoading || !isContractConfigured}
          >
            {isDecryptingSecret ? 'Decrypting...' : 'Decrypt Secret Number'}
          </button>
          <div className="status-line">
            <span className="status-line__label">Decrypted value:</span>
            <span className="status-line__value">
              {secretValue === null ? 'Hidden' : secretValue}
            </span>
          </div>
          <div className="helper-text">
            {!isContractConfigured
              ? 'Configure the contract address to enable decryption.'
              : secretValue === null
                ? 'After decrypting, compute the number that makes the sum equal 21.'
                : `Suggested complement: ${guessComplement || '0'}`}
          </div>
        </section>

        <section className="game-section">
          <h3 className="game-section__title">3. Encrypt &amp; Submit Guess</h3>
          <p className="game-section__text">
            Enter the number you want to encrypt. We will register it through the relayer and submit the encrypted handle
            to the smart contract using ethers.
          </p>
          <div className="input-group">
            <label htmlFor="guess" className="input-label">Your guess (0 - 21)</label>
            <input
              id="guess"
              type="number"
              min={0}
              max={21}
              value={guessInput}
              onChange={(event) => setGuessInput(event.target.value)}
              className="number-input"
              placeholder="e.g. 12"
            />
          </div>
          <button
            className="primary-button"
            onClick={handleSubmitGuess}
            disabled={isSubmitting || isZamaLoading || !hasActiveGame || !isContractConfigured}
          >
            {isSubmitting ? 'Submitting...' : 'Encrypt Guess'}
          </button>
        </section>

        <section className="game-section">
          <h3 className="game-section__title">4. Reveal Result</h3>
          <p className="game-section__text">
            Once the contract processes your encrypted guess, decrypt the resulting encrypted boolean to verify if the
            two numbers equal 21.
          </p>
          <button
            className="secondary-button"
            onClick={handleDecryptResult}
            disabled={isDecryptingResult || !hasResult || isZamaLoading || !isContractConfigured}
          >
            {isDecryptingResult ? 'Decrypting...' : 'Decrypt Result'}
          </button>
          <div className="status-line">
            <span className="status-line__label">Outcome:</span>
            <span className={
              resultValue === null
                ? 'status-line__value'
                : resultValue
                  ? 'status-line__value--success'
                  : 'status-line__value--error'
            }>
              {!isContractConfigured
                ? 'Awaiting contract'
                : resultValue === null
                  ? 'Awaiting decryption'
                  : resultValue
                    ? 'Correct! 🎉'
                    : 'Incorrect 😅'}
            </span>
          </div>
        </section>
      </div>

      <footer className="game-app__footer">
        <div className="footer-grid">
          <div>
            <h4 className="footer-title">Relayer Status</h4>
            <p className="footer-text">
              {isZamaLoading ? 'Initializing Zama SDK...' : zamaError ? zamaError : 'FHE services ready.'}
            </p>
          </div>
          <div>
            <h4 className="footer-title">Game Notes</h4>
            <ul className="footer-list">
              <li>Active contract: {addressPreview}</li>
              <li>Random numbers are generated on-chain per session.</li>
              <li>Only your wallet can decrypt assigned secrets and outcomes.</li>
              <li>Start a new round anytime after decrypting the result.</li>
            </ul>
          </div>
        </div>
        {statusMessage && <p className="status-message">{statusMessage}</p>}
      </footer>
    </div>
  );
}
