// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.13;

import "@equilibria/root/number/types/UFixed18.sol";
import "@equilibria/root/curve/types/JumpRateUtilizationCurve.sol";

interface IParamProvider {
    function maintenance() external view returns (UFixed18);
    function updateMaintenance(UFixed18 newMaintenance) external;
    function fundingFee() external view returns (UFixed18);
    function updateFundingFee(UFixed18 newFundingFee) external;
    function makerFee() external view returns (UFixed18);
    function updateMakerFee(UFixed18 newMakerFee) external;
    function takerFee() external view returns (UFixed18);
    function updateTakerFee(UFixed18 newTakerFee) external;
    function makerLimit() external view returns (UFixed18);
    function updateMakerLimit(UFixed18 newMakerLimit) external;
    function utilizationCurve() external view returns (JumpRateUtilizationCurve memory);
}
