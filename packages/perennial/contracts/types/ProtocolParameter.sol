// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.13;

import "@equilibria/root-v2/contracts/UFixed6.sol";

/// @dev ProtocolParameter type
struct ProtocolParameter {
    UFixed6 protocolFee;    // <= 1677%
    UFixed6 minFundingFee;  // <= 1677%
    UFixed6 liquidationFee; // <= 1677%
    UFixed6 minCollateral;  // <= 281mn
    UFixed6 minSpread; // <= 1677%
    bool paused;
}
struct StoredProtocolParameter {
    uint24 protocolFee;     // <= 1677%
    uint24 minFundingFee;   // <= 1677%
    uint24 liquidationFee;  // <= 1677
    uint48 minCollateral;   // <= 281mn
    uint24 minSpread;       // <= 1677%
    bool paused;

    bytes13 __unallocated__;
}
struct ProtocolParameterStorage { StoredProtocolParameter value; }
using ProtocolParameterStorageLib for ProtocolParameterStorage global;

library ProtocolParameterStorageLib {
    error ProtocolParameterStorageInvalidError();

    function read(ProtocolParameterStorage storage self) internal view returns (ProtocolParameter memory) {
        StoredProtocolParameter memory value = self.value;
        return ProtocolParameter(
            UFixed6.wrap(uint256(value.protocolFee)),
            UFixed6.wrap(uint256(value.minFundingFee)),
            UFixed6.wrap(uint256(value.liquidationFee)),
            UFixed6.wrap(uint256(value.minCollateral)),
            UFixed6.wrap(uint256(value.minSpread)),
            value.paused
        );
    }

    function store(ProtocolParameterStorage storage self, ProtocolParameter memory newValue) internal {
        if (newValue.protocolFee.gt(UFixed6Lib.MAX_24)) revert ProtocolParameterStorageInvalidError();
        if (newValue.minFundingFee.gt(UFixed6Lib.MAX_24)) revert ProtocolParameterStorageInvalidError();
        if (newValue.liquidationFee.gt(UFixed6Lib.MAX_24)) revert ProtocolParameterStorageInvalidError();
        if (newValue.minCollateral.gt(UFixed6Lib.MAX_48)) revert ProtocolParameterStorageInvalidError();
        if (newValue.minSpread.gt(UFixed6Lib.MAX_24)) revert ProtocolParameterStorageInvalidError();

        self.value = StoredProtocolParameter(
            uint24(UFixed6.unwrap(newValue.protocolFee)),
            uint24(UFixed6.unwrap(newValue.minFundingFee)),
            uint24(UFixed6.unwrap(newValue.liquidationFee)),
            uint48(UFixed6.unwrap(newValue.minCollateral)),
            uint24(UFixed6.unwrap(newValue.minSpread)),
            newValue.paused,
            bytes13(0)
        );
    }
}