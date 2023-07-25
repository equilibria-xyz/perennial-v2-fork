import defaultConfig, { SOLIDITY_VERSION, OPTIMIZER_ENABLED } from '../common/hardhat.default.config'

export const solidityOverrides = {
  'contracts/Vault.sol': {
    version: SOLIDITY_VERSION,
    settings: {
      optimizer: {
        enabled: OPTIMIZER_ENABLED,
        runs: 10000, // TODO: find max value that keeps contracts under size
      },
      viaIR: OPTIMIZER_ENABLED,
    },
  },
}

const config = defaultConfig({
  dependencyPaths: ['@equilibria/perennial-v2-oracle/contracts/interfaces/IOracleFactory.sol'],
  solidityOverrides,
})

export default config
