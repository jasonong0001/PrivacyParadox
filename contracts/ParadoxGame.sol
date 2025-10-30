// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint8, ebool, externalEuint8} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title Encrypted Twenty One Game
/// @notice Players receive an encrypted random number and submit encrypted guesses that must sum to 21.
contract ParadoxGame is SepoliaConfig {
    struct GameSession {
        euint8 secretNumber;
        ebool result;
        bool hasActiveGame;
        bool hasResult;
    }

    mapping(address => GameSession) private _sessions;

    event GameStarted(address indexed player, euint8 encryptedNumber);
    event GuessSubmitted(address indexed player, ebool isCorrect);

    /// @notice Starts a new game session for the caller and returns the encrypted secret number.
    /// @return The encrypted secret number assigned to the player.
    function startGame() external returns (euint8) {
        uint256 randomSeed = uint256(
            keccak256(
                abi.encode(
                    block.prevrandao,
                    block.timestamp,
                    block.number,
                    address(this),
                    msg.sender,
                    _sessions[msg.sender].hasActiveGame,
                    _sessions[msg.sender].hasResult
                )
            )
        );
        uint8 secretValue = uint8((randomSeed % 20) + 1);

        euint8 encryptedSecret = FHE.asEuint8(secretValue);

        GameSession storage session = _sessions[msg.sender];
        session.secretNumber = encryptedSecret;
        session.hasActiveGame = true;
        session.hasResult = false;

        FHE.allowThis(encryptedSecret);
        FHE.allow(encryptedSecret, msg.sender);

        emit GameStarted(msg.sender, encryptedSecret);
        return encryptedSecret;
    }

    /// @notice Submits an encrypted guess for the active game session.
    /// @param encryptedGuess The encrypted guess handle provided by the relayer SDK.
    /// @param inputProof The proof associated with the encrypted guess.
    /// @return A bool in encrypted form indicating whether the guess was correct.
    function submitEncryptedGuess(
        externalEuint8 encryptedGuess,
        bytes calldata inputProof
    ) external returns (ebool) {
        GameSession storage session = _sessions[msg.sender];
        require(session.hasActiveGame, "No active game");

        euint8 playerGuess = FHE.fromExternal(encryptedGuess, inputProof);

        euint8 target = FHE.asEuint8(21);
        euint8 total = FHE.add(session.secretNumber, playerGuess);
        ebool isCorrect = FHE.eq(total, target);

        session.result = isCorrect;
        session.hasActiveGame = false;
        session.hasResult = true;

        FHE.allowThis(isCorrect);
        FHE.allow(isCorrect, msg.sender);

        emit GuessSubmitted(msg.sender, isCorrect);
        return isCorrect;
    }

    /// @notice Returns the encrypted secret number previously assigned to a player.
    /// @dev View functions must not rely on msg.sender, so the address is provided explicitly.
    function getEncryptedSecret(address player) external view returns (euint8) {
        return _sessions[player].secretNumber;
    }

    /// @notice Returns the encrypted result of the latest game for a player.
    function getEncryptedResult(address player) external view returns (ebool) {
        return _sessions[player].result;
    }

    /// @notice Indicates whether a player currently has an active game session.
    function hasActiveGame(address player) external view returns (bool) {
        return _sessions[player].hasActiveGame;
    }

    /// @notice Indicates whether a player has a stored result ready for decryption.
    function hasResult(address player) external view returns (bool) {
        return _sessions[player].hasResult;
    }
}
