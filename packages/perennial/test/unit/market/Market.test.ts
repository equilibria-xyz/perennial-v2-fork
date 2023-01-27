import { smock, MockContract as SmockContract, FakeContract } from '@defi-wonderland/smock'
import { MockContract } from '@ethereum-waffle/mock-contract'
import { BigNumber, constants, utils } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect, use } from 'chai'
import HRE, { waffle } from 'hardhat'

import { impersonate } from '../../../../common/testutil'

import {
  Market,
  Market__factory,
  IOracleProvider__factory,
  Factory__factory,
  IERC20Metadata__factory,
} from '../../../types/generated'
import {
  expectAccountEq,
  expectFeeEq,
  expectPositionEq,
  expectVersionEq,
  parse6decimal,
} from '../../../../common/testutil/types'
import { IMarket, MarketParameterStruct } from '../../../types/generated/contracts/Market'

const { ethers } = HRE
use(smock.matchers)

const POSITION = parse6decimal('10.000')
const COLLATERAL = parse6decimal('10000')

describe.only('Market', () => {
  let owner: SignerWithAddress
  let treasury: SignerWithAddress
  let user: SignerWithAddress
  let userB: SignerWithAddress
  let userC: SignerWithAddress
  let liquidator: SignerWithAddress
  let factorySigner: SignerWithAddress
  let factory: MockContract
  let oracle: MockContract
  let dsu: MockContract
  let reward: MockContract

  let market: Market
  let marketDefinition: IMarket.MarketDefinitionStruct
  let marketParameter: MarketParameterStruct

  beforeEach(async () => {
    ;[owner, treasury, user, userB, userC, liquidator] = await ethers.getSigners()
    oracle = await waffle.deployMockContract(owner, IOracleProvider__factory.abi)
    dsu = await waffle.deployMockContract(owner, IERC20Metadata__factory.abi)
    reward = await waffle.deployMockContract(owner, IERC20Metadata__factory.abi)

    factory = await waffle.deployMockContract(owner, Factory__factory.abi)
    factorySigner = await impersonate.impersonateWithBalance(factory.address, utils.parseEther('10'))
    await factory.mock.owner.withArgs().returns(owner.address)
    await factory.mock.parameter.withArgs().returns({
      protocolFee: parse6decimal('0.50'),
      minFundingFee: parse6decimal('0.10'),
      liquidationFee: parse6decimal('0.10'),
      minCollateral: parse6decimal('100'),
      paused: false,
    })

    marketDefinition = {
      name: 'Squeeth',
      symbol: 'SQTH',
      token: dsu.address,
      reward: reward.address,
    }
    marketParameter = {
      maintenance: parse6decimal('0.3'),
      fundingFee: parse6decimal('0.1'),
      takerFee: 0,
      positionFee: 0,
      makerLiquidity: parse6decimal('0.2'),
      makerLimit: parse6decimal('1000'),
      closed: false,
      utilizationCurve: {
        //TODO: use a non-uniform rate
        minRate: parse6decimal('0.10'),
        maxRate: parse6decimal('0.10'),
        targetRate: parse6decimal('0.10'),
        targetUtilization: parse6decimal('1'),
      },
      makerRewardRate: 0,
      longRewardRate: 0,
      shortRewardRate: 0,
      oracle: oracle.address,
      payoff: {
        provider: constants.AddressZero,
        short: false,
      },
    }
    market = await new Market__factory(owner).deploy()
  })

  describe('#initialize', async () => {
    it('initialize with the correct variables set', async () => {
      await expect(market.connect(factorySigner).initialize(marketDefinition, marketParameter)).to.emit(
        market,
        'ParameterUpdated',
      )

      expect(await market.factory()).to.equal(factory.address)
      expect(await market.token()).to.equal(dsu.address)
      expect(await market.reward()).to.equal(reward.address)
      expect(await market.name()).to.equal(marketDefinition.name)
      expect(await market.symbol()).to.equal(marketDefinition.symbol)

      const parameter = await market.parameter()
      expect(parameter.maintenance).to.equal(marketParameter.maintenance)
      expect(parameter.fundingFee).to.equal(marketParameter.fundingFee)
      expect(parameter.takerFee).to.equal(marketParameter.takerFee)
      expect(parameter.positionFee).to.equal(marketParameter.positionFee)
      expect(parameter.makerLiquidity).to.equal(marketParameter.makerLiquidity)
      expect(parameter.makerLimit).to.equal(marketParameter.makerLimit)
      expect(parameter.utilizationCurve.minRate).to.equal(marketParameter.utilizationCurve.minRate)
      expect(parameter.utilizationCurve.targetRate).to.equal(marketParameter.utilizationCurve.targetRate)
      expect(parameter.utilizationCurve.maxRate).to.equal(marketParameter.utilizationCurve.maxRate)
      expect(parameter.utilizationCurve.targetUtilization).to.equal(marketParameter.utilizationCurve.targetUtilization)
      expect(parameter.makerRewardRate).to.equal(marketParameter.makerRewardRate)
      expect(parameter.shortRewardRate).to.equal(marketParameter.shortRewardRate)
      expect(parameter.oracle).to.equal(marketParameter.oracle)
      expect(parameter.payoff.provider).to.equal(marketParameter.payoff.provider)
      expect(parameter.payoff.short).to.equal(marketParameter.payoff.short)
    })

    it('reverts if already initialized', async () => {
      await market.initialize(marketDefinition, marketParameter)
      await expect(market.initialize(marketDefinition, marketParameter)).to.be.revertedWith(
        'UInitializableAlreadyInitializedError(1)',
      )
    })
  })

  context('already initialized', async () => {
    beforeEach(async () => {
      await market.connect(factorySigner).initialize(marketDefinition, marketParameter)
      await market.connect(factorySigner).updatePendingOwner(owner.address)
      await market.connect(owner).acceptOwner()
    })

    describe('#updateParameter', async () => {
      it('updates the parameters', async () => {
        const newMarketParameter = {
          maintenance: parse6decimal('0.4'),
          fundingFee: parse6decimal('0.2'),
          takerFee: parse6decimal('0.1'),
          positionFee: parse6decimal('0.1'),
          makerLiquidity: parse6decimal('0.1'),
          makerLimit: parse6decimal('2000'),
          closed: true,
          utilizationCurve: {
            minRate: parse6decimal('0.20'),
            maxRate: parse6decimal('0.20'),
            targetRate: parse6decimal('0.20'),
            targetUtilization: parse6decimal('0.75'),
          },
          makerRewardRate: parse6decimal('0.1'),
          longRewardRate: parse6decimal('0.1'),
          shortRewardRate: parse6decimal('0.1'),
          oracle: constants.AddressZero,
          payoff: {
            //TODO: many of these should not be updateable
            provider: constants.AddressZero,
            short: true,
          },
        }

        await expect(market.connect(owner).updateParameter(newMarketParameter)).to.emit(market, 'ParameterUpdated')

        const parameter = await market.parameter()
        expect(parameter.maintenance).to.equal(newMarketParameter.maintenance)
        expect(parameter.fundingFee).to.equal(newMarketParameter.fundingFee)
        expect(parameter.takerFee).to.equal(newMarketParameter.takerFee)
        expect(parameter.positionFee).to.equal(newMarketParameter.positionFee)
        expect(parameter.makerLiquidity).to.equal(newMarketParameter.makerLiquidity)
        expect(parameter.makerLimit).to.equal(newMarketParameter.makerLimit)
        expect(parameter.utilizationCurve.minRate).to.equal(newMarketParameter.utilizationCurve.minRate)
        expect(parameter.utilizationCurve.targetRate).to.equal(newMarketParameter.utilizationCurve.targetRate)
        expect(parameter.utilizationCurve.maxRate).to.equal(newMarketParameter.utilizationCurve.maxRate)
        expect(parameter.utilizationCurve.targetUtilization).to.equal(
          newMarketParameter.utilizationCurve.targetUtilization,
        )
        expect(parameter.makerRewardRate).to.equal(newMarketParameter.makerRewardRate)
        expect(parameter.shortRewardRate).to.equal(newMarketParameter.shortRewardRate)
        expect(parameter.oracle).to.equal(newMarketParameter.oracle)
        expect(parameter.payoff.provider).to.equal(newMarketParameter.payoff.provider)
        expect(parameter.payoff.short).to.equal(newMarketParameter.payoff.short)
      })

      it('reverts if not owner', async () => {
        await expect(market.connect(user).updateParameter(marketParameter)).to.be.be.revertedWith(
          'UOwnableNotOwnerError()',
        )
      })

      //TODO: should be more validation on parameters
    })

    describe('#updateTreasury', async () => {
      it('updates the treasury', async () => {
        await expect(market.connect(owner).updateTreasury(treasury.address))
          .to.emit(market, 'TreasuryUpdated')
          .withArgs(treasury.address)
        expect(await market.treasury()).to.equal(treasury.address)
      })

      it('reverts if not owner', async () => {
        await expect(market.connect(user).updateTreasury(treasury.address)).to.be.revertedWith(
          'UOwnableNotOwnerError()',
        )
      })
    })

    describe('#update', async () => {
      describe.only('long market', async () => {
        const ORACLE_VERSION = 1
        const TIMESTAMP = 1636401093
        const PRICE = parse6decimal('123')

        const ORACLE_VERSION_0 = {
          price: 0,
          timestamp: 0,
          version: 0,
        }

        const ORACLE_VERSION_1 = {
          price: PRICE,
          timestamp: TIMESTAMP,
          version: ORACLE_VERSION,
        }

        const ORACLE_VERSION_2 = {
          price: PRICE,
          timestamp: TIMESTAMP + 3600,
          version: ORACLE_VERSION + 1,
        }

        const ORACLE_VERSION_3 = {
          price: PRICE,
          timestamp: TIMESTAMP + 7200,
          version: ORACLE_VERSION + 2,
        }

        const ORACLE_VERSION_4 = {
          price: PRICE,
          timestamp: TIMESTAMP + 10800,
          version: ORACLE_VERSION + 3,
        }

        const ORACLE_VERSION_5 = {
          price: PRICE,
          timestamp: TIMESTAMP + 14400,
          version: ORACLE_VERSION + 4,
        }

        // rate * elapsed * utilization * maker * price
        // ( 0.1 * 10^6 / 365 / 24 / 60 / 60 ) * 3600 * 5 * 123 = 7020
        const EXPECTED_FUNDING = ethers.BigNumber.from('7020')
        const EXPECTED_FUNDING_FEE = EXPECTED_FUNDING.div(10)
        const EXPECTED_FUNDING_WITH_FEE = EXPECTED_FUNDING.sub(EXPECTED_FUNDING_FEE)

        beforeEach(async () => {
          await oracle.mock.atVersion.withArgs(0).returns(ORACLE_VERSION_0)
          await oracle.mock.currentVersion.withArgs().returns(ORACLE_VERSION_1)
          await oracle.mock.atVersion.withArgs(1).returns(ORACLE_VERSION_1)

          await oracle.mock.sync.withArgs().returns(ORACLE_VERSION_1)
        })

        context('no position', async () => {
          beforeEach(async () => {
            await dsu.mock.transferFrom.withArgs(user.address, market.address, COLLATERAL.mul(1e12)).returns(true)
          })

          // TODO
        })

        context('make position', async () => {
          //TODO: non-zero reward

          context('open', async () => {
            beforeEach(async () => {
              await dsu.mock.transferFrom.withArgs(user.address, market.address, COLLATERAL.mul(1e12)).returns(true)
            })

            it('opens the position', async () => {
              await expect(market.connect(user).update(user.address, POSITION, 0, 0, COLLATERAL))
                .to.emit(market, 'Updated')
                .withArgs(user.address, 1, POSITION, 0, 0, COLLATERAL)

              expectAccountEq(await market.accounts(user.address), {
                latestVersion: ORACLE_VERSION,
                maker: 0,
                long: 0,
                short: 0,
                nextMaker: POSITION,
                nextLong: 0,
                nextShort: 0,
                collateral: COLLATERAL,
                reward: 0,
                liquidation: false,
              })
              expectPositionEq(await market.position(), {
                latestVersion: ORACLE_VERSION,
                maker: 0,
                long: 0,
                short: 0,
                makerNext: POSITION,
                longNext: 0,
                shortNext: 0,
              })
              expectVersionEq(await market.versions(ORACLE_VERSION), {
                makerValue: { _value: 0 },
                longValue: { _value: 0 },
                shortValue: { _value: 0 },
                makerReward: { _value: 0 },
                longReward: { _value: 0 },
                shortReward: { _value: 0 },
              })
            })

            it('opens the position and settles', async () => {
              await expect(market.connect(user).update(user.address, POSITION, 0, 0, COLLATERAL))
                .to.emit(market, 'Updated')
                .withArgs(user.address, 1, POSITION, 0, 0, COLLATERAL)

              await oracle.mock.currentVersion.withArgs().returns(ORACLE_VERSION_2)
              await oracle.mock.atVersion.withArgs(2).returns(ORACLE_VERSION_2)
              await oracle.mock.sync.withArgs().returns(ORACLE_VERSION_2)

              await market.connect(user).settle(user.address)

              expectAccountEq(await market.accounts(user.address), {
                latestVersion: 2,
                maker: POSITION,
                long: 0,
                short: 0,
                nextMaker: POSITION,
                nextLong: 0,
                nextShort: 0,
                collateral: COLLATERAL,
                reward: 0,
                liquidation: false,
              })
              expectPositionEq(await market.position(), {
                latestVersion: 2,
                maker: POSITION,
                long: 0,
                short: 0,
                makerNext: POSITION,
                longNext: 0,
                shortNext: 0,
              })
              expectVersionEq(await market.versions(2), {
                makerValue: { _value: 0 },
                longValue: { _value: 0 },
                shortValue: { _value: 0 },
                makerReward: { _value: 0 },
                longReward: { _value: 0 },
                shortReward: { _value: 0 },
              })
            })

            it('opens a second position (same version)', async () => {
              await market.connect(user).update(user.address, POSITION, 0, 0, COLLATERAL)

              console.log((await market.position()).latestVersion)
              await expect(market.connect(user).update(user.address, POSITION.mul(2), 0, 0, COLLATERAL))
                .to.emit(market, 'Updated')
                .withArgs(user.address, 1, POSITION.mul(2), 0, 0, COLLATERAL)

              expectAccountEq(await market.accounts(user.address), {
                latestVersion: ORACLE_VERSION,
                maker: 0,
                long: 0,
                short: 0,
                nextMaker: POSITION.mul(2),
                nextLong: 0,
                nextShort: 0,
                collateral: COLLATERAL,
                reward: 0,
                liquidation: false,
              })
              expectPositionEq(await market.position(), {
                latestVersion: ORACLE_VERSION,
                maker: 0,
                long: 0,
                short: 0,
                makerNext: POSITION.mul(2),
                longNext: 0,
                shortNext: 0,
              })
              expectVersionEq(await market.versions(ORACLE_VERSION), {
                makerValue: { _value: 0 },
                longValue: { _value: 0 },
                shortValue: { _value: 0 },
                makerReward: { _value: 0 },
                longReward: { _value: 0 },
                shortReward: { _value: 0 },
              })
            })

            it('opens a second position and settles (same version)', async () => {
              await market.connect(user).update(user.address, POSITION, 0, 0, COLLATERAL)

              await expect(market.connect(user).update(user.address, POSITION.mul(2), 0, 0, COLLATERAL))
                .to.emit(market, 'Updated')
                .withArgs(user.address, 1, POSITION.mul(2), 0, 0, COLLATERAL)

              await oracle.mock.currentVersion.withArgs().returns(ORACLE_VERSION_2)
              await oracle.mock.atVersion.withArgs(2).returns(ORACLE_VERSION_2)
              await oracle.mock.sync.withArgs().returns(ORACLE_VERSION_2)

              await market.connect(user).settle(user.address)

              expectAccountEq(await market.accounts(user.address), {
                latestVersion: 2,
                maker: POSITION.mul(2),
                long: 0,
                short: 0,
                nextMaker: POSITION.mul(2),
                nextLong: 0,
                nextShort: 0,
                collateral: COLLATERAL,
                reward: 0,
                liquidation: false,
              })
              expectPositionEq(await market.position(), {
                latestVersion: 2,
                maker: POSITION.mul(2),
                long: 0,
                short: 0,
                makerNext: POSITION.mul(2),
                longNext: 0,
                shortNext: 0,
              })
              expectVersionEq(await market.versions(2), {
                makerValue: { _value: 0 },
                longValue: { _value: 0 },
                shortValue: { _value: 0 },
                makerReward: { _value: 0 },
                longReward: { _value: 0 },
                shortReward: { _value: 0 },
              })
            })

            it('opens a second position (next version)', async () => {
              await market.connect(user).update(user.address, POSITION, 0, 0, COLLATERAL)

              await oracle.mock.currentVersion.withArgs().returns(ORACLE_VERSION_2)
              await oracle.mock.atVersion.withArgs(2).returns(ORACLE_VERSION_2)
              await oracle.mock.sync.withArgs().returns(ORACLE_VERSION_2)

              await expect(market.connect(user).update(user.address, POSITION.mul(2), 0, 0, COLLATERAL))
                .to.emit(market, 'Updated')
                .withArgs(user.address, 2, POSITION.mul(2), 0, 0, COLLATERAL)

              expectAccountEq(await market.accounts(user.address), {
                latestVersion: 2,
                maker: POSITION,
                long: 0,
                short: 0,
                nextMaker: POSITION.mul(2),
                nextLong: 0,
                nextShort: 0,
                collateral: COLLATERAL,
                reward: 0,
                liquidation: false,
              })
              expectPositionEq(await market.position(), {
                latestVersion: 2,
                maker: POSITION,
                long: 0,
                short: 0,
                makerNext: POSITION.mul(2),
                longNext: 0,
                shortNext: 0,
              })
              expectVersionEq(await market.versions(2), {
                makerValue: { _value: 0 },
                longValue: { _value: 0 },
                shortValue: { _value: 0 },
                makerReward: { _value: 0 },
                longReward: { _value: 0 },
                shortReward: { _value: 0 },
              })
            })

            it('opens a second position and settles (next version)', async () => {
              await market.connect(user).update(user.address, POSITION, 0, 0, COLLATERAL)

              await oracle.mock.currentVersion.withArgs().returns(ORACLE_VERSION_2)
              await oracle.mock.atVersion.withArgs(2).returns(ORACLE_VERSION_2)
              await oracle.mock.sync.withArgs().returns(ORACLE_VERSION_2)

              await expect(market.connect(user).update(user.address, POSITION.mul(2), 0, 0, COLLATERAL))
                .to.emit(market, 'Updated')
                .withArgs(user.address, 2, POSITION.mul(2), 0, 0, COLLATERAL)

              await oracle.mock.currentVersion.withArgs().returns(ORACLE_VERSION_3)
              await oracle.mock.atVersion.withArgs(3).returns(ORACLE_VERSION_3)
              await oracle.mock.sync.withArgs().returns(ORACLE_VERSION_3)

              await market.connect(user).settle(user.address)

              expectAccountEq(await market.accounts(user.address), {
                latestVersion: 3,
                maker: POSITION.mul(2),
                long: 0,
                short: 0,
                nextMaker: POSITION.mul(2),
                nextLong: 0,
                nextShort: 0,
                collateral: COLLATERAL,
                reward: 0,
                liquidation: false,
              })
              expectPositionEq(await market.position(), {
                latestVersion: 3,
                maker: POSITION.mul(2),
                long: 0,
                short: 0,
                makerNext: POSITION.mul(2),
                longNext: 0,
                shortNext: 0,
              })
              expectVersionEq(await market.versions(3), {
                makerValue: { _value: 0 },
                longValue: { _value: 0 },
                shortValue: { _value: 0 },
                makerReward: { _value: 0 },
                longReward: { _value: 0 },
                shortReward: { _value: 0 },
              })
            })

            it('opens the position and settles later', async () => {
              await expect(market.connect(user).update(user.address, POSITION, 0, 0, COLLATERAL))
                .to.emit(market, 'Updated')
                .withArgs(user.address, 1, POSITION, 0, 0, COLLATERAL)

              await oracle.mock.atVersion.withArgs(2).returns(ORACLE_VERSION_2)

              await oracle.mock.currentVersion.withArgs().returns(ORACLE_VERSION_3)
              await oracle.mock.atVersion.withArgs(3).returns(ORACLE_VERSION_3)
              await oracle.mock.sync.withArgs().returns(ORACLE_VERSION_3)

              await market.connect(user).settle(user.address)

              expectAccountEq(await market.accounts(user.address), {
                latestVersion: 3,
                maker: POSITION,
                long: 0,
                short: 0,
                nextMaker: POSITION,
                nextLong: 0,
                nextShort: 0,
                collateral: COLLATERAL,
                reward: 0,
                liquidation: false,
              })
              expectPositionEq(await market.position(), {
                latestVersion: 3,
                maker: POSITION,
                long: 0,
                short: 0,
                makerNext: POSITION,
                longNext: 0,
                shortNext: 0,
              })
              expectVersionEq(await market.versions(3), {
                makerValue: { _value: 0 },
                longValue: { _value: 0 },
                shortValue: { _value: 0 },
                makerReward: { _value: 0 },
                longReward: { _value: 0 },
                shortReward: { _value: 0 },
              })
            })
          })

          context('close', async () => {
            beforeEach(async () => {
              await dsu.mock.transferFrom.withArgs(user.address, market.address, COLLATERAL.mul(1e12)).returns(true)
              await market.connect(user).update(user.address, POSITION, 0, 0, COLLATERAL)
            })

            it('closes the position', async () => {
              await expect(market.connect(user).update(user.address, 0, 0, 0, COLLATERAL))
                .to.emit(market, 'Updated')
                .withArgs(user.address, 1, 0, 0, 0, COLLATERAL)

              expectAccountEq(await market.accounts(user.address), {
                latestVersion: ORACLE_VERSION,
                maker: 0,
                long: 0,
                short: 0,
                nextMaker: 0,
                nextLong: 0,
                nextShort: 0,
                collateral: COLLATERAL,
                reward: 0,
                liquidation: false,
              })
              expectPositionEq(await market.position(), {
                latestVersion: ORACLE_VERSION,
                maker: 0,
                long: 0,
                short: 0,
                makerNext: 0,
                longNext: 0,
                shortNext: 0,
              })
              expectVersionEq(await market.versions(ORACLE_VERSION), {
                makerValue: { _value: 0 },
                longValue: { _value: 0 },
                shortValue: { _value: 0 },
                makerReward: { _value: 0 },
                longReward: { _value: 0 },
                shortReward: { _value: 0 },
              })
            })

            it('closes the position partially', async () => {
              await expect(market.connect(user).update(user.address, POSITION.div(2), 0, 0, COLLATERAL))
                .to.emit(market, 'Updated')
                .withArgs(user.address, 1, POSITION.div(2), 0, 0, COLLATERAL)

              expectAccountEq(await market.accounts(user.address), {
                latestVersion: ORACLE_VERSION,
                maker: 0,
                long: 0,
                short: 0,
                nextMaker: POSITION.div(2),
                nextLong: 0,
                nextShort: 0,
                collateral: COLLATERAL,
                reward: 0,
                liquidation: false,
              })
              expectPositionEq(await market.position(), {
                latestVersion: ORACLE_VERSION,
                maker: 0,
                long: 0,
                short: 0,
                makerNext: POSITION.div(2),
                longNext: 0,
                shortNext: 0,
              })
              expectVersionEq(await market.versions(ORACLE_VERSION), {
                makerValue: { _value: 0 },
                longValue: { _value: 0 },
                shortValue: { _value: 0 },
                makerReward: { _value: 0 },
                longReward: { _value: 0 },
                shortReward: { _value: 0 },
              })
            })

            context('settles first', async () => {
              beforeEach(async () => {
                await oracle.mock.currentVersion.withArgs().returns(ORACLE_VERSION_2)
                await oracle.mock.atVersion.withArgs(2).returns(ORACLE_VERSION_2)
                await oracle.mock.sync.withArgs().returns(ORACLE_VERSION_2)

                await market.connect(user).settle(user.address)
              })

              it('closes the position', async () => {
                await expect(market.connect(user).update(user.address, 0, 0, 0, COLLATERAL))
                  .to.emit(market, 'Updated')
                  .withArgs(user.address, 2, 0, 0, 0, COLLATERAL)

                expectAccountEq(await market.accounts(user.address), {
                  latestVersion: 2,
                  maker: POSITION,
                  long: 0,
                  short: 0,
                  nextMaker: 0,
                  nextLong: 0,
                  nextShort: 0,
                  collateral: COLLATERAL,
                  reward: 0,
                  liquidation: false,
                })
                expectPositionEq(await market.position(), {
                  latestVersion: 2,
                  maker: POSITION,
                  long: 0,
                  short: 0,
                  makerNext: 0,
                  longNext: 0,
                  shortNext: 0,
                })
                expectVersionEq(await market.versions(2), {
                  makerValue: { _value: 0 },
                  longValue: { _value: 0 },
                  shortValue: { _value: 0 },
                  makerReward: { _value: 0 },
                  longReward: { _value: 0 },
                  shortReward: { _value: 0 },
                })
              })

              it('closes the position and settles', async () => {
                await expect(market.connect(user).update(user.address, 0, 0, 0, COLLATERAL))
                  .to.emit(market, 'Updated')
                  .withArgs(user.address, 2, 0, 0, 0, COLLATERAL)

                await oracle.mock.currentVersion.withArgs().returns(ORACLE_VERSION_3)
                await oracle.mock.atVersion.withArgs(3).returns(ORACLE_VERSION_3)
                await oracle.mock.sync.withArgs().returns(ORACLE_VERSION_3)

                await market.connect(user).settle(user.address)

                expectAccountEq(await market.accounts(user.address), {
                  latestVersion: 3,
                  maker: 0,
                  long: 0,
                  short: 0,
                  nextMaker: 0,
                  nextLong: 0,
                  nextShort: 0,
                  collateral: COLLATERAL,
                  reward: 0,
                  liquidation: false,
                })
                expectPositionEq(await market.position(), {
                  latestVersion: 3,
                  maker: 0,
                  long: 0,
                  short: 0,
                  makerNext: 0,
                  longNext: 0,
                  shortNext: 0,
                })
                expectVersionEq(await market.versions(3), {
                  makerValue: { _value: 0 },
                  longValue: { _value: 0 },
                  shortValue: { _value: 0 },
                  makerReward: { _value: 0 },
                  longReward: { _value: 0 },
                  shortReward: { _value: 0 },
                })
              })

              it('closes a second position (same version)', async () => {
                await market.connect(user).update(user.address, POSITION.div(2), 0, 0, COLLATERAL)

                await expect(market.connect(user).update(user.address, 0, 0, 0, COLLATERAL))
                  .to.emit(market, 'Updated')
                  .withArgs(user.address, 2, 0, 0, 0, COLLATERAL)

                expectAccountEq(await market.accounts(user.address), {
                  latestVersion: 2,
                  maker: POSITION,
                  long: 0,
                  short: 0,
                  nextMaker: 0,
                  nextLong: 0,
                  nextShort: 0,
                  collateral: COLLATERAL,
                  reward: 0,
                  liquidation: false,
                })
                expectPositionEq(await market.position(), {
                  latestVersion: 2,
                  maker: POSITION,
                  long: 0,
                  short: 0,
                  makerNext: 0,
                  longNext: 0,
                  shortNext: 0,
                })
                expectVersionEq(await market.versions(2), {
                  makerValue: { _value: 0 },
                  longValue: { _value: 0 },
                  shortValue: { _value: 0 },
                  makerReward: { _value: 0 },
                  longReward: { _value: 0 },
                  shortReward: { _value: 0 },
                })
              })

              it('closes a second position and settles (same version)', async () => {
                await market.connect(user).update(user.address, POSITION.div(2), 0, 0, COLLATERAL)

                await expect(market.connect(user).update(user.address, 0, 0, 0, COLLATERAL))
                  .to.emit(market, 'Updated')
                  .withArgs(user.address, 2, 0, 0, 0, COLLATERAL)

                await oracle.mock.currentVersion.withArgs().returns(ORACLE_VERSION_3)
                await oracle.mock.atVersion.withArgs(3).returns(ORACLE_VERSION_3)
                await oracle.mock.sync.withArgs().returns(ORACLE_VERSION_3)

                await market.connect(user).settle(user.address)

                expectAccountEq(await market.accounts(user.address), {
                  latestVersion: 3,
                  maker: 0,
                  long: 0,
                  short: 0,
                  nextMaker: 0,
                  nextLong: 0,
                  nextShort: 0,
                  collateral: COLLATERAL,
                  reward: 0,
                  liquidation: false,
                })
                expectPositionEq(await market.position(), {
                  latestVersion: 3,
                  maker: 0,
                  long: 0,
                  short: 0,
                  makerNext: 0,
                  longNext: 0,
                  shortNext: 0,
                })
                expectVersionEq(await market.versions(3), {
                  makerValue: { _value: 0 },
                  longValue: { _value: 0 },
                  shortValue: { _value: 0 },
                  makerReward: { _value: 0 },
                  longReward: { _value: 0 },
                  shortReward: { _value: 0 },
                })
              })

              it('closes a second position (next version)', async () => {
                await market.connect(user).update(user.address, POSITION.div(2), 0, 0, COLLATERAL)

                await oracle.mock.currentVersion.withArgs().returns(ORACLE_VERSION_3)
                await oracle.mock.atVersion.withArgs(3).returns(ORACLE_VERSION_3)
                await oracle.mock.sync.withArgs().returns(ORACLE_VERSION_3)

                await expect(market.connect(user).update(user.address, 0, 0, 0, COLLATERAL))
                  .to.emit(market, 'Updated')
                  .withArgs(user.address, 3, 0, 0, 0, COLLATERAL)

                expectAccountEq(await market.accounts(user.address), {
                  latestVersion: 3,
                  maker: POSITION.div(2),
                  long: 0,
                  short: 0,
                  nextMaker: 0,
                  nextLong: 0,
                  nextShort: 0,
                  collateral: COLLATERAL,
                  reward: 0,
                  liquidation: false,
                })
                expectPositionEq(await market.position(), {
                  latestVersion: 3,
                  maker: POSITION.div(2),
                  long: 0,
                  short: 0,
                  makerNext: 0,
                  longNext: 0,
                  shortNext: 0,
                })
                expectVersionEq(await market.versions(3), {
                  makerValue: { _value: 0 },
                  longValue: { _value: 0 },
                  shortValue: { _value: 0 },
                  makerReward: { _value: 0 },
                  longReward: { _value: 0 },
                  shortReward: { _value: 0 },
                })
              })

              it('closes a second position and settles (next version)', async () => {
                await market.connect(user).update(user.address, POSITION.div(2), 0, 0, COLLATERAL)

                await oracle.mock.currentVersion.withArgs().returns(ORACLE_VERSION_3)
                await oracle.mock.atVersion.withArgs(3).returns(ORACLE_VERSION_3)
                await oracle.mock.sync.withArgs().returns(ORACLE_VERSION_3)

                await expect(market.connect(user).update(user.address, 0, 0, 0, COLLATERAL))
                  .to.emit(market, 'Updated')
                  .withArgs(user.address, 3, 0, 0, 0, COLLATERAL)

                await oracle.mock.currentVersion.withArgs().returns(ORACLE_VERSION_4)
                await oracle.mock.atVersion.withArgs(4).returns(ORACLE_VERSION_4)
                await oracle.mock.sync.withArgs().returns(ORACLE_VERSION_4)

                await market.connect(user).settle(user.address)

                expectAccountEq(await market.accounts(user.address), {
                  latestVersion: 4,
                  maker: 0,
                  long: 0,
                  short: 0,
                  nextMaker: 0,
                  nextLong: 0,
                  nextShort: 0,
                  collateral: COLLATERAL,
                  reward: 0,
                  liquidation: false,
                })
                expectPositionEq(await market.position(), {
                  latestVersion: 4,
                  maker: 0,
                  long: 0,
                  short: 0,
                  makerNext: 0,
                  longNext: 0,
                  shortNext: 0,
                })
                expectVersionEq(await market.versions(4), {
                  makerValue: { _value: 0 },
                  longValue: { _value: 0 },
                  shortValue: { _value: 0 },
                  makerReward: { _value: 0 },
                  longReward: { _value: 0 },
                  shortReward: { _value: 0 },
                })
              })

              it('closes the position and settles later', async () => {
                await expect(market.connect(user).update(user.address, 0, 0, 0, COLLATERAL))
                  .to.emit(market, 'Updated')
                  .withArgs(user.address, 2, 0, 0, 0, COLLATERAL)

                await oracle.mock.atVersion.withArgs(3).returns(ORACLE_VERSION_3)

                await oracle.mock.currentVersion.withArgs().returns(ORACLE_VERSION_4)
                await oracle.mock.atVersion.withArgs(4).returns(ORACLE_VERSION_4)
                await oracle.mock.sync.withArgs().returns(ORACLE_VERSION_4)

                await market.connect(user).settle(user.address)

                expectAccountEq(await market.accounts(user.address), {
                  latestVersion: 4,
                  maker: 0,
                  long: 0,
                  short: 0,
                  nextMaker: 0,
                  nextLong: 0,
                  nextShort: 0,
                  collateral: COLLATERAL,
                  reward: 0,
                  liquidation: false,
                })
                expectPositionEq(await market.position(), {
                  latestVersion: 4,
                  maker: 0,
                  long: 0,
                  short: 0,
                  makerNext: 0,
                  longNext: 0,
                  shortNext: 0,
                })
                expectVersionEq(await market.versions(4), {
                  makerValue: { _value: 0 },
                  longValue: { _value: 0 },
                  shortValue: { _value: 0 },
                  makerReward: { _value: 0 },
                  longReward: { _value: 0 },
                  shortReward: { _value: 0 },
                })
              })
            })
          })
        })

        context('long position', async () => {
          //TODO: non-zero reward

          beforeEach(async () => {
            await dsu.mock.transferFrom.withArgs(user.address, market.address, COLLATERAL.mul(1e12)).returns(true)
          })

          context('position delta', async () => {
            context('open', async () => {
              beforeEach(async () => {
                await dsu.mock.transferFrom.withArgs(userB.address, market.address, COLLATERAL.mul(1e12)).returns(true)
                await market.connect(userB).update(userB.address, POSITION, 0, 0, COLLATERAL)
              })

              it('opens the position', async () => {
                await expect(market.connect(user).update(user.address, 0, POSITION, 0, COLLATERAL))
                  .to.emit(market, 'Updated')
                  .withArgs(user.address, 1, 0, POSITION, 0, COLLATERAL)

                expectAccountEq(await market.accounts(user.address), {
                  latestVersion: ORACLE_VERSION,
                  maker: 0,
                  long: 0,
                  short: 0,
                  nextMaker: 0,
                  nextLong: POSITION,
                  nextShort: 0,
                  collateral: COLLATERAL,
                  reward: 0,
                  liquidation: false,
                })
                expectPositionEq(await market.position(), {
                  latestVersion: ORACLE_VERSION,
                  maker: 0,
                  long: 0,
                  short: 0,
                  makerNext: POSITION,
                  longNext: POSITION,
                  shortNext: 0,
                })
                expectVersionEq(await market.versions(ORACLE_VERSION), {
                  makerValue: { _value: 0 },
                  longValue: { _value: 0 },
                  shortValue: { _value: 0 },
                  makerReward: { _value: 0 },
                  longReward: { _value: 0 },
                  shortReward: { _value: 0 },
                })
              })

              it('opens the position and settles', async () => {
                await expect(market.connect(user).update(user.address, 0, POSITION, 0, COLLATERAL))
                  .to.emit(market, 'Updated')
                  .withArgs(user.address, 1, 0, POSITION, 0, COLLATERAL)

                await oracle.mock.currentVersion.withArgs().returns(ORACLE_VERSION_2)
                await oracle.mock.atVersion.withArgs(2).returns(ORACLE_VERSION_2)
                await oracle.mock.sync.withArgs().returns(ORACLE_VERSION_2)

                await market.connect(user).settle(user.address)

                expectAccountEq(await market.accounts(user.address), {
                  latestVersion: 2,
                  maker: 0,
                  long: POSITION,
                  short: 0,
                  nextMaker: 0,
                  nextLong: POSITION,
                  nextShort: 0,
                  collateral: COLLATERAL,
                  reward: 0,
                  liquidation: false,
                })
                expectPositionEq(await market.position(), {
                  latestVersion: 2,
                  maker: POSITION,
                  long: POSITION,
                  short: 0,
                  makerNext: POSITION,
                  longNext: POSITION,
                  shortNext: 0,
                })
                expectVersionEq(await market.versions(2), {
                  makerValue: { _value: 0 },
                  longValue: { _value: 0 },
                  shortValue: { _value: 0 },
                  makerReward: { _value: 0 },
                  longReward: { _value: 0 },
                  shortReward: { _value: 0 },
                })
              })

              it('opens a second position (same version)', async () => {
                await market.connect(user).update(user.address, 0, POSITION.div(2), 0, COLLATERAL)

                await expect(market.connect(user).update(user.address, 0, POSITION, 0, COLLATERAL))
                  .to.emit(market, 'Updated')
                  .withArgs(user.address, 1, 0, POSITION, 0, COLLATERAL)

                expectAccountEq(await market.accounts(user.address), {
                  latestVersion: ORACLE_VERSION,
                  maker: 0,
                  long: 0,
                  short: 0,
                  nextMaker: 0,
                  nextLong: POSITION,
                  nextShort: 0,
                  collateral: COLLATERAL,
                  reward: 0,
                  liquidation: false,
                })
                expectPositionEq(await market.position(), {
                  latestVersion: ORACLE_VERSION,
                  maker: 0,
                  long: 0,
                  short: 0,
                  makerNext: POSITION,
                  longNext: POSITION,
                  shortNext: 0,
                })
                expectVersionEq(await market.versions(ORACLE_VERSION), {
                  makerValue: { _value: 0 },
                  longValue: { _value: 0 },
                  shortValue: { _value: 0 },
                  makerReward: { _value: 0 },
                  longReward: { _value: 0 },
                  shortReward: { _value: 0 },
                })
              })

              it('opens a second position and settles (same version)', async () => {
                await market.connect(user).update(user.address, 0, POSITION.div(2), 0, COLLATERAL)

                await expect(market.connect(user).update(user.address, 0, POSITION, 0, COLLATERAL))
                  .to.emit(market, 'Updated')
                  .withArgs(user.address, 1, 0, POSITION, 0, COLLATERAL)

                await oracle.mock.currentVersion.withArgs().returns(ORACLE_VERSION_2)
                await oracle.mock.atVersion.withArgs(2).returns(ORACLE_VERSION_2)
                await oracle.mock.sync.withArgs().returns(ORACLE_VERSION_2)

                await market.connect(user).settle(user.address)

                expectAccountEq(await market.accounts(user.address), {
                  latestVersion: 2,
                  maker: 0,
                  long: POSITION,
                  short: 0,
                  nextMaker: 0,
                  nextLong: POSITION,
                  nextShort: 0,
                  collateral: COLLATERAL,
                  reward: 0,
                  liquidation: false,
                })
                expectPositionEq(await market.position(), {
                  latestVersion: 2,
                  maker: POSITION,
                  long: POSITION,
                  short: 0,
                  makerNext: POSITION,
                  longNext: POSITION,
                  shortNext: 0,
                })
                expectVersionEq(await market.versions(2), {
                  makerValue: { _value: 0 },
                  longValue: { _value: 0 },
                  shortValue: { _value: 0 },
                  makerReward: { _value: 0 },
                  longReward: { _value: 0 },
                  shortReward: { _value: 0 },
                })
              })

              it('opens a second position (next version)', async () => {
                await market.connect(user).update(user.address, 0, POSITION.div(2), 0, COLLATERAL)

                await oracle.mock.currentVersion.withArgs().returns(ORACLE_VERSION_2)
                await oracle.mock.atVersion.withArgs(2).returns(ORACLE_VERSION_2)
                await oracle.mock.sync.withArgs().returns(ORACLE_VERSION_2)

                await expect(market.connect(user).update(user.address, 0, POSITION, 0, COLLATERAL))
                  .to.emit(market, 'Updated')
                  .withArgs(user.address, 2, 0, POSITION, 0, COLLATERAL)

                expectAccountEq(await market.accounts(user.address), {
                  latestVersion: 2,
                  maker: 0,
                  long: POSITION.div(2),
                  short: 0,
                  nextMaker: 0,
                  nextLong: POSITION,
                  nextShort: 0,
                  collateral: COLLATERAL,
                  reward: 0,
                  liquidation: false,
                })
                expectPositionEq(await market.position(), {
                  latestVersion: 2,
                  maker: POSITION,
                  long: POSITION.div(2),
                  short: 0,
                  makerNext: POSITION,
                  longNext: POSITION,
                  shortNext: 0,
                })
                expectVersionEq(await market.versions(2), {
                  makerValue: { _value: 0 },
                  longValue: { _value: 0 },
                  shortValue: { _value: 0 },
                  makerReward: { _value: 0 },
                  longReward: { _value: 0 },
                  shortReward: { _value: 0 },
                })
              })

              it('opens a second position and settles (next version)', async () => {
                // rate * elapsed * utilization * maker * price
                // ( 0.1 * 10^6 / 365 / 24 / 60 / 60 ) * 3600 * 5 * 123 = 7020
                const EXPECTED_FUNDING = BigNumber.from(7020)
                const EXPECTED_FUNDING_FEE = EXPECTED_FUNDING.div(10)
                const EXPECTED_FUNDING_WITH_FEE = EXPECTED_FUNDING.sub(EXPECTED_FUNDING_FEE)

                await market.connect(user).update(user.address, 0, POSITION.div(2), 0, COLLATERAL)

                await oracle.mock.currentVersion.withArgs().returns(ORACLE_VERSION_2)
                await oracle.mock.atVersion.withArgs(2).returns(ORACLE_VERSION_2)
                await oracle.mock.sync.withArgs().returns(ORACLE_VERSION_2)

                await expect(market.connect(user).update(user.address, 0, POSITION, 0, COLLATERAL))
                  .to.emit(market, 'Updated')
                  .withArgs(user.address, 2, 0, POSITION, 0, COLLATERAL)

                await oracle.mock.currentVersion.withArgs().returns(ORACLE_VERSION_3)
                await oracle.mock.atVersion.withArgs(3).returns(ORACLE_VERSION_3)
                await oracle.mock.sync.withArgs().returns(ORACLE_VERSION_3)

                await market.connect(user).settle(user.address)
                await market.connect(user).settle(userB.address)

                expectAccountEq(await market.accounts(user.address), {
                  latestVersion: 3,
                  maker: 0,
                  long: POSITION,
                  short: 0,
                  nextMaker: 0,
                  nextLong: POSITION,
                  nextShort: 0,
                  collateral: COLLATERAL.sub(EXPECTED_FUNDING),
                  reward: 0,
                  liquidation: false,
                })
                expectAccountEq(await market.accounts(userB.address), {
                  latestVersion: 3,
                  maker: POSITION,
                  long: 0,
                  short: 0,
                  nextMaker: POSITION,
                  nextLong: 0,
                  nextShort: 0,
                  collateral: COLLATERAL.add(EXPECTED_FUNDING_WITH_FEE).sub(8), // loss of precision
                  reward: 0,
                  liquidation: false,
                })
                expectPositionEq(await market.position(), {
                  latestVersion: 3,
                  maker: POSITION,
                  long: POSITION,
                  short: 0,
                  makerNext: POSITION,
                  longNext: POSITION,
                  shortNext: 0,
                })
                expectVersionEq(await market.versions(3), {
                  makerValue: { _value: EXPECTED_FUNDING_WITH_FEE.div(10) },
                  longValue: { _value: EXPECTED_FUNDING.div(5).mul(-1) },
                  shortValue: { _value: 0 },
                  makerReward: { _value: 0 },
                  longReward: { _value: 0 },
                  shortReward: { _value: 0 },
                })
                expectFeeEq(await market.fee(), {
                  protocol: EXPECTED_FUNDING_FEE.div(2),
                  market: EXPECTED_FUNDING_FEE.div(2),
                })
              })

              it('opens the position and settles later', async () => {
                // rate * elapsed * utilization * maker * price
                // ( 0.1 * 10^6 / 365 / 24 / 60 / 60 ) * 3600 * 5 * 123 = 7020
                const EXPECTED_FUNDING = BigNumber.from('7020')
                const EXPECTED_FUNDING_FEE = EXPECTED_FUNDING.div(10)
                const EXPECTED_FUNDING_WITH_FEE = EXPECTED_FUNDING.sub(EXPECTED_FUNDING_FEE)

                await expect(market.connect(user).update(user.address, 0, POSITION.div(2), 0, COLLATERAL))
                  .to.emit(market, 'Updated')
                  .withArgs(user.address, 1, 0, POSITION.div(2), 0, COLLATERAL)

                await oracle.mock.atVersion.withArgs(2).returns(ORACLE_VERSION_2)

                await oracle.mock.currentVersion.withArgs().returns(ORACLE_VERSION_3)
                await oracle.mock.atVersion.withArgs(3).returns(ORACLE_VERSION_3)
                await oracle.mock.sync.withArgs().returns(ORACLE_VERSION_3)

                await market.connect(user).settle(user.address)
                await market.connect(user).settle(userB.address)

                expectAccountEq(await market.accounts(user.address), {
                  latestVersion: 3,
                  maker: 0,
                  long: POSITION.div(2),
                  short: 0,
                  nextMaker: 0,
                  nextLong: POSITION.div(2),
                  nextShort: 0,
                  collateral: COLLATERAL.sub(EXPECTED_FUNDING),
                  reward: 0,
                  liquidation: false,
                })
                expectAccountEq(await market.accounts(userB.address), {
                  latestVersion: 3,
                  maker: POSITION,
                  long: 0,
                  short: 0,
                  nextMaker: POSITION,
                  nextLong: 0,
                  nextShort: 0,
                  collateral: COLLATERAL.add(EXPECTED_FUNDING_WITH_FEE).sub(8), // loss of precision
                  reward: 0,
                  liquidation: false,
                })
                expectPositionEq(await market.position(), {
                  latestVersion: 3,
                  maker: POSITION,
                  long: POSITION.div(2),
                  short: 0,
                  makerNext: POSITION,
                  longNext: POSITION.div(2),
                  shortNext: 0,
                })
                expectVersionEq(await market.versions(3), {
                  makerValue: { _value: EXPECTED_FUNDING_WITH_FEE.div(10) },
                  longValue: { _value: EXPECTED_FUNDING.div(5).mul(-1) },
                  shortValue: { _value: 0 },
                  makerReward: { _value: 0 },
                  longReward: { _value: 0 },
                  shortReward: { _value: 0 },
                })
                expectFeeEq(await market.fee(), {
                  protocol: EXPECTED_FUNDING_FEE.div(2),
                  market: EXPECTED_FUNDING_FEE.div(2),
                })
              })

              it('opens the position and settles later with fee', async () => {
                const marketParameter = { ...(await market.parameter()) }
                marketParameter.takerFee = parse6decimal('0.01')
                await market.updateParameter(marketParameter)

                const TAKER_FEE = parse6decimal('6.15') // position * taker fee * price

                // rate * elapsed * utilization * maker * price
                // ( 0.1 * 10^6 / 365 / 24 / 60 / 60 ) * 3600 * 5 * 123 = 7020
                const EXPECTED_FUNDING = ethers.BigNumber.from('7020')
                const EXPECTED_FUNDING_FEE = EXPECTED_FUNDING.div(10)
                const EXPECTED_FUNDING_WITH_FEE = EXPECTED_FUNDING.sub(EXPECTED_FUNDING_FEE)

                await dsu.mock.transferFrom
                  .withArgs(user.address, market.address, COLLATERAL.add(TAKER_FEE).mul(1e12))
                  .returns(true)
                await expect(market.connect(user).update(user.address, 0, POSITION.div(2), 0, COLLATERAL))
                  .to.emit(market, 'Updated')
                  .withArgs(user.address, 1, 0, POSITION.div(2), 0, COLLATERAL)

                await oracle.mock.atVersion.withArgs(2).returns(ORACLE_VERSION_2)

                await oracle.mock.currentVersion.withArgs().returns(ORACLE_VERSION_3)
                await oracle.mock.atVersion.withArgs(3).returns(ORACLE_VERSION_3)
                await oracle.mock.sync.withArgs().returns(ORACLE_VERSION_3)

                await market.connect(user).settle(user.address)
                await market.connect(user).settle(userB.address)

                expectAccountEq(await market.accounts(user.address), {
                  latestVersion: 3,
                  maker: 0,
                  long: POSITION.div(2),
                  short: 0,
                  nextMaker: 0,
                  nextLong: POSITION.div(2),
                  nextShort: 0,
                  collateral: COLLATERAL.sub(EXPECTED_FUNDING),
                  reward: 0,
                  liquidation: false,
                })
                expectAccountEq(await market.accounts(userB.address), {
                  latestVersion: 3,
                  maker: POSITION,
                  long: 0,
                  short: 0,
                  nextMaker: POSITION,
                  nextLong: 0,
                  nextShort: 0,
                  collateral: COLLATERAL.add(EXPECTED_FUNDING_WITH_FEE).sub(8), // loss of precision
                  reward: 0,
                  liquidation: false,
                })
                expectPositionEq(await market.position(), {
                  latestVersion: 3,
                  maker: POSITION,
                  long: POSITION.div(2),
                  short: 0,
                  makerNext: POSITION,
                  longNext: POSITION.div(2),
                  shortNext: 0,
                })
                expectVersionEq(await market.versions(3), {
                  makerValue: { _value: EXPECTED_FUNDING_WITH_FEE.div(10) },
                  longValue: { _value: EXPECTED_FUNDING.div(5).mul(-1) },
                  shortValue: { _value: 0 },
                  makerReward: { _value: 0 },
                  longReward: { _value: 0 },
                  shortReward: { _value: 0 },
                })
                expectFeeEq(await market.fee(), {
                  protocol: EXPECTED_FUNDING_FEE.add(TAKER_FEE).div(2), // no makers yet, taker fee is forwarded
                  market: EXPECTED_FUNDING_FEE.add(TAKER_FEE).div(2),
                })
              })

              it('settles opens the position and settles later with fee', async () => {
                await oracle.mock.currentVersion.withArgs().returns(ORACLE_VERSION_2)
                await oracle.mock.atVersion.withArgs(2).returns(ORACLE_VERSION_2)
                await oracle.mock.sync.withArgs().returns(ORACLE_VERSION_2)

                await market.connect(user).settle(user.address)

                const marketParameter = { ...(await market.parameter()) }
                marketParameter.takerFee = parse6decimal('0.01')
                await market.updateParameter(marketParameter)

                const TAKER_FEE = parse6decimal('6.15') // position * taker fee * price

                // rate * elapsed * utilization * maker * price
                // ( 0.1 * 10^6 / 365 / 24 / 60 / 60 ) * 3600 * 5 * 123 = 7020
                const EXPECTED_FUNDING = ethers.BigNumber.from('7020')
                const EXPECTED_FUNDING_FEE = EXPECTED_FUNDING.div(10)
                const EXPECTED_FUNDING_WITH_FEE = EXPECTED_FUNDING.sub(EXPECTED_FUNDING_FEE)

                await dsu.mock.transferFrom
                  .withArgs(user.address, market.address, COLLATERAL.add(TAKER_FEE).mul(1e12))
                  .returns(true)
                await expect(market.connect(user).update(user.address, 0, POSITION.div(2), 0, COLLATERAL))
                  .to.emit(market, 'Updated')
                  .withArgs(user.address, 2, 0, POSITION.div(2), 0, COLLATERAL)

                await oracle.mock.atVersion.withArgs(3).returns(ORACLE_VERSION_3)

                await oracle.mock.currentVersion.withArgs().returns(ORACLE_VERSION_4)
                await oracle.mock.atVersion.withArgs(4).returns(ORACLE_VERSION_4)
                await oracle.mock.sync.withArgs().returns(ORACLE_VERSION_4)

                await market.connect(user).settle(user.address)
                await market.connect(user).settle(userB.address)

                expectAccountEq(await market.accounts(user.address), {
                  latestVersion: 4,
                  maker: 0,
                  long: POSITION.div(2),
                  short: 0,
                  nextMaker: 0,
                  nextLong: POSITION.div(2),
                  nextShort: 0,
                  collateral: COLLATERAL.sub(EXPECTED_FUNDING),
                  reward: 0,
                  liquidation: false,
                })
                expectAccountEq(await market.accounts(userB.address), {
                  latestVersion: 4,
                  maker: POSITION,
                  long: 0,
                  short: 0,
                  nextMaker: POSITION,
                  nextLong: 0,
                  nextShort: 0,
                  collateral: COLLATERAL.add(TAKER_FEE.add(EXPECTED_FUNDING_WITH_FEE)).sub(8), // loss of precision
                  reward: 0,
                  liquidation: false,
                })
                expectPositionEq(await market.position(), {
                  latestVersion: 4,
                  maker: POSITION,
                  long: POSITION.div(2),
                  short: 0,
                  makerNext: POSITION,
                  longNext: POSITION.div(2),
                  shortNext: 0,
                })
                expectVersionEq(await market.versions(4), {
                  makerValue: { _value: TAKER_FEE.add(EXPECTED_FUNDING_WITH_FEE).div(10) },
                  longValue: { _value: EXPECTED_FUNDING.div(5).mul(-1) },
                  shortValue: { _value: 0 },
                  makerReward: { _value: 0 },
                  longReward: { _value: 0 },
                  shortReward: { _value: 0 },
                })
                expectFeeEq(await market.fee(), {
                  protocol: EXPECTED_FUNDING_FEE.div(2),
                  market: EXPECTED_FUNDING_FEE.div(2),
                })
              })
            })

            context('close', async () => {
              beforeEach(async () => {
                await dsu.mock.transferFrom.withArgs(userB.address, market.address, COLLATERAL.mul(1e12)).returns(true)
                await market.connect(userB).update(userB.address, POSITION, 0, 0, COLLATERAL)
                await market.connect(user).update(user.address, 0, POSITION.div(2), 0, COLLATERAL)
              })

              it('closes the position partially', async () => {
                await expect(market.connect(user).update(user.address, 0, POSITION.div(4), 0, COLLATERAL))
                  .to.emit(market, 'Updated')
                  .withArgs(user.address, 1, 0, POSITION.div(4), 0, COLLATERAL)

                expectAccountEq(await market.accounts(user.address), {
                  latestVersion: ORACLE_VERSION,
                  maker: 0,
                  long: 0,
                  short: 0,
                  nextMaker: 0,
                  nextLong: POSITION.div(4),
                  nextShort: 0,
                  collateral: COLLATERAL,
                  reward: 0,
                  liquidation: false,
                })
                expectPositionEq(await market.position(), {
                  latestVersion: ORACLE_VERSION,
                  maker: 0,
                  long: 0,
                  short: 0,
                  makerNext: POSITION,
                  longNext: POSITION.div(4),
                  shortNext: 0,
                })
                expectVersionEq(await market.versions(ORACLE_VERSION), {
                  makerValue: { _value: 0 },
                  longValue: { _value: 0 },
                  shortValue: { _value: 0 },
                  makerReward: { _value: 0 },
                  longReward: { _value: 0 },
                  shortReward: { _value: 0 },
                })
              })

              it('closes the position', async () => {
                await expect(market.connect(user).update(user.address, 0, 0, 0, COLLATERAL))
                  .to.emit(market, 'Updated')
                  .withArgs(user.address, 1, 0, 0, 0, COLLATERAL)

                expectAccountEq(await market.accounts(user.address), {
                  latestVersion: ORACLE_VERSION,
                  maker: 0,
                  long: 0,
                  short: 0,
                  nextMaker: 0,
                  nextLong: 0,
                  nextShort: 0,
                  collateral: COLLATERAL,
                  reward: 0,
                  liquidation: false,
                })
                expectPositionEq(await market.position(), {
                  latestVersion: ORACLE_VERSION,
                  maker: 0,
                  long: 0,
                  short: 0,
                  makerNext: POSITION,
                  longNext: 0,
                  shortNext: 0,
                })
                expectVersionEq(await market.versions(ORACLE_VERSION), {
                  makerValue: { _value: 0 },
                  longValue: { _value: 0 },
                  shortValue: { _value: 0 },
                  makerReward: { _value: 0 },
                  longReward: { _value: 0 },
                  shortReward: { _value: 0 },
                })
              })

              context('settles first', async () => {
                beforeEach(async () => {
                  await oracle.mock.currentVersion.withArgs().returns(ORACLE_VERSION_2)
                  await oracle.mock.atVersion.withArgs(2).returns(ORACLE_VERSION_2)
                  await oracle.mock.sync.withArgs().returns(ORACLE_VERSION_2)

                  await market.connect(user).settle(user.address)
                })

                it('closes the position', async () => {
                  await expect(market.connect(user).update(user.address, 0, 0, 0, COLLATERAL))
                    .to.emit(market, 'Updated')
                    .withArgs(user.address, 2, 0, 0, 0, COLLATERAL)

                  expectAccountEq(await market.accounts(user.address), {
                    latestVersion: 2,
                    maker: 0,
                    long: POSITION.div(2),
                    short: 0,
                    nextMaker: 0,
                    nextLong: 0,
                    nextShort: 0,
                    collateral: COLLATERAL,
                    reward: 0,
                    liquidation: false,
                  })
                  expectPositionEq(await market.position(), {
                    latestVersion: 2,
                    maker: POSITION,
                    long: POSITION.div(2),
                    short: 0,
                    makerNext: POSITION,
                    longNext: 0,
                    shortNext: 0,
                  })
                  expectVersionEq(await market.versions(2), {
                    makerValue: { _value: 0 },
                    longValue: { _value: 0 },
                    shortValue: { _value: 0 },
                    makerReward: { _value: 0 },
                    longReward: { _value: 0 },
                    shortReward: { _value: 0 },
                  })
                })

                it('closes the position and settles', async () => {
                  await expect(market.connect(user).update(user.address, 0, 0, 0, COLLATERAL))
                    .to.emit(market, 'Updated')
                    .withArgs(user.address, 2, 0, 0, 0, COLLATERAL)

                  await oracle.mock.currentVersion.withArgs().returns(ORACLE_VERSION_3)
                  await oracle.mock.atVersion.withArgs(3).returns(ORACLE_VERSION_3)
                  await oracle.mock.sync.withArgs().returns(ORACLE_VERSION_3)

                  await market.connect(user).settle(user.address)
                  await market.connect(user).settle(userB.address)

                  expectAccountEq(await market.accounts(user.address), {
                    latestVersion: 3,
                    maker: 0,
                    long: 0,
                    short: 0,
                    nextMaker: 0,
                    nextLong: 0,
                    nextShort: 0,
                    collateral: COLLATERAL.sub(EXPECTED_FUNDING),
                    reward: 0,
                    liquidation: false,
                  })
                  expectAccountEq(await market.accounts(userB.address), {
                    latestVersion: 3,
                    maker: POSITION,
                    long: 0,
                    short: 0,
                    nextMaker: POSITION,
                    nextLong: 0,
                    nextShort: 0,
                    collateral: COLLATERAL.add(EXPECTED_FUNDING_WITH_FEE).sub(8), // loss of precision
                    reward: 0,
                    liquidation: false,
                  })
                  expectPositionEq(await market.position(), {
                    latestVersion: 3,
                    maker: POSITION,
                    long: 0,
                    short: 0,
                    makerNext: POSITION,
                    longNext: 0,
                    shortNext: 0,
                  })
                  expectVersionEq(await market.versions(3), {
                    makerValue: { _value: EXPECTED_FUNDING_WITH_FEE.div(10) },
                    longValue: { _value: EXPECTED_FUNDING.div(5).mul(-1) },
                    shortValue: { _value: 0 },
                    makerReward: { _value: 0 },
                    longReward: { _value: 0 },
                    shortReward: { _value: 0 },
                  })
                })

                it('closes a second position (same version)', async () => {
                  await market.connect(user).update(user.address, 0, POSITION.div(4), 0, COLLATERAL)

                  await expect(market.connect(user).update(user.address, 0, 0, 0, COLLATERAL))
                    .to.emit(market, 'Updated')
                    .withArgs(user.address, 2, 0, 0, 0, COLLATERAL)

                  expectAccountEq(await market.accounts(user.address), {
                    latestVersion: 2,
                    maker: 0,
                    long: POSITION.div(2),
                    short: 0,
                    nextMaker: 0,
                    nextLong: 0,
                    nextShort: 0,
                    collateral: COLLATERAL,
                    reward: 0,
                    liquidation: false,
                  })
                  expectPositionEq(await market.position(), {
                    latestVersion: 2,
                    maker: POSITION,
                    long: POSITION.div(2),
                    short: 0,
                    makerNext: POSITION,
                    longNext: 0,
                    shortNext: 0,
                  })
                  expectVersionEq(await market.versions(2), {
                    makerValue: { _value: 0 },
                    longValue: { _value: 0 },
                    shortValue: { _value: 0 },
                    makerReward: { _value: 0 },
                    longReward: { _value: 0 },
                    shortReward: { _value: 0 },
                  })
                })

                it('closes a second position and settles (same version)', async () => {
                  await market.connect(user).update(user.address, 0, POSITION.div(4), 0, COLLATERAL)

                  await expect(market.connect(user).update(user.address, 0, 0, 0, COLLATERAL))
                    .to.emit(market, 'Updated')
                    .withArgs(user.address, 2, 0, 0, 0, COLLATERAL)

                  await oracle.mock.currentVersion.withArgs().returns(ORACLE_VERSION_3)
                  await oracle.mock.atVersion.withArgs(3).returns(ORACLE_VERSION_3)
                  await oracle.mock.sync.withArgs().returns(ORACLE_VERSION_3)

                  await market.connect(user).settle(user.address)
                  await market.connect(user).settle(userB.address)

                  expectAccountEq(await market.accounts(user.address), {
                    latestVersion: 3,
                    maker: 0,
                    long: 0,
                    short: 0,
                    nextMaker: 0,
                    nextLong: 0,
                    nextShort: 0,
                    collateral: COLLATERAL.sub(EXPECTED_FUNDING),
                    reward: 0,
                    liquidation: false,
                  })
                  expectAccountEq(await market.accounts(userB.address), {
                    latestVersion: 3,
                    maker: POSITION,
                    long: 0,
                    short: 0,
                    nextMaker: POSITION,
                    nextLong: 0,
                    nextShort: 0,
                    collateral: COLLATERAL.add(EXPECTED_FUNDING_WITH_FEE).sub(8), // loss of precision
                    reward: 0,
                    liquidation: false,
                  })
                  expectPositionEq(await market.position(), {
                    latestVersion: 3,
                    maker: POSITION,
                    long: 0,
                    short: 0,
                    makerNext: POSITION,
                    longNext: 0,
                    shortNext: 0,
                  })
                  expectVersionEq(await market.versions(3), {
                    makerValue: { _value: EXPECTED_FUNDING_WITH_FEE.div(10) },
                    longValue: { _value: EXPECTED_FUNDING.div(5).mul(-1) },
                    shortValue: { _value: 0 },
                    makerReward: { _value: 0 },
                    longReward: { _value: 0 },
                    shortReward: { _value: 0 },
                  })
                  expectFeeEq(await market.fee(), {
                    protocol: EXPECTED_FUNDING_FEE.div(2),
                    market: EXPECTED_FUNDING_FEE.div(2),
                  })
                })

                it('closes a second position (next version)', async () => {
                  await market.connect(user).update(user.address, 0, POSITION.div(4), 0, COLLATERAL)

                  await oracle.mock.currentVersion.withArgs().returns(ORACLE_VERSION_3)
                  await oracle.mock.atVersion.withArgs(3).returns(ORACLE_VERSION_3)
                  await oracle.mock.sync.withArgs().returns(ORACLE_VERSION_3)

                  await dsu.mock.transferFrom
                    .withArgs(user.address, market.address, EXPECTED_FUNDING.mul(1e12))
                    .returns(true)
                  await expect(market.connect(user).update(user.address, 0, 0, 0, COLLATERAL))
                    .to.emit(market, 'Updated')
                    .withArgs(user.address, 3, 0, 0, 0, COLLATERAL)

                  await market.settle(userB.address)

                  expectAccountEq(await market.accounts(user.address), {
                    latestVersion: 3,
                    maker: 0,
                    long: POSITION.div(4),
                    short: 0,
                    nextMaker: 0,
                    nextLong: 0,
                    nextShort: 0,
                    collateral: COLLATERAL, // EXPECTED_FUNDING paid at update
                    reward: 0,
                    liquidation: false,
                  })
                  expectAccountEq(await market.accounts(userB.address), {
                    latestVersion: 3,
                    maker: POSITION,
                    long: 0,
                    short: 0,
                    nextMaker: POSITION,
                    nextLong: 0,
                    nextShort: 0,
                    collateral: COLLATERAL.add(EXPECTED_FUNDING_WITH_FEE).sub(8), // loss of precision
                    reward: 0,
                    liquidation: false,
                  })
                  expectPositionEq(await market.position(), {
                    latestVersion: 3,
                    maker: POSITION,
                    long: POSITION.div(4),
                    short: 0,
                    makerNext: POSITION,
                    longNext: 0,
                    shortNext: 0,
                  })
                  expectVersionEq(await market.versions(3), {
                    makerValue: { _value: EXPECTED_FUNDING_WITH_FEE.div(10) },
                    longValue: { _value: EXPECTED_FUNDING.div(5).mul(-1) },
                    shortValue: { _value: 0 },
                    makerReward: { _value: 0 },
                    longReward: { _value: 0 },
                    shortReward: { _value: 0 },
                  })
                  expectFeeEq(await market.fee(), {
                    protocol: EXPECTED_FUNDING_FEE.div(2),
                    market: EXPECTED_FUNDING_FEE.div(2),
                  })
                })

                it('closes a second position and settles (next version)', async () => {
                  // rate * elapsed * utilization * maker * price
                  // ( 0.1 * 10^6 / 365 / 24 / 60 / 60 ) * 3600 * 2.5 * 123 = 3510
                  const EXPECTED_FUNDING_2 = ethers.BigNumber.from('3510')
                  const EXPECTED_FUNDING_FEE_2 = EXPECTED_FUNDING_2.div(10)
                  const EXPECTED_FUNDING_WITH_FEE_2 = EXPECTED_FUNDING_2.sub(EXPECTED_FUNDING_FEE_2)

                  await market.connect(user).update(user.address, 0, POSITION.div(4), 0, COLLATERAL)

                  await oracle.mock.currentVersion.withArgs().returns(ORACLE_VERSION_3)
                  await oracle.mock.atVersion.withArgs(3).returns(ORACLE_VERSION_3)
                  await oracle.mock.sync.withArgs().returns(ORACLE_VERSION_3)

                  await dsu.mock.transferFrom
                    .withArgs(user.address, market.address, EXPECTED_FUNDING.mul(1e12))
                    .returns(true)
                  await expect(market.connect(user).update(user.address, 0, 0, 0, COLLATERAL))
                    .to.emit(market, 'Updated')
                    .withArgs(user.address, 3, 0, 0, 0, COLLATERAL)

                  await oracle.mock.currentVersion.withArgs().returns(ORACLE_VERSION_4)
                  await oracle.mock.atVersion.withArgs(4).returns(ORACLE_VERSION_4)
                  await oracle.mock.sync.withArgs().returns(ORACLE_VERSION_4)

                  await market.connect(user).settle(user.address)
                  await market.connect(user).settle(userB.address)

                  expectAccountEq(await market.accounts(user.address), {
                    latestVersion: 4,
                    maker: 0,
                    long: 0,
                    short: 0,
                    nextMaker: 0,
                    nextLong: 0,
                    nextShort: 0,
                    collateral: COLLATERAL.sub(EXPECTED_FUNDING_2), // EXPECTED_FUNDING_1 paid at update
                    reward: 0,
                    liquidation: false,
                  })
                  expectAccountEq(await market.accounts(userB.address), {
                    latestVersion: 4,
                    maker: POSITION,
                    long: 0,
                    short: 0,
                    nextMaker: POSITION,
                    nextLong: 0,
                    nextShort: 0,
                    collateral: COLLATERAL.add(EXPECTED_FUNDING_WITH_FEE).add(EXPECTED_FUNDING_WITH_FEE_2).sub(17), // loss of precision
                    reward: 0,
                    liquidation: false,
                  })
                  expectPositionEq(await market.position(), {
                    latestVersion: 4,
                    maker: POSITION,
                    long: 0,
                    short: 0,
                    makerNext: POSITION,
                    longNext: 0,
                    shortNext: 0,
                  })
                  expectVersionEq(await market.versions(3), {
                    makerValue: { _value: EXPECTED_FUNDING_WITH_FEE.div(10) },
                    longValue: { _value: EXPECTED_FUNDING.div(5).mul(-1) },
                    shortValue: { _value: 0 },
                    makerReward: { _value: 0 },
                    longReward: { _value: 0 },
                    shortReward: { _value: 0 },
                  })
                  expectVersionEq(await market.versions(4), {
                    makerValue: { _value: EXPECTED_FUNDING_WITH_FEE.add(EXPECTED_FUNDING_WITH_FEE_2).div(10).sub(1) }, // loss of precision
                    longValue: { _value: EXPECTED_FUNDING.div(5).add(EXPECTED_FUNDING_2.mul(2).div(5)).mul(-1) },
                    shortValue: { _value: 0 },
                    makerReward: { _value: 0 },
                    longReward: { _value: 0 },
                    shortReward: { _value: 0 },
                  })
                  expectFeeEq(await market.fee(), {
                    protocol: EXPECTED_FUNDING_FEE.add(EXPECTED_FUNDING_FEE_2).div(2),
                    market: EXPECTED_FUNDING_FEE.add(EXPECTED_FUNDING_FEE_2).div(2).add(1), // odd number
                  })
                })

                it('closes the position and settles later', async () => {
                  await expect(market.connect(user).update(user.address, 0, 0, 0, COLLATERAL))
                    .to.emit(market, 'Updated')
                    .withArgs(user.address, 2, 0, 0, 0, COLLATERAL)

                  await oracle.mock.atVersion.withArgs(3).returns(ORACLE_VERSION_3)

                  await oracle.mock.currentVersion.withArgs().returns(ORACLE_VERSION_4)
                  await oracle.mock.atVersion.withArgs(4).returns(ORACLE_VERSION_4)
                  await oracle.mock.sync.withArgs().returns(ORACLE_VERSION_4)

                  await market.connect(user).settle(user.address)
                  await market.connect(user).settle(userB.address)

                  expectAccountEq(await market.accounts(user.address), {
                    latestVersion: 4,
                    maker: 0,
                    long: 0,
                    short: 0,
                    nextMaker: 0,
                    nextLong: 0,
                    nextShort: 0,
                    collateral: COLLATERAL.sub(EXPECTED_FUNDING),
                    reward: 0,
                    liquidation: false,
                  })
                  expectAccountEq(await market.accounts(userB.address), {
                    latestVersion: 4,
                    maker: POSITION,
                    long: 0,
                    short: 0,
                    nextMaker: POSITION,
                    nextLong: 0,
                    nextShort: 0,
                    collateral: COLLATERAL.add(EXPECTED_FUNDING_WITH_FEE).sub(8), // loss of precision
                    reward: 0,
                    liquidation: false,
                  })
                  expectPositionEq(await market.position(), {
                    latestVersion: 4,
                    maker: POSITION,
                    long: 0,
                    short: 0,
                    makerNext: POSITION,
                    longNext: 0,
                    shortNext: 0,
                  })
                  expectVersionEq(await market.versions(4), {
                    makerValue: { _value: EXPECTED_FUNDING_WITH_FEE.div(10) },
                    longValue: { _value: EXPECTED_FUNDING.div(5).mul(-1) },
                    shortValue: { _value: 0 },
                    makerReward: { _value: 0 },
                    longReward: { _value: 0 },
                    shortReward: { _value: 0 },
                  })
                  expectFeeEq(await market.fee(), {
                    protocol: EXPECTED_FUNDING_FEE.div(2),
                    market: EXPECTED_FUNDING_FEE.div(2),
                  })
                })

                it('closes the position and settles later with fee', async () => {
                  const marketParameter = { ...(await market.parameter()) }
                  marketParameter.takerFee = parse6decimal('0.01')
                  await market.updateParameter(marketParameter)

                  const TAKER_FEE = parse6decimal('6.15') // position * taker fee * price

                  await dsu.mock.transferFrom.withArgs(user.address, market.address, TAKER_FEE.mul(1e12)).returns(true)
                  await expect(market.connect(user).update(user.address, 0, 0, 0, COLLATERAL))
                    .to.emit(market, 'Updated')
                    .withArgs(user.address, 2, 0, 0, 0, COLLATERAL)

                  await oracle.mock.atVersion.withArgs(3).returns(ORACLE_VERSION_3)

                  await oracle.mock.currentVersion.withArgs().returns(ORACLE_VERSION_4)
                  await oracle.mock.atVersion.withArgs(4).returns(ORACLE_VERSION_4)
                  await oracle.mock.sync.withArgs().returns(ORACLE_VERSION_4)

                  await market.connect(user).settle(user.address)
                  await market.connect(user).settle(userB.address)

                  expectAccountEq(await market.accounts(user.address), {
                    latestVersion: 4,
                    maker: 0,
                    long: 0,
                    short: 0,
                    nextMaker: 0,
                    nextLong: 0,
                    nextShort: 0,
                    collateral: COLLATERAL.sub(EXPECTED_FUNDING),
                    reward: 0,
                    liquidation: false,
                  })
                  expectAccountEq(await market.accounts(userB.address), {
                    latestVersion: 4,
                    maker: POSITION,
                    long: 0,
                    short: 0,
                    nextMaker: POSITION,
                    nextLong: 0,
                    nextShort: 0,
                    collateral: COLLATERAL.add(EXPECTED_FUNDING_WITH_FEE).add(TAKER_FEE).sub(8), // loss of precision
                    reward: 0,
                    liquidation: false,
                  })
                  expectPositionEq(await market.position(), {
                    latestVersion: 4,
                    maker: POSITION,
                    long: 0,
                    short: 0,
                    makerNext: POSITION,
                    longNext: 0,
                    shortNext: 0,
                  })
                  expectVersionEq(await market.versions(4), {
                    makerValue: { _value: EXPECTED_FUNDING_WITH_FEE.add(TAKER_FEE).div(10) },
                    longValue: { _value: EXPECTED_FUNDING.div(5).mul(-1) },
                    shortValue: { _value: 0 },
                    makerReward: { _value: 0 },
                    longReward: { _value: 0 },
                    shortReward: { _value: 0 },
                  })
                  expectFeeEq(await market.fee(), {
                    protocol: EXPECTED_FUNDING_FEE.div(2),
                    market: EXPECTED_FUNDING_FEE.div(2),
                  })
                })
              })
            })
          })

          context('price delta', async () => {
            beforeEach(async () => {
              await dsu.mock.transferFrom.withArgs(userB.address, market.address, COLLATERAL.mul(1e12)).returns(true)
              await market.connect(userB).update(userB.address, POSITION, 0, 0, COLLATERAL)
              await market.connect(user).update(user.address, 0, POSITION.div(2), 0, COLLATERAL)

              await oracle.mock.currentVersion.withArgs().returns(ORACLE_VERSION_2)
              await oracle.mock.atVersion.withArgs(2).returns(ORACLE_VERSION_2)
              await oracle.mock.sync.withArgs().returns(ORACLE_VERSION_2)

              await market.connect(user).settle(user.address)
              await market.connect(user).settle(userB.address)
            })

            it('same price same timestamp settle', async () => {
              const oracleVersionSameTimestamp = {
                price: PRICE,
                timestamp: TIMESTAMP + 3600,
                version: 3,
              }

              await oracle.mock.currentVersion.withArgs().returns(oracleVersionSameTimestamp)
              await oracle.mock.atVersion.withArgs(3).returns(oracleVersionSameTimestamp)
              await oracle.mock.sync.withArgs().returns(oracleVersionSameTimestamp)

              await market.connect(user).settle(user.address)
              await market.connect(userB).settle(userB.address)

              expectAccountEq(await market.accounts(user.address), {
                latestVersion: 3,
                maker: 0,
                long: POSITION.div(2),
                short: 0,
                nextMaker: 0,
                nextLong: POSITION.div(2),
                nextShort: 0,
                collateral: COLLATERAL,
                reward: 0,
                liquidation: false,
              })
              expectAccountEq(await market.accounts(userB.address), {
                latestVersion: 3,
                maker: POSITION,
                long: 0,
                short: 0,
                nextMaker: POSITION,
                nextLong: 0,
                nextShort: 0,
                collateral: COLLATERAL,
                reward: 0,
                liquidation: false,
              })
              expectPositionEq(await market.position(), {
                latestVersion: 3,
                maker: POSITION,
                long: POSITION.div(2),
                short: 0,
                makerNext: POSITION,
                longNext: POSITION.div(2),
                shortNext: 0,
              })
              expectVersionEq(await market.versions(3), {
                makerValue: { _value: 0 },
                longValue: { _value: 0 },
                shortValue: { _value: 0 },
                makerReward: { _value: 0 },
                longReward: { _value: 0 },
                shortReward: { _value: 0 },
              })
              expectFeeEq(await market.fee(), {
                protocol: 0,
                market: 0,
              })
            })

            it('lower price same rate settle', async () => {
              await dsu.mock.balanceOf.withArgs(market.address).returns(COLLATERAL.mul(1e12).mul(2))

              const EXPECTED_PNL = parse6decimal('2').mul(5) // maker pnl

              const oracleVersionLowerPrice = {
                price: parse6decimal('121'),
                timestamp: TIMESTAMP + 7200,
                version: 3,
              }
              await oracle.mock.currentVersion.withArgs().returns(oracleVersionLowerPrice)
              await oracle.mock.atVersion.withArgs(3).returns(oracleVersionLowerPrice)
              await oracle.mock.sync.withArgs().returns(oracleVersionLowerPrice)

              await market.connect(user).settle(user.address)
              await market.connect(user).settle(userB.address)

              expectAccountEq(await market.accounts(user.address), {
                latestVersion: 3,
                maker: 0,
                long: POSITION.div(2),
                short: 0,
                nextMaker: 0,
                nextLong: POSITION.div(2),
                nextShort: 0,
                collateral: COLLATERAL.sub(EXPECTED_PNL).sub(EXPECTED_FUNDING),
                reward: 0,
                liquidation: false,
              })
              expectAccountEq(await market.accounts(userB.address), {
                latestVersion: 3,
                maker: POSITION,
                long: 0,
                short: 0,
                nextMaker: POSITION,
                nextLong: 0,
                nextShort: 0,
                collateral: COLLATERAL.add(EXPECTED_PNL).add(EXPECTED_FUNDING_WITH_FEE).sub(8), // loss of precision
                reward: 0,
                liquidation: false,
              })
              expectPositionEq(await market.position(), {
                latestVersion: 3,
                maker: POSITION,
                long: POSITION.div(2),
                short: 0,
                makerNext: POSITION,
                longNext: POSITION.div(2),
                shortNext: 0,
              })
              expectVersionEq(await market.versions(3), {
                makerValue: { _value: EXPECTED_PNL.add(EXPECTED_FUNDING_WITH_FEE).div(10) },
                longValue: { _value: EXPECTED_PNL.add(EXPECTED_FUNDING).div(5).mul(-1) },
                shortValue: { _value: 0 },
                makerReward: { _value: 0 },
                longReward: { _value: 0 },
                shortReward: { _value: 0 },
              })
              expectFeeEq(await market.fee(), {
                protocol: EXPECTED_FUNDING_FEE.div(2),
                market: EXPECTED_FUNDING_FEE.div(2),
              })
            })

            it('higher price same rate settle', async () => {
              const EXPECTED_PNL = parse6decimal('-2').mul(5) // maker pnl

              const oracleVersionHigherPrice = {
                price: parse6decimal('125'),
                timestamp: TIMESTAMP + 7200,
                version: 3,
              }
              await oracle.mock.currentVersion.withArgs().returns(oracleVersionHigherPrice)
              await oracle.mock.atVersion.withArgs(3).returns(oracleVersionHigherPrice)
              await oracle.mock.sync.withArgs().returns(oracleVersionHigherPrice)

              await market.connect(user).settle(user.address)
              await market.connect(user).settle(userB.address)

              expectAccountEq(await market.accounts(user.address), {
                latestVersion: 3,
                maker: 0,
                long: POSITION.div(2),
                short: 0,
                nextMaker: 0,
                nextLong: POSITION.div(2),
                nextShort: 0,
                collateral: COLLATERAL.sub(EXPECTED_PNL).sub(EXPECTED_FUNDING),
                reward: 0,
                liquidation: false,
              })
              expectAccountEq(await market.accounts(userB.address), {
                latestVersion: 3,
                maker: POSITION,
                long: 0,
                short: 0,
                nextMaker: POSITION,
                nextLong: 0,
                nextShort: 0,
                collateral: COLLATERAL.add(EXPECTED_PNL).add(EXPECTED_FUNDING_WITH_FEE).sub(8), // loss of precision
                reward: 0,
                liquidation: false,
              })
              expectPositionEq(await market.position(), {
                latestVersion: 3,
                maker: POSITION,
                long: POSITION.div(2),
                short: 0,
                makerNext: POSITION,
                longNext: POSITION.div(2),
                shortNext: 0,
              })
              expectVersionEq(await market.versions(3), {
                makerValue: { _value: EXPECTED_PNL.add(EXPECTED_FUNDING_WITH_FEE).div(10).sub(1) }, // loss of precision
                longValue: { _value: EXPECTED_PNL.add(EXPECTED_FUNDING).div(5).mul(-1) },
                shortValue: { _value: 0 },
                makerReward: { _value: 0 },
                longReward: { _value: 0 },
                shortReward: { _value: 0 },
              })
              expectFeeEq(await market.fee(), {
                protocol: EXPECTED_FUNDING_FEE.div(2),
                market: EXPECTED_FUNDING_FEE.div(2),
              })
            })
          })

          context('liquidation', async () => {
            beforeEach(async () => {
              await dsu.mock.transferFrom.withArgs(userB.address, market.address, utils.parseEther('450')).returns(true)
              await market.connect(userB).update(userB.address, POSITION, 0, 0, parse6decimal('450'))
              await dsu.mock.transferFrom.withArgs(user.address, market.address, COLLATERAL.mul(1e12)).returns(true)
              await market.connect(user).update(user.address, 0, POSITION.div(2), 0, COLLATERAL)
            })

            it('with socialization to zero', async () => {
              await oracle.mock.currentVersion.withArgs().returns(ORACLE_VERSION_2)
              await oracle.mock.atVersion.withArgs(2).returns(ORACLE_VERSION_2)
              await oracle.mock.sync.withArgs().returns(ORACLE_VERSION_2)

              await market.connect(user).settle(user.address)
              await market.connect(user).settle(userB.address)

              const EXPECTED_PNL = parse6decimal('27').mul(5)
              const EXPECTED_LIQUIDATION_FEE = parse6decimal('45')

              // rate * elapsed * utilization * maker * price
              // ( 0.1 * 10^6 / 365 / 24 / 60 / 60 ) * 3600 * 5 * 150 = 8565
              const EXPECTED_FUNDING_2 = BigNumber.from('8565')
              const EXPECTED_FUNDING_FEE_2 = EXPECTED_FUNDING_2.div(10)
              const EXPECTED_FUNDING_WITH_FEE_2 = EXPECTED_FUNDING_2.sub(EXPECTED_FUNDING_FEE_2)

              const oracleVersionHigherPrice = {
                price: parse6decimal('150'),
                timestamp: TIMESTAMP + 7200,
                version: 3,
              }
              await oracle.mock.currentVersion.withArgs().returns(oracleVersionHigherPrice)
              await oracle.mock.atVersion.withArgs(3).returns(oracleVersionHigherPrice)
              await oracle.mock.sync.withArgs().returns(oracleVersionHigherPrice)

              await market.connect(user).settle(user.address)
              await dsu.mock.transfer.withArgs(liquidator.address, EXPECTED_LIQUIDATION_FEE.mul(1e12)).returns(true)
              await dsu.mock.balanceOf.withArgs(market.address).returns(COLLATERAL.mul(1e12))

              await expect(market.connect(liquidator).settle(userB.address))
                .to.emit(market, 'Liquidation')
                .withArgs(userB.address, liquidator.address, EXPECTED_LIQUIDATION_FEE)

              await oracle.mock.currentVersion.withArgs().returns(ORACLE_VERSION_4)
              await oracle.mock.atVersion.withArgs(4).returns(ORACLE_VERSION_4)
              await oracle.mock.sync.withArgs().returns(ORACLE_VERSION_4)

              await market.connect(user).settle(user.address)
              await market.connect(user).settle(userB.address)

              const oracleVersionHigherPrice2 = {
                price: parse6decimal('150'),
                timestamp: TIMESTAMP + 14400,
                version: 5,
              }
              await oracle.mock.currentVersion.withArgs().returns(oracleVersionHigherPrice2)
              await oracle.mock.atVersion.withArgs(5).returns(oracleVersionHigherPrice2)
              await oracle.mock.sync.withArgs().returns(oracleVersionHigherPrice2)

              await market.connect(user).settle(user.address)
              await market.connect(user).settle(userB.address)

              expectAccountEq(await market.accounts(user.address), {
                latestVersion: 5,
                maker: 0,
                long: POSITION.div(2),
                short: 0,
                nextMaker: 0,
                nextLong: POSITION.div(2),
                nextShort: 0,
                collateral: COLLATERAL.sub(EXPECTED_FUNDING).sub(EXPECTED_FUNDING_2),
                reward: 0,
                liquidation: false,
              })
              expectAccountEq(await market.accounts(userB.address), {
                latestVersion: 5,
                maker: 0,
                long: 0,
                short: 0,
                nextMaker: 0,
                nextLong: 0,
                nextShort: 0,
                collateral: parse6decimal('450')
                  .add(EXPECTED_FUNDING_WITH_FEE)
                  .add(EXPECTED_FUNDING_WITH_FEE_2)
                  .sub(EXPECTED_LIQUIDATION_FEE)
                  .sub(17), // loss of precision
                reward: 0,
                liquidation: false,
              })
              expectPositionEq(await market.position(), {
                latestVersion: 5,
                maker: 0,
                long: POSITION.div(2),
                short: 0,
                makerNext: 0,
                longNext: POSITION.div(2),
                shortNext: 0,
              })
              expectVersionEq(await market.versions(3), {
                makerValue: { _value: EXPECTED_FUNDING_WITH_FEE.sub(EXPECTED_PNL).div(10).sub(1) }, // loss of precision
                longValue: { _value: EXPECTED_FUNDING.sub(EXPECTED_PNL).div(5).mul(-1) },
                shortValue: { _value: 0 },
                makerReward: { _value: 0 },
                longReward: { _value: 0 },
                shortReward: { _value: 0 },
              })
              expectVersionEq(await market.versions(4), {
                makerValue: { _value: EXPECTED_FUNDING_WITH_FEE.add(EXPECTED_FUNDING_WITH_FEE_2).div(10).sub(1) }, // loss of precision
                longValue: { _value: EXPECTED_FUNDING.add(EXPECTED_FUNDING_2).div(5).mul(-1) },
                shortValue: { _value: 0 },
                makerReward: { _value: 0 },
                longReward: { _value: 0 },
                shortReward: { _value: 0 },
              })
              expectVersionEq(await market.versions(5), {
                makerValue: { _value: EXPECTED_FUNDING_WITH_FEE.add(EXPECTED_FUNDING_WITH_FEE_2).div(10).sub(1) }, // loss of precision
                longValue: { _value: EXPECTED_FUNDING.add(EXPECTED_FUNDING_2).div(5).mul(-1) },
                shortValue: { _value: 0 },
                makerReward: { _value: 0 },
                longReward: { _value: 0 },
                shortReward: { _value: 0 },
              })
              expectFeeEq(await market.fee(), {
                protocol: EXPECTED_FUNDING_FEE.add(EXPECTED_FUNDING_FEE_2).div(2),
                market: EXPECTED_FUNDING_FEE.add(EXPECTED_FUNDING_FEE_2).div(2),
              })
            })

            it('with partial socialization', async () => {
              await dsu.mock.transferFrom.withArgs(userC.address, market.address, COLLATERAL.mul(1e12)).returns(true)
              await market.connect(userC).update(userC.address, POSITION.div(4), 0, 0, COLLATERAL)

              await oracle.mock.currentVersion.withArgs().returns(ORACLE_VERSION_2)
              await oracle.mock.atVersion.withArgs(2).returns(ORACLE_VERSION_2)
              await oracle.mock.sync.withArgs().returns(ORACLE_VERSION_2)

              await market.connect(user).settle(user.address)
              await market.connect(user).settle(userB.address)
              await market.connect(user).settle(userC.address)

              const EXPECTED_PNL = parse6decimal('27').mul(5).div(2)
              const EXPECTED_LIQUIDATION_FEE = parse6decimal('45')

              // rate * elapsed * utilization * maker * price
              // ( 0.1 * 10^6 / 365 / 24 / 60 / 60 ) * 3600 * 5 * 150 = 8565
              const EXPECTED_FUNDING_2 = BigNumber.from('8565')
              const EXPECTED_FUNDING_FEE_2 = EXPECTED_FUNDING_2.div(10)
              const EXPECTED_FUNDING_WITH_FEE_2 = EXPECTED_FUNDING_2.sub(EXPECTED_FUNDING_FEE_2)

              // rate * elapsed * utilization * maker * price
              // ( 0.1 * 10^6 / 365 / 24 / 60 / 60 ) * 3600 * 2.5 * 123 = 3510
              const EXPECTED_FUNDING_3 = BigNumber.from('3510')
              const EXPECTED_FUNDING_FEE_3 = EXPECTED_FUNDING_3.div(10)
              const EXPECTED_FUNDING_WITH_FEE_3 = EXPECTED_FUNDING_3.sub(EXPECTED_FUNDING_FEE_3)

              const oracleVersionHigherPrice = {
                price: parse6decimal('150'),
                timestamp: TIMESTAMP + 7200,
                version: 3,
              }
              await oracle.mock.currentVersion.withArgs().returns(oracleVersionHigherPrice)
              await oracle.mock.atVersion.withArgs(3).returns(oracleVersionHigherPrice)
              await oracle.mock.sync.withArgs().returns(oracleVersionHigherPrice)

              await market.connect(user).settle(user.address)
              await market.connect(user).settle(userC.address)
              await dsu.mock.transfer.withArgs(liquidator.address, EXPECTED_LIQUIDATION_FEE.mul(1e12)).returns(true)
              await dsu.mock.balanceOf.withArgs(market.address).returns(COLLATERAL.mul(1e12))
              await expect(market.connect(liquidator).settle(userB.address))
                .to.emit(market, 'Liquidation')
                .withArgs(userB.address, liquidator.address, EXPECTED_LIQUIDATION_FEE)

              await oracle.mock.currentVersion.withArgs().returns(ORACLE_VERSION_4)
              await oracle.mock.atVersion.withArgs(4).returns(ORACLE_VERSION_4)
              await oracle.mock.sync.withArgs().returns(ORACLE_VERSION_4)

              await market.connect(user).settle(user.address)
              await market.connect(user).settle(userB.address)
              await market.connect(user).settle(userC.address)

              const oracleVersionHigherPrice2 = {
                price: parse6decimal('150'),
                timestamp: TIMESTAMP + 14400,
                version: 5,
              }
              await oracle.mock.currentVersion.withArgs().returns(oracleVersionHigherPrice2)
              await oracle.mock.atVersion.withArgs(5).returns(oracleVersionHigherPrice2)
              await oracle.mock.sync.withArgs().returns(oracleVersionHigherPrice2)

              await market.connect(user).settle(user.address)
              await market.connect(user).settle(userB.address)
              await market.connect(user).settle(userC.address)

              expectAccountEq(await market.accounts(user.address), {
                latestVersion: 5,
                maker: 0,
                long: POSITION.div(2),
                short: 0,
                nextMaker: 0,
                nextLong: POSITION.div(2),
                nextShort: 0,
                collateral: COLLATERAL.sub(EXPECTED_FUNDING)
                  .sub(EXPECTED_FUNDING_2)
                  .sub(EXPECTED_FUNDING_3)
                  .add(EXPECTED_PNL),
                reward: 0,
                liquidation: false,
              })
              expectAccountEq(await market.accounts(userB.address), {
                latestVersion: 5,
                maker: 0,
                long: 0,
                short: 0,
                nextMaker: 0,
                nextLong: 0,
                nextShort: 0,
                collateral: parse6decimal('450')
                  .add(EXPECTED_FUNDING_WITH_FEE.mul(4).div(5))
                  .add(EXPECTED_FUNDING_WITH_FEE_2.mul(4).div(5))
                  .sub(EXPECTED_LIQUIDATION_FEE)
                  .sub(11), // loss of precision
                reward: 0,
                liquidation: false,
              })
              expectAccountEq(await market.accounts(userC.address), {
                latestVersion: 5,
                maker: POSITION.div(4),
                long: 0,
                short: 0,
                nextMaker: POSITION.div(4),
                nextLong: 0,
                nextShort: 0,
                collateral: COLLATERAL.add(EXPECTED_FUNDING_WITH_FEE.div(5))
                  .add(EXPECTED_FUNDING_WITH_FEE_2.div(5))
                  .add(EXPECTED_FUNDING_WITH_FEE_3)
                  .sub(EXPECTED_PNL)
                  .sub(4), // loss of precision
                reward: 0,
                liquidation: false,
              })
              expectPositionEq(await market.position(), {
                latestVersion: 5,
                maker: POSITION.div(4),
                long: POSITION.div(2),
                short: 0,
                makerNext: POSITION.div(4),
                longNext: POSITION.div(2),
                shortNext: 0,
              })
              expectVersionEq(await market.versions(3), {
                makerValue: { _value: EXPECTED_FUNDING_WITH_FEE.sub(EXPECTED_PNL.mul(2)).mul(2).div(25).sub(1) }, // loss of precision
                longValue: { _value: EXPECTED_FUNDING.sub(EXPECTED_PNL.mul(2)).div(5).mul(-1) },
                shortValue: { _value: 0 },
                makerReward: { _value: 0 },
                longReward: { _value: 0 },
                shortReward: { _value: 0 },
              })
              expectVersionEq(await market.versions(4), {
                makerValue: {
                  _value: EXPECTED_FUNDING_WITH_FEE.add(EXPECTED_FUNDING_WITH_FEE_2).mul(2).div(25).sub(1),
                }, // loss of precision
                longValue: { _value: EXPECTED_FUNDING.add(EXPECTED_FUNDING_2).div(5).mul(-1) },
                shortValue: { _value: 0 },
                makerReward: { _value: 0 },
                longReward: { _value: 0 },
                shortReward: { _value: 0 },
              })
              expectVersionEq(await market.versions(5), {
                makerValue: {
                  _value: EXPECTED_FUNDING_WITH_FEE.add(EXPECTED_FUNDING_WITH_FEE_2)
                    .mul(2)
                    .div(25)
                    .add(EXPECTED_FUNDING_WITH_FEE_3.mul(2).div(5))
                    .sub(EXPECTED_PNL.mul(2).div(5))
                    .sub(1), // loss of precision
                },
                longValue: {
                  _value: EXPECTED_FUNDING.add(EXPECTED_FUNDING_2)
                    .add(EXPECTED_FUNDING_3)
                    .sub(EXPECTED_PNL)
                    .div(5)
                    .mul(-1),
                },
                shortValue: { _value: 0 },
                makerReward: { _value: 0 },
                longReward: { _value: 0 },
                shortReward: { _value: 0 },
              })
              expectFeeEq(await market.fee(), {
                protocol: EXPECTED_FUNDING_FEE.add(EXPECTED_FUNDING_FEE_2).add(EXPECTED_FUNDING_FEE_3).div(2),
                market: EXPECTED_FUNDING_FEE.add(EXPECTED_FUNDING_FEE_2).add(EXPECTED_FUNDING_FEE_3).div(2).add(1), // odd amount
              })
            })

            it('with shortfall', async () => {
              await oracle.mock.currentVersion.withArgs().returns(ORACLE_VERSION_2)
              await oracle.mock.atVersion.withArgs(2).returns(ORACLE_VERSION_2)
              await oracle.mock.sync.withArgs().returns(ORACLE_VERSION_2)

              await market.connect(user).settle(user.address)
              await market.connect(user).settle(userB.address)

              const EXPECTED_PNL = parse6decimal('80').mul(5)
              const EXPECTED_LIQUIDATION_FEE = parse6decimal('60.9')

              // rate * elapsed * utilization * maker * price
              // ( 0.1 * 10^6 / 365 / 24 / 60 / 60 ) * 3600 * 5 * 203 = 8565
              const EXPECTED_FUNDING_2 = BigNumber.from('11586')
              const EXPECTED_FUNDING_FEE_2 = EXPECTED_FUNDING_2.div(10)
              const EXPECTED_FUNDING_WITH_FEE_2 = EXPECTED_FUNDING_2.sub(EXPECTED_FUNDING_FEE_2)

              const oracleVersionHigherPrice = {
                price: parse6decimal('203'),
                timestamp: TIMESTAMP + 7200,
                version: 3,
              }
              await oracle.mock.currentVersion.withArgs().returns(oracleVersionHigherPrice)
              await oracle.mock.atVersion.withArgs(3).returns(oracleVersionHigherPrice)
              await oracle.mock.sync.withArgs().returns(oracleVersionHigherPrice)

              await market.connect(user).settle(user.address)
              await dsu.mock.transfer.withArgs(liquidator.address, EXPECTED_LIQUIDATION_FEE.mul(1e12)).returns(true)
              await dsu.mock.balanceOf.withArgs(market.address).returns(COLLATERAL.mul(1e12))

              await expect(market.connect(liquidator).settle(userB.address))
                .to.emit(market, 'Liquidation')
                .withArgs(userB.address, liquidator.address, EXPECTED_LIQUIDATION_FEE)

              expectAccountEq(await market.accounts(user.address), {
                latestVersion: 3,
                maker: 0,
                long: POSITION.div(2),
                short: 0,
                nextMaker: 0,
                nextLong: POSITION.div(2),
                nextShort: 0,
                collateral: COLLATERAL.sub(EXPECTED_FUNDING).add(EXPECTED_PNL),
                reward: 0,
                liquidation: false,
              })
              expectAccountEq(await market.accounts(userB.address), {
                latestVersion: 3,
                maker: POSITION,
                long: 0,
                short: 0,
                nextMaker: 0,
                nextLong: 0,
                nextShort: 0,
                collateral: parse6decimal('450')
                  .add(EXPECTED_FUNDING_WITH_FEE)
                  .sub(EXPECTED_LIQUIDATION_FEE)
                  .sub(EXPECTED_PNL)
                  .sub(8), // loss of precision
                reward: 0,
                liquidation: true,
              })
              expectPositionEq(await market.position(), {
                latestVersion: 3,
                maker: POSITION,
                long: POSITION.div(2),
                short: 0,
                makerNext: 0,
                longNext: POSITION.div(2),
                shortNext: 0,
              })
              expectVersionEq(await market.versions(3), {
                makerValue: { _value: EXPECTED_FUNDING_WITH_FEE.sub(EXPECTED_PNL).div(10).sub(1) }, // loss of precision
                longValue: { _value: EXPECTED_FUNDING.sub(EXPECTED_PNL).div(5).mul(-1) },
                shortValue: { _value: 0 },
                makerReward: { _value: 0 },
                longReward: { _value: 0 },
                shortReward: { _value: 0 },
              })
              expectFeeEq(await market.fee(), {
                protocol: EXPECTED_FUNDING_FEE.div(2),
                market: EXPECTED_FUNDING_FEE.div(2),
              })

              const oracleVersionHigherPrice2 = {
                price: parse6decimal('203'),
                timestamp: TIMESTAMP + 10800,
                version: 4,
              }
              await oracle.mock.currentVersion.withArgs().returns(oracleVersionHigherPrice2)
              await oracle.mock.atVersion.withArgs(4).returns(oracleVersionHigherPrice2)
              await oracle.mock.sync.withArgs().returns(oracleVersionHigherPrice2)

              const shortfall = parse6decimal('450')
                .add(EXPECTED_FUNDING_WITH_FEE)
                .add(EXPECTED_FUNDING_WITH_FEE_2)
                .sub(EXPECTED_LIQUIDATION_FEE)
                .sub(EXPECTED_PNL)
                .sub(16) // loss of precision
              console.log(shortfall)
              await dsu.mock.transferFrom
                .withArgs(liquidator.address, market.address, shortfall.mul(-1).mul(1e12))
                .returns(true)
              await factory.mock.operators.withArgs(userB.address, liquidator.address).returns(false)
              await expect(market.connect(liquidator).update(userB.address, 0, 0, 0, 0))
                .to.emit(market, 'Updated')
                .withArgs(userB.address, 4, 0, 0, 0, 0)

              expectAccountEq(await market.accounts(userB.address), {
                latestVersion: 4,
                maker: 0,
                long: 0,
                short: 0,
                nextMaker: 0,
                nextLong: 0,
                nextShort: 0,
                collateral: 0,
                reward: 0,
                liquidation: false,
              })
            })
          })

          context('closed', async () => {
            beforeEach(async () => {
              await market.connect(user).update(user.address, POSITION, 0, 0, COLLATERAL)
              await market.connect(userB).update(userB.address, 0, POSITION.div(2), 0, COLLATERAL)

              await oracle.mock.currentVersion.withArgs().returns(ORACLE_VERSION_2)
              await oracle.mock.atVersion.withArgs(2).returns(ORACLE_VERSION_2)
              await oracle.mock.sync.withArgs().returns(ORACLE_VERSION_2)

              await market.connect(user).settle(user.address)
              await market.connect(user).settle(userB.address)
            })

            it('zeroes PnL and fees (price change)', async () => {
              await collateral.mock.settleMarket.withArgs(EXPECTED_FUNDING_FEE).returns()
              await collateral.mock.settleAccount.withArgs(user.address, EXPECTED_FUNDING_WITH_FEE).returns()
              await collateral.mock.settleAccount.withArgs(userB.address, -1 * EXPECTED_FUNDING).returns()

              await oracle.mock.currentVersion.withArgs().returns(ORACLE_VERSION_3)
              await oracle.mock.atVersion.withArgs(3).returns(ORACLE_VERSION_3)
              await incentivizer.mock.sync.withArgs(ORACLE_VERSION_3).returns()
              await oracle.mock.sync.withArgs().returns(ORACLE_VERSION_3)

              await expect(market.connect(owner).updateClosed(true))
                .to.emit(market, 'ClosedUpdated')
                .withArgs(true, 3)
                .to.emit(market, 'Settle')
                .withArgs(3, 3)
              expect(await market.closed()).to.be.true

              await expect(market.connect(user).settleAccount(user.address))
                .to.emit(market, 'AccountSettle')
                .withArgs(user.address, 3, 3)
              await expect(market.connect(userB).settleAccount(userB.address))
                .to.emit(market, 'AccountSettle')
                .withArgs(userB.address, 3, 3)

              const oracleVersionHigherPrice_0 = {
                price: utils.parseEther('125'),
                timestamp: TIMESTAMP + 10800,
                version: 4,
              }
              const oracleVersionHigherPrice_1 = {
                price: utils.parseEther('128'),
                timestamp: TIMESTAMP + 10800,
                version: 5,
              }
              await oracle.mock.currentVersion.withArgs().returns(oracleVersionHigherPrice_0)
              await oracle.mock.atVersion.withArgs(4).returns(oracleVersionHigherPrice_0)
              await incentivizer.mock.sync.withArgs(oracleVersionHigherPrice_0).returns()

              await oracle.mock.currentVersion.withArgs().returns(oracleVersionHigherPrice_1)
              await oracle.mock.atVersion.withArgs(5).returns(oracleVersionHigherPrice_1)
              await incentivizer.mock.sync.withArgs(oracleVersionHigherPrice_1).returns()
              await oracle.mock.sync.withArgs().returns(oracleVersionHigherPrice_1)

              await expect(market.connect(user).settle()).to.emit(market, 'Settle').withArgs(5, 5)

              expect(await market['latestVersion()']()).to.equal(5)
              expectPositionEq(await market.positionAtVersion(3), { maker: POSITION, taker: POSITION.div(2) })
              expectPositionEq(await market.positionAtVersion(5), { maker: POSITION, taker: POSITION.div(2) })
              expectPrePositionEq(await market['pre()'](), {
                oracleVersion: 0,
                openPosition: { maker: 0, taker: 0 },
                closePosition: { maker: 0, taker: 0 },
              })
              expectPositionEq(await market.valueAtVersion(3), {
                maker: EXPECTED_FUNDING_WITH_FEE / 10,
                taker: (-1 * EXPECTED_FUNDING) / 5,
              })
              expectPositionEq(await market.shareAtVersion(3), {
                maker: utils.parseEther('0.1').mul(3600),
                taker: utils.parseEther('0.2').mul(3600),
              })
              expectPositionEq(await market.valueAtVersion(5), {
                maker: EXPECTED_FUNDING_WITH_FEE / 10,
                taker: (-1 * EXPECTED_FUNDING) / 5,
              })
              expectPositionEq(await market.shareAtVersion(5), {
                maker: utils.parseEther('0.1').mul(7200),
                taker: utils.parseEther('0.2').mul(7200),
              })

              await expect(market.connect(user).settleAccount(user.address))
                .to.emit(market, 'AccountSettle')
                .withArgs(user.address, 5, 5)

              expectPositionEq(await market.position(user.address), { maker: POSITION, taker: 0 })
              expectPrePositionEq(await market['pre(address)'](user.address), {
                oracleVersion: 0,
                openPosition: { maker: 0, taker: 0 },
                closePosition: { maker: 0, taker: 0 },
              })
              expect(await market['latestVersion(address)'](user.address)).to.equal(5)

              await expect(market.connect(userB).settleAccount(userB.address))
                .to.emit(market, 'AccountSettle')
                .withArgs(userB.address, 5, 5)

              expectPositionEq(await market.position(userB.address), { maker: 0, taker: POSITION.div(2) })
              expectPrePositionEq(await market['pre(address)'](userB.address), {
                oracleVersion: 0,
                openPosition: { maker: 0, taker: 0 },
                closePosition: { maker: 0, taker: 0 },
              })
              expect(await market['latestVersion(address)'](userB.address)).to.equal(5)
            })
          })
        })

        //TODO: short position

        //TODO: all position

        context('invariant violations', async () => {
          it('reverts if can liquidate', async () => {
            await dsu.mock.transferFrom.withArgs(user.address, market.address, utils.parseEther('500')).returns(true)
            await expect(
              market.connect(user).update(user.address, parse6decimal('1000'), 0, 0, parse6decimal('500')),
            ).to.be.revertedWith('MarketInsufficientCollateralError()')
          })

          it('reverts if paused', async () => {
            await factory.mock.parameter.withArgs().returns({
              protocolFee: parse6decimal('0.50'),
              minFundingFee: parse6decimal('0.10'),
              liquidationFee: parse6decimal('0.50'),
              minCollateral: parse6decimal('500'),
              paused: true,
            })
            await expect(market.connect(user).update(user.address, POSITION, 0, 0, COLLATERAL)).to.be.revertedWith(
              'PausedError()',
            )
          })

          it('reverts if over maker limit', async () => {
            const marketParameter = { ...(await market.parameter()) }
            marketParameter.makerLimit = POSITION.div(2)
            await market.updateParameter(marketParameter)
            await expect(market.connect(user).update(user.address, POSITION, 0, 0, COLLATERAL)).to.be.revertedWith(
              'MarketMakerOverLimitError()',
            )
          })

          it('reverts if closed', async () => {
            const marketParameter = { ...(await market.parameter()) }
            marketParameter.closed = true
            await market.updateParameter(marketParameter)
            await expect(market.connect(user).update(user.address, POSITION, 0, 0, COLLATERAL)).to.be.revertedWith(
              'MarketClosedError()',
            )
          })

          it('reverts if taker > maker', async () => {
            const socialization = utils.parseEther('0.5')
            await expect(market.connect(user).openTake(POSITION.mul(4))).to.be.revertedWith(
              `MarketInsufficientLiquidityError(${socialization})`,
            )
          })

          it('reverts if in liquidation', async () => {
            await market.connect(collateralSigner).closeAll(user.address)
            await expect(market.connect(user).openTake(POSITION)).to.be.revertedWith('MarketInLiquidationError()')
          })

          it('reverts if paused', async () => {
            await factory.mock.paused.withArgs().returns(true)
            await expect(market.connect(user).openTake(POSITION)).to.be.revertedWith('PausedError()')
          })

          it('reverts if closed', async () => {
            await market.updateClosed(true)
            await expect(market.connect(user).openTake(POSITION)).to.be.revertedWith('MarketClosedError()')
          })

          it('reverts if underflow', async () => {
            await expect(market.connect(user).closeTake(POSITION.mul(2))).to.be.revertedWith('MarketOverClosedError()')
          })

          it('reverts if in liquidation', async () => {
            await market.connect(collateralSigner).closeAll(user.address)
            await expect(market.connect(user).closeTake(POSITION)).to.be.revertedWith('MarketInLiquidationError()')
          })

          it('reverts if paused', async () => {
            await factory.mock.paused.withArgs().returns(true)
            await expect(market.connect(user).closeTake(POSITION)).to.be.revertedWith('PausedError()')
          })
          //TODO: more revert states?
        })

        //TODO: operator
      })

      // TODO: short market
      // TODO: long contract payoff market
      // TODO: short contract payoff market
    })

    describe('#settle', async () => {
      it('credits the account', async () => {
        await expect(collateral.connect(marketSigner).settleAccount(user.address, 101))
          .to.emit(collateral, 'AccountSettle')
          .withArgs(market.address, user.address, 101, 0)
        expect(await collateral['collateral(address,address)'](user.address, market.address)).to.equal(101)
        expect(await collateral['collateral(address)'](market.address)).to.equal(0)
      })

      context('negative credit', async () => {
        it('doesnt create a shortfall', async () => {
          await token.mock.transferFrom.withArgs(owner.address, collateral.address, 100).returns(true)
          await collateral.depositTo(user.address, market.address, 100)

          await expect(collateral.connect(marketSigner).settleAccount(user.address, -99))
            .to.emit(collateral, 'AccountSettle')
            .withArgs(market.address, user.address, -99, 0)

          expect(await collateral['collateral(address,address)'](user.address, market.address)).to.equal(1)
          expect(await collateral['collateral(address)'](market.address)).to.equal(100)
          expect(await collateral.shortfall(market.address)).to.equal(0)
        })

        it('creates a shortfall', async () => {
          await token.mock.transferFrom.withArgs(owner.address, collateral.address, 100).returns(true)
          await collateral.depositTo(user.address, market.address, 100)

          await expect(collateral.connect(marketSigner).settleAccount(user.address, -101))
            .to.emit(collateral, 'AccountSettle')
            .withArgs(market.address, user.address, -101, 1)

          expect(await collateral['collateral(address,address)'](user.address, market.address)).to.equal(0)
          expect(await collateral['collateral(address)'](market.address)).to.equal(100)
          expect(await collateral.shortfall(market.address)).to.equal(1)
        })
      })

      it('reverts if not market', async () => {
        await factory.mock.isMarket.withArgs(user.address).returns(false)

        await expect(collateral.connect(user).settleAccount(user.address, 101)).to.be.revertedWith(
          `NotMarketError("${user.address}")`,
        )
      })
    })

    describe('#claimFee', async () => {
      beforeEach(async () => {
        await token.mock.transferFrom.withArgs(owner.address, collateral.address, 100).returns(true)
        await collateral.depositTo(user.address, market.address, 100)

        await factory.mock['treasury()'].returns(treasuryA.address)
        await factory.mock['treasury(address)'].withArgs(market.address).returns(treasuryB.address)
        await factory.mock.protocolFee.returns(utils.parseEther('0.1'))

        await collateral.connect(marketSigner).settleMarket(90)
      })

      it('claims fee', async () => {
        await token.mock.transfer.withArgs(treasuryA.address, 9).returns(true)
        await token.mock.transfer.withArgs(treasuryB.address, 81).returns(true)

        await expect(collateral.connect(treasuryA).claimFee())
          .to.emit(collateral, 'FeeClaim')
          .withArgs(treasuryA.address, 9)

        await expect(collateral.connect(treasuryB).claimFee())
          .to.emit(collateral, 'FeeClaim')
          .withArgs(treasuryB.address, 81)

        expect(await collateral.fees(treasuryA.address)).to.equal(0)
        expect(await collateral.fees(treasuryB.address)).to.equal(0)
      })

      it('reverts if paused', async () => {
        await factory.mock.paused.returns(true)
        await expect(collateral.connect(treasuryB).claimFee()).to.be.revertedWith('PausedError()')
      })
    })

    describe('#claimReward', async () => {
      beforeEach(async () => {
        await token.mock.transferFrom.withArgs(owner.address, collateral.address, 100).returns(true)
        await collateral.depositTo(user.address, market.address, 100)

        await factory.mock['treasury()'].returns(treasuryA.address)
        await factory.mock['treasury(address)'].withArgs(market.address).returns(treasuryB.address)
        await factory.mock.protocolFee.returns(utils.parseEther('0.1'))

        await collateral.connect(marketSigner).settleMarket(90)
      })

      it('claims fee', async () => {
        await token.mock.transfer.withArgs(treasuryA.address, 9).returns(true)
        await token.mock.transfer.withArgs(treasuryB.address, 81).returns(true)

        await expect(collateral.connect(treasuryA).claimFee())
          .to.emit(collateral, 'FeeClaim')
          .withArgs(treasuryA.address, 9)

        await expect(collateral.connect(treasuryB).claimFee())
          .to.emit(collateral, 'FeeClaim')
          .withArgs(treasuryB.address, 81)

        expect(await collateral.fees(treasuryA.address)).to.equal(0)
        expect(await collateral.fees(treasuryB.address)).to.equal(0)
      })

      it('reverts if paused', async () => {
        await factory.mock.paused.returns(true)
        await expect(collateral.connect(treasuryB).claimFee()).to.be.revertedWith('PausedError()')
      })
    })
  })
})
