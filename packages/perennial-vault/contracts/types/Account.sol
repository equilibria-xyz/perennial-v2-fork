// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.13;

import "@equilibria/root/number/types/UFixed6.sol";
import "./Checkpoint.sol";

/// @dev Account type
struct Account {
    /// @dev The current position id
    uint256 current;

    /// @dev The latest position id
    uint256 latest;

    /// @dev The total shares
    UFixed6 shares;

    /// @dev The total assets
    UFixed6 assets;

    /// @dev The amount of pending deposits
    UFixed6 deposit;

    /// @dev The amount of pending redemptions
    UFixed6 redemption;
}
using AccountLib for Account global;
struct StoredAccount {
    uint32 _current;
    uint32 _latest;
    uint48 _shares;
    uint48 _assets;
    uint48 _deposit;
    uint48 _redemption;
}
struct AccountStorage { StoredAccount value; }
using AccountStorageLib for AccountStorage global;


/// @title Account
/// @notice Holds the state for the account type
library AccountLib {
    /// @notice Processes the position in a global context
    /// @param self The account to update
    /// @param latestId The latest position id
    /// @param checkpoint The checkpoint to process
    /// @param deposit The amount of pending deposits
    /// @param redemption The amount of pending redemptions
    function processGlobal(
        Account memory self,
        uint256 latestId,
        Checkpoint memory checkpoint,
        UFixed6 deposit,
        UFixed6 redemption
    ) internal pure {
        self.latest = latestId;
        (self.assets, self.shares) = (
            self.assets.add(checkpoint.toAssetsGlobal(redemption)),
            self.shares.add(checkpoint.toSharesGlobal(deposit))
        );
        (self.deposit, self.redemption) = (self.deposit.sub(deposit), self.redemption.sub(redemption));
    }

    /// @notice Processes the position in a local context
    /// @param self The account to update
    /// @param latestId The latest position id
    /// @param checkpoint The checkpoint to process
    /// @param deposit The amount of pending deposits to clear
    /// @param redemption The amount of pending redemptions to clear
    function processLocal(
        Account memory self,
        uint256 latestId,
        Checkpoint memory checkpoint,
        UFixed6 deposit,
        UFixed6 redemption
    ) internal pure {
        self.latest = latestId;
        (self.assets, self.shares) = (
            self.assets.add(checkpoint.toAssetsLocal(redemption)),
            self.shares.add(checkpoint.toSharesLocal(deposit))
        );
        (self.deposit, self.redemption) = (self.deposit.sub(deposit), self.redemption.sub(redemption));
    }

    /// @notice Updates the account with a new order
    /// @param self The account to update
    /// @param currentId The current position id
    /// @param assets The amount of assets to deduct
    /// @param shares The amount of shares to deduct
    /// @param deposit The amount of pending deposits
    /// @param redemption The amount of pending redemptions
    function update(
        Account memory self,
        uint256 currentId,
        UFixed6 assets,
        UFixed6 shares,
        UFixed6 deposit,
        UFixed6 redemption
    ) internal pure {
        self.current = currentId;
        (self.assets, self.shares) = (self.assets.sub(assets), self.shares.sub(shares));
        (self.deposit, self.redemption) = (self.deposit.add(deposit), self.redemption.add(redemption));
    }
}

library AccountStorageLib {
    error AccountStorageInvalidError();

    function read(AccountStorage storage self) internal view returns (Account memory) {
        StoredAccount memory storedValue = self.value;
        return Account(
            uint256(storedValue._current),
            uint256(storedValue._latest),
            UFixed6.wrap(uint256(storedValue._shares)),
            UFixed6.wrap(uint256(storedValue._assets)),
            UFixed6.wrap(uint256(storedValue._deposit)),
            UFixed6.wrap(uint256(storedValue._redemption))
        );
    }

    function store(AccountStorage storage self, Account memory newValue) internal {
        if (newValue.current > uint256(type(uint32).max)) revert AccountStorageInvalidError();
        if (newValue.latest > uint256(type(uint32).max)) revert AccountStorageInvalidError();
        if (newValue.shares.gt(UFixed6.wrap(type(uint48).max))) revert AccountStorageInvalidError();
        if (newValue.assets.gt(UFixed6.wrap(type(uint48).max))) revert AccountStorageInvalidError();
        if (newValue.deposit.gt(UFixed6.wrap(type(uint48).max))) revert AccountStorageInvalidError();
        if (newValue.redemption.gt(UFixed6.wrap(type(uint48).max))) revert AccountStorageInvalidError();

        self.value = StoredAccount(
            uint32(newValue.current),
            uint32(newValue.latest),
            uint48(UFixed6.unwrap(newValue.shares)),
            uint48(UFixed6.unwrap(newValue.assets)),
            uint48(UFixed6.unwrap(newValue.deposit)),
            uint48(UFixed6.unwrap(newValue.redemption))
        );
    }
}
