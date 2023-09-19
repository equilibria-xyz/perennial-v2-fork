// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.13;

import "@equilibria/root/attribute/interfaces/IInstance.sol";
import "@equilibria/root/attribute/interfaces/IKept.sol";
import "@equilibria/perennial-v2/contracts/interfaces/IOracleProvider.sol";

interface IPythOracle is IOracleProvider, IInstance, IKept {
    // sig: 0xfd13d773
    error PythOracleInvalidPriceIdError(bytes32 id);
    // sig: 0x9b4e67d3
    error PythOracleVersionOutsideRangeError();

    function initialize(bytes32 id_, AggregatorV3Interface chainlinkFeed_, Token18 dsu_) external;
    function commit(uint256 oracleVersion, bytes calldata updateData) external payable;

    function MIN_VALID_TIME_AFTER_VERSION() external view returns (uint256);
    function MAX_VALID_TIME_AFTER_VERSION() external view returns (uint256);
    function GRACE_PERIOD() external view returns (uint256);
    function KEEPER_REWARD_PREMIUM() external view returns (UFixed18);
    function KEEPER_BUFFER() external view returns (uint256);
    function versions(uint256 index) external view returns (uint256);
    function currentIndex() external view returns (uint256);
    function latestIndex() external view returns (uint256);
}

/// @dev PythStaticFee interface, this is not exposed in the AbstractPyth contract
interface IPythStaticFee {
    function singleUpdateFeeInWei() external view returns (uint);
}
