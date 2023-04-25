import { expect } from 'chai'
import 'hardhat'
import { constants } from 'ethers'

import { InstanceVars, deployProtocol, createMarket, INITIAL_VERSION } from '../helpers/setupHelpers'
import {
  expectAccountEq,
  expectOrderEq,
  expectPositionEq,
  expectVersionEq,
  parse6decimal,
} from '../../../../common/testutil/types'
import { Market__factory } from '../../../types/generated'

//TODO: short tests

describe('Happy Path', () => {
  let instanceVars: InstanceVars

  beforeEach(async () => {
    instanceVars = await deployProtocol()
  })

  it('creates a market', async () => {
    const { owner, factory, treasuryB, payoffProvider, chainlinkOracle, dsu, rewardToken } = instanceVars

    const definition = {
      name: 'Squeeth',
      symbol: 'SQTH',
      token: dsu.address,
      reward: rewardToken.address,
    }
    const parameter = {
      maintenance: parse6decimal('0.3'),
      fundingFee: parse6decimal('0.1'),
      takerFee: 0,
      makerFee: 0,
      positionFee: 0,
      makerLiquidity: parse6decimal('0.2'),
      makerLimit: parse6decimal('1'),
      closed: true,
      utilizationCurve: {
        minRate: 0,
        maxRate: parse6decimal('5.00'),
        targetRate: parse6decimal('0.80'),
        targetUtilization: parse6decimal('0.80'),
      },
      makerRewardRate: 0,
      longRewardRate: 0,
      shortRewardRate: 0,
      oracle: chainlinkOracle.address,
      payoff: {
        provider: payoffProvider.address,
        short: false,
      },
    }
    const marketAddress = await factory.callStatic.createMarket(definition, parameter)
    await expect(factory.createMarket(definition, parameter)).to.emit(factory, 'MarketCreated')
    const market = Market__factory.connect(marketAddress, owner)
    await market.connect(owner).acceptOwner()
    await market.connect(owner).updateTreasury(treasuryB.address)
  })

  it('opens a make position', async () => {
    const POSITION = parse6decimal('0.0001')
    const COLLATERAL = parse6decimal('1000')
    const { user, dsu, chainlink } = instanceVars

    const market = await createMarket(instanceVars)
    await dsu.connect(user).approve(market.address, COLLATERAL.mul(1e12))

    await expect(market.connect(user).update(user.address, POSITION, 0, 0, COLLATERAL))
      .to.emit(market, 'Updated')
      .withArgs(user.address, INITIAL_VERSION, POSITION, 0, 0, COLLATERAL)

    // Check user is in the correct state
    expectOrderEq(await market.pendingOrders(user.address), {
      version: INITIAL_VERSION + 1,
      maker: POSITION,
      long: 0,
      short: 0,
    })
    expectAccountEq(await market.accounts(user.address), {
      order: {
        version: 0,
        maker: 0,
        long: 0,
        short: 0,
      },
      collateral: COLLATERAL,
      reward: 0,
      liquidation: false,
    })

    // Check global state
    expectOrderEq(await market.pendingOrder(), {
      version: INITIAL_VERSION + 1,
      maker: POSITION,
      long: 0,
      short: 0,
    })
    expectOrderEq(await market.order(), {
      version: 0,
      maker: 0,
      long: 0,
      short: 0,
    })
    expectVersionEq(await market.versions(INITIAL_VERSION), {
      makerValue: { _value: 0 },
      longValue: { _value: 0 },
      shortValue: { _value: 0 },
      makerReward: { _value: 0 },
      longReward: { _value: 0 },
      shortReward: { _value: 0 },
    })

    // Settle the market with a new oracle version
    await chainlink.next()
    await market.settle(constants.AddressZero)

    // Check global post-settlement state
    expectOrderEq(await market.pendingOrder(), {
      version: INITIAL_VERSION + 1,
      maker: POSITION,
      long: 0,
      short: 0,
    })
    expectOrderEq(await market.order(), {
      version: INITIAL_VERSION + 1,
      maker: POSITION,
      long: 0,
      short: 0,
    })

    // Settle user and check state
    await market.settle(user.address)
    expectOrderEq(await market.pendingOrders(user.address), {
      version: INITIAL_VERSION + 1,
      maker: POSITION,
      long: 0,
      short: 0,
    })
    expectAccountEq(await market.accounts(user.address), {
      order: {
        version: INITIAL_VERSION + 1,
        maker: POSITION,
        long: 0,
        short: 0,
      },
      collateral: COLLATERAL,
      reward: 0,
      liquidation: false,
    })
  })

  it('opens multiple make positions', async () => {
    const POSITION = parse6decimal('0.0001')
    const COLLATERAL = parse6decimal('1000')
    const { user, dsu, chainlink } = instanceVars

    const market = await createMarket(instanceVars)
    await dsu.connect(user).approve(market.address, COLLATERAL.mul(1e12))

    await market.connect(user).update(user.address, POSITION.div(2), 0, 0, COLLATERAL)

    await expect(market.connect(user).update(user.address, POSITION, 0, 0, COLLATERAL))
      .to.emit(market, 'Updated')
      .withArgs(user.address, INITIAL_VERSION, POSITION, 0, 0, COLLATERAL)

    // Check user is in the correct state
    expectOrderEq(await market.pendingOrders(user.address), {
      version: INITIAL_VERSION + 1,
      maker: POSITION,
      long: 0,
      short: 0,
    })
    expectAccountEq(await market.accounts(user.address), {
      order: {
        version: 0,
        maker: 0,
        long: 0,
        short: 0,
      },
      collateral: COLLATERAL,
      reward: 0,
      liquidation: false,
    })

    // Check global state
    expectOrderEq(await market.pendingOrder(), {
      version: INITIAL_VERSION + 1,
      maker: POSITION,
      long: 0,
      short: 0,
    })
    expectOrderEq(await market.order(), {
      version: 0,
      maker: 0,
      long: 0,
      short: 0,
    })
    expectVersionEq(await market.versions(INITIAL_VERSION), {
      makerValue: { _value: 0 },
      longValue: { _value: 0 },
      shortValue: { _value: 0 },
      makerReward: { _value: 0 },
      longReward: { _value: 0 },
      shortReward: { _value: 0 },
    })

    // Settle the market with a new oracle version
    await chainlink.next()
    await market.settle(constants.AddressZero)

    // Check global post-settlement state
    expectOrderEq(await market.pendingOrder(), {
      version: INITIAL_VERSION + 1,
      maker: POSITION,
      long: 0,
      short: 0,
    })
    expectOrderEq(await market.order(), {
      version: INITIAL_VERSION + 1,
      maker: POSITION,
      long: 0,
      short: 0,
    })

    // Settle user and check state
    await market.settle(user.address)
    expectOrderEq(await market.pendingOrders(user.address), {
      version: INITIAL_VERSION + 1,
      maker: POSITION,
      long: 0,
      short: 0,
    })
    expectAccountEq(await market.accounts(user.address), {
      order: {
        version: INITIAL_VERSION + 1,
        maker: POSITION,
        long: 0,
        short: 0,
      },
      collateral: COLLATERAL,
      reward: 0,
      liquidation: false,
    })
  })

  it('closes a make position', async () => {
    const POSITION = parse6decimal('0.0001')
    const COLLATERAL = parse6decimal('1000')
    const { user, dsu } = instanceVars

    const market = await createMarket(instanceVars)
    await dsu.connect(user).approve(market.address, COLLATERAL.mul(1e12))

    await market.connect(user).update(user.address, POSITION, 0, 0, COLLATERAL)
    await expect(market.connect(user).update(user.address, 0, 0, 0, COLLATERAL))
      .to.emit(market, 'Updated')
      .withArgs(user.address, INITIAL_VERSION, 0, 0, 0, COLLATERAL)

    // User state
    expectOrderEq(await market.pendingOrders(user.address), {
      version: INITIAL_VERSION + 1,
      maker: 0,
      long: 0,
      short: 0,
    })
    expectAccountEq(await market.accounts(user.address), {
      order: {
        version: 0,
        maker: 0,
        long: 0,
        short: 0,
      },
      collateral: COLLATERAL,
      reward: 0,
      liquidation: false,
    })

    // Global State
    expectOrderEq(await market.pendingOrder(), {
      version: INITIAL_VERSION + 1,
      maker: 0,
      long: 0,
      short: 0,
    })
    expectOrderEq(await market.order(), {
      version: 0,
      maker: 0,
      long: 0,
      short: 0,
    })
    expectVersionEq(await market.versions(INITIAL_VERSION), {
      makerValue: { _value: 0 },
      longValue: { _value: 0 },
      shortValue: { _value: 0 },
      makerReward: { _value: 0 },
      longReward: { _value: 0 },
      shortReward: { _value: 0 },
    })
  })

  it('closes multiple make positions', async () => {
    const POSITION = parse6decimal('0.0001')
    const COLLATERAL = parse6decimal('1000')
    const { user, dsu } = instanceVars

    const market = await createMarket(instanceVars)
    await dsu.connect(user).approve(market.address, COLLATERAL.mul(1e12))

    await market.connect(user).update(user.address, POSITION, 0, 0, COLLATERAL)
    await market.connect(user).update(user.address, POSITION.div(2), 0, 0, COLLATERAL)

    await expect(market.connect(user).update(user.address, 0, 0, 0, COLLATERAL))
      .to.emit(market, 'Updated')
      .withArgs(user.address, INITIAL_VERSION, 0, 0, 0, COLLATERAL)

    // User state
    expectOrderEq(await market.pendingOrders(user.address), {
      version: INITIAL_VERSION + 1,
      maker: 0,
      long: 0,
      short: 0,
    })
    expectAccountEq(await market.accounts(user.address), {
      order: {
        version: 0,
        maker: 0,
        long: 0,
        short: 0,
      },
      collateral: COLLATERAL,
      reward: 0,
      liquidation: false,
    })

    // Global State
    expectOrderEq(await market.pendingOrder(), {
      version: INITIAL_VERSION + 1,
      maker: 0,
      long: 0,
      short: 0,
    })
    expectOrderEq(await market.order(), {
      version: 0,
      maker: 0,
      long: 0,
      short: 0,
    })
    expectVersionEq(await market.versions(INITIAL_VERSION), {
      makerValue: { _value: 0 },
      longValue: { _value: 0 },
      shortValue: { _value: 0 },
      makerReward: { _value: 0 },
      longReward: { _value: 0 },
      shortReward: { _value: 0 },
    })
  })

  it('opens a long position', async () => {
    const POSITION = parse6decimal('0.0001')
    const POSITION_B = parse6decimal('0.00001')
    const COLLATERAL = parse6decimal('1000')
    const { user, userB, dsu, chainlink, chainlinkOracle } = instanceVars

    const market = await createMarket(instanceVars)
    await dsu.connect(user).approve(market.address, COLLATERAL.mul(1e12))
    await dsu.connect(userB).approve(market.address, COLLATERAL.mul(1e12))

    await market.connect(user).update(user.address, POSITION, 0, 0, COLLATERAL)
    await expect(market.connect(userB).update(userB.address, 0, POSITION_B, 0, COLLATERAL))
      .to.emit(market, 'Updated')
      .withArgs(userB.address, INITIAL_VERSION, 0, POSITION_B, 0, COLLATERAL)

    // User State
    expectOrderEq(await market.pendingOrders(user.address), {
      version: INITIAL_VERSION + 1,
      maker: POSITION,
      long: 0,
      short: 0,
    })
    expectAccountEq(await market.accounts(user.address), {
      order: {
        version: 0,
        maker: 0,
        long: 0,
        short: 0,
      },
      collateral: COLLATERAL,
      reward: 0,
      liquidation: false,
    })
    expectOrderEq(await market.pendingOrders(userB.address), {
      version: INITIAL_VERSION + 1,
      maker: 0,
      long: POSITION_B,
      short: 0,
    })
    expectAccountEq(await market.accounts(userB.address), {
      order: {
        version: 0,
        maker: 0,
        long: 0,
        short: 0,
      },
      collateral: COLLATERAL,
      reward: 0,
      liquidation: false,
    })

    // Global State
    expectOrderEq(await market.pendingOrder(), {
      version: INITIAL_VERSION + 1,
      maker: POSITION,
      long: POSITION_B,
      short: 0,
    })
    expectOrderEq(await market.order(), {
      version: 0,
      maker: 0,
      long: 0,
      short: 0,
    })
    expectVersionEq(await market.versions(INITIAL_VERSION), {
      makerValue: { _value: 0 },
      longValue: { _value: 0 },
      shortValue: { _value: 0 },
      makerReward: { _value: 0 },
      longReward: { _value: 0 },
      shortReward: { _value: 0 },
    })

    // One round
    await chainlink.next()
    await chainlinkOracle.sync()

    // Another round
    await chainlink.next()
    await market.settle(constants.AddressZero)
    await market.settle(userB.address)

    expectOrderEq(await market.pendingOrder(), {
      version: INITIAL_VERSION + 1,
      maker: POSITION,
      long: POSITION_B,
      short: 0,
    })
    expectOrderEq(await market.order(), {
      version: INITIAL_VERSION + 1,
      maker: POSITION,
      long: POSITION_B,
      short: 0,
    })
    expectOrderEq(await market.pendingOrders(userB.address), {
      version: INITIAL_VERSION + 1,
      maker: 0,
      long: POSITION_B,
      short: 0,
    })
    expectAccountEq(await market.accounts(userB.address), {
      order: {
        version: INITIAL_VERSION + 1,
        maker: 0,
        long: POSITION_B,
        short: 0,
      },
      collateral: COLLATERAL,
      reward: 0,
      liquidation: false,
    })
  })

  it('opens multiple take positions', async () => {
    const POSITION = parse6decimal('0.0001')
    const POSITION_B = parse6decimal('0.00001')
    const COLLATERAL = parse6decimal('1000')
    const { user, userB, dsu, chainlink, chainlinkOracle } = instanceVars

    const market = await createMarket(instanceVars)
    await dsu.connect(user).approve(market.address, COLLATERAL.mul(1e12))
    await dsu.connect(userB).approve(market.address, COLLATERAL.mul(1e12))

    await market.connect(user).update(user.address, POSITION, 0, 0, COLLATERAL)
    await market.connect(userB).update(userB.address, 0, POSITION_B.div(2), 0, COLLATERAL)

    await expect(market.connect(userB).update(userB.address, 0, POSITION_B, 0, COLLATERAL))
      .to.emit(market, 'Updated')
      .withArgs(userB.address, INITIAL_VERSION, 0, POSITION_B, 0, COLLATERAL)

    // User State
    expectOrderEq(await market.pendingOrders(userB.address), {
      version: INITIAL_VERSION + 1,
      maker: 0,
      long: POSITION_B,
      short: 0,
    })
    expectAccountEq(await market.accounts(userB.address), {
      order: {
        version: 0,
        maker: 0,
        long: 0,
        short: 0,
      },
      collateral: COLLATERAL,
      reward: 0,
      liquidation: false,
    })

    // Global State
    expectOrderEq(await market.pendingOrder(), {
      version: INITIAL_VERSION + 1,
      maker: POSITION,
      long: POSITION_B,
      short: 0,
    })
    expectOrderEq(await market.order(), {
      version: 0,
      maker: 0,
      long: 0,
      short: 0,
    })
    expectVersionEq(await market.versions(INITIAL_VERSION), {
      makerValue: { _value: 0 },
      longValue: { _value: 0 },
      shortValue: { _value: 0 },
      makerReward: { _value: 0 },
      longReward: { _value: 0 },
      shortReward: { _value: 0 },
    })

    // One round
    await chainlink.next()
    await chainlinkOracle.sync()

    // Another round
    await chainlink.next()
    await market.settle(constants.AddressZero)

    expectOrderEq(await market.pendingOrder(), {
      version: INITIAL_VERSION + 1,
      maker: POSITION,
      long: POSITION_B,
      short: 0,
    })
    expectOrderEq(await market.order(), {
      version: INITIAL_VERSION + 1,
      maker: POSITION,
      long: POSITION_B,
      short: 0,
    })
    await market.settle(userB.address) // TODO: needed?
    expectOrderEq(await market.pendingOrders(userB.address), {
      version: INITIAL_VERSION + 1,
      maker: 0,
      long: POSITION_B,
      short: 0,
    })
    expectAccountEq(await market.accounts(userB.address), {
      order: {
        version: INITIAL_VERSION + 1,
        maker: 0,
        long: POSITION_B,
        short: 0,
      },
      collateral: COLLATERAL,
      reward: 0,
      liquidation: false,
    })
  })

  it('closes a long position', async () => {
    const POSITION = parse6decimal('0.0001')
    const POSITION_B = parse6decimal('0.00001')
    const COLLATERAL = parse6decimal('1000')
    const { user, userB, dsu } = instanceVars

    const market = await createMarket(instanceVars)
    await dsu.connect(user).approve(market.address, COLLATERAL.mul(1e12))
    await dsu.connect(userB).approve(market.address, COLLATERAL.mul(1e12))

    await expect(market.connect(userB).update(userB.address, 0, POSITION_B, 0, COLLATERAL)).to.be.revertedWith(
      'MarketInsufficientLiquidityError()',
    )
    await market.connect(user).update(user.address, POSITION, 0, 0, COLLATERAL)
    await market.connect(userB).update(userB.address, 0, POSITION_B, 0, COLLATERAL)

    await expect(market.connect(userB).update(userB.address, 0, 0, 0, COLLATERAL))
      .to.emit(market, 'Updated')
      .withArgs(userB.address, INITIAL_VERSION, 0, 0, 0, COLLATERAL)

    // User State
    expectOrderEq(await market.pendingOrders(userB.address), {
      version: INITIAL_VERSION + 1,
      maker: 0,
      long: 0,
      short: 0,
    })
    expectAccountEq(await market.accounts(userB.address), {
      order: {
        version: 0,
        maker: 0,
        long: 0,
        short: 0,
      },
      collateral: COLLATERAL,
      reward: 0,
      liquidation: false,
    })

    // Global State
    expectOrderEq(await market.pendingOrder(), {
      version: INITIAL_VERSION + 1,
      maker: POSITION,
      long: 0,
      short: 0,
    })
    expectOrderEq(await market.order(), {
      version: 0,
      maker: 0,
      long: 0,
      short: 0,
    })
    expectVersionEq(await market.versions(INITIAL_VERSION), {
      makerValue: { _value: 0 },
      longValue: { _value: 0 },
      shortValue: { _value: 0 },
      makerReward: { _value: 0 },
      longReward: { _value: 0 },
      shortReward: { _value: 0 },
    })
  })

  it('closes multiple long positions', async () => {
    const POSITION = parse6decimal('0.0001')
    const POSITION_B = parse6decimal('0.00001')
    const COLLATERAL = parse6decimal('1000')
    const { user, userB, dsu } = instanceVars

    const market = await createMarket(instanceVars)
    await dsu.connect(user).approve(market.address, COLLATERAL.mul(1e12))
    await dsu.connect(userB).approve(market.address, COLLATERAL.mul(1e12))

    await expect(market.connect(userB).update(userB.address, 0, POSITION_B, 0, COLLATERAL)).to.be.revertedWith(
      'MarketInsufficientLiquidityError()',
    )
    await market.connect(user).update(user.address, POSITION, 0, 0, COLLATERAL)
    await market.connect(userB).update(userB.address, 0, POSITION_B, 0, COLLATERAL)
    await market.connect(userB).update(userB.address, POSITION_B.div(2), 0, 0, COLLATERAL)

    await expect(market.connect(userB).update(userB.address, 0, 0, 0, COLLATERAL))
      .to.emit(market, 'Updated')
      .withArgs(userB.address, INITIAL_VERSION, 0, 0, 0, COLLATERAL)

    // User State
    expectOrderEq(await market.pendingOrders(userB.address), {
      version: INITIAL_VERSION + 1,
      maker: 0,
      long: 0,
      short: 0,
    })
    expectAccountEq(await market.accounts(userB.address), {
      order: {
        version: 0,
        maker: 0,
        long: 0,
        short: 0,
      },
      collateral: COLLATERAL,
      reward: 0,
      liquidation: false,
    })

    // Global State
    expectOrderEq(await market.pendingOrder(), {
      version: INITIAL_VERSION + 1,
      maker: POSITION,
      long: 0,
      short: 0,
    })
    expectOrderEq(await market.order(), {
      version: 0,
      maker: 0,
      long: 0,
      short: 0,
    })
    expectVersionEq(await market.versions(INITIAL_VERSION), {
      makerValue: { _value: 0 },
      longValue: { _value: 0 },
      shortValue: { _value: 0 },
      makerReward: { _value: 0 },
      longReward: { _value: 0 },
      shortReward: { _value: 0 },
    })
  })

  it('settle no op (gas test)', async () => {
    const { user } = instanceVars

    const market = await createMarket(instanceVars)

    await market.settle(user.address)
    await market.settle(user.address)
  })

  it('disables actions when paused', async () => {
    const { factory, pauser, user } = instanceVars
    const market = await createMarket(instanceVars)

    await expect(factory.connect(pauser).updatePaused(true)).to.emit(factory, 'ParameterUpdated')
    await expect(market.connect(user.address).update(user.address, 0, 0, 0, parse6decimal('1000'))).to.be.revertedWith(
      'PausedError()',
    )
    await expect(market.connect(user.address).settle(user.address)).to.be.revertedWith('PausedError()')
  })

  it('delayed update w/ collateral (gas)', async () => {
    const positionFeesOn = true
    const incentizesOn = true

    const POSITION = parse6decimal('0.0001')
    const COLLATERAL = parse6decimal('1000')
    const { user, userB, dsu, chainlink, chainlinkOracle, payoffProvider } = instanceVars

    const parameter = {
      maintenance: parse6decimal('0.3'),
      fundingFee: parse6decimal('0.1'),
      takerFee: positionFeesOn ? parse6decimal('0.001') : 0,
      makerFee: positionFeesOn ? parse6decimal('0.0005') : 0,
      positionFee: positionFeesOn ? parse6decimal('0.1') : 0,
      makerLiquidity: parse6decimal('0.2'),
      makerLimit: parse6decimal('1'),
      closed: false,
      utilizationCurve: {
        minRate: 0,
        maxRate: parse6decimal('5.00'),
        targetRate: parse6decimal('0.80'),
        targetUtilization: parse6decimal('0.80'),
      },
      makerRewardRate: incentizesOn ? parse6decimal('0.01') : 0,
      longRewardRate: incentizesOn ? parse6decimal('0.001') : 0,
      shortRewardRate: incentizesOn ? parse6decimal('0.001') : 0,
      oracle: chainlinkOracle.address,
      payoff: {
        provider: payoffProvider.address,
        short: false,
      },
    }

    const market = await createMarket(instanceVars)
    await market.updateParameter(parameter)

    await dsu.connect(user).approve(market.address, COLLATERAL.mul(2).mul(1e12))
    await dsu.connect(userB).approve(market.address, COLLATERAL.mul(2).mul(1e12))

    await market.connect(user).update(user.address, POSITION.div(3), 0, 0, COLLATERAL)
    await market.connect(userB).update(userB.address, 0, POSITION.div(3), 0, COLLATERAL)

    await chainlink.next()
    await chainlink.next()

    await market.connect(user).update(user.address, POSITION.div(2), 0, 0, COLLATERAL)
    await market.connect(userB).update(userB.address, 0, POSITION.div(2), 0, COLLATERAL)

    // Ensure a->b->c
    await chainlink.next()
    await chainlink.next()

    await expect(market.connect(user).update(user.address, POSITION, 0, 0, COLLATERAL.sub(1)))
      .to.emit(market, 'Updated')
      .withArgs(user.address, INITIAL_VERSION + 4, POSITION, 0, 0, COLLATERAL.sub(1))

    // Check user is in the correct state
    expectOrderEq(await market.pendingOrders(user.address), {
      version: INITIAL_VERSION + 5,
      maker: POSITION,
      long: 0,
      short: 0,
    })
    expectAccountEq(await market.accounts(user.address), {
      order: {
        version: INITIAL_VERSION + 3,
        maker: POSITION.div(2),
        long: 0,
        short: 0,
      },
      collateral: COLLATERAL.sub(1),
      reward: '11009999',
      liquidation: false,
    })

    // Check global state
    expectOrderEq(await market.pendingOrder(), {
      version: INITIAL_VERSION + 5,
      maker: POSITION,
      long: POSITION.div(2),
      short: 0,
    })
    expectOrderEq(await market.order(), {
      version: INITIAL_VERSION + 3,
      maker: POSITION.div(2),
      long: POSITION.div(2),
      short: 0,
    })
    expectVersionEq(await market.versions(INITIAL_VERSION + 3), {
      makerValue: { _value: '-247037696971' },
      longValue: { _value: '246839060605' },
      shortValue: { _value: 0 },
      makerReward: { _value: '333636363636' },
      longReward: { _value: '33363636363' },
      shortReward: { _value: 0 },
    })
  })
})
