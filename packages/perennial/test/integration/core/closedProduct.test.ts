import { expect } from 'chai'
import 'hardhat'
import { constants } from 'ethers'

import { InstanceVars, deployProtocol, createMarket, INITIAL_VERSION } from '../helpers/setupHelpers'
import { Market } from '../../../types/generated'
import { parse6decimal } from '../../../../common/testutil/types'

describe('Closed Market', () => {
  let instanceVars: InstanceVars

  beforeEach(async () => {
    instanceVars = await deployProtocol()
  })

  it('closes the market', async () => {
    const POSITION = parse6decimal('0.0001')
    const COLLATERAL = parse6decimal('1000')
    const { user, dsu, chainlink } = instanceVars

    const market = await createMarket(instanceVars)
    await dsu.connect(user).approve(market.address, COLLATERAL.mul(1e12))
    await market.connect(user).update(user.address, POSITION, 0, 0, COLLATERAL)

    //TODO: uncomment when versioned params are added
    //expect(await market.closed()).to.be.false

    // Settle the market with a new oracle version
    await chainlink.nextWithPriceModification(price => price.mul(10))
    await market.settle(constants.AddressZero)

    await chainlink.next()
    const parameters = { ...(await market.parameter()) }
    parameters.closed = true
    await market.updateParameter(parameters)
    // await expect(market.updateClosed(true))
    //   .to.emit(market, 'Updated')
    //   .withArgs(true, 2474)

    // expect(await market.closed()).to.be.true
  })

  describe('changes to system constraints', async () => {
    let market: Market
    const POSITION = parse6decimal('0.0001')
    const COLLATERAL = parse6decimal('1000')

    beforeEach(async () => {
      const { user, userB, dsu } = instanceVars

      market = await createMarket(instanceVars)
      await dsu.connect(user).approve(market.address, COLLATERAL.mul(1e12))
      await dsu.connect(userB).approve(market.address, COLLATERAL.mul(1e12))
      await market.connect(user).update(user.address, POSITION, 0, 0, COLLATERAL)
      await market.connect(userB).update(userB.address, 0, POSITION, 0, COLLATERAL)
      const parameters = { ...(await market.parameter()) }
      parameters.closed = true
      await market.updateParameter(parameters)
    })

    it('reverts on new open positions', async () => {
      const { user } = instanceVars
      await expect(market.connect(user).update(user.address, 0, POSITION, 0, 0)).to.be.revertedWith(
        'MarketClosedError()',
      )
    })

    it('allows insufficient liquidity for close positions', async () => {
      const { user } = instanceVars
      await expect(market.connect(user).update(user.address, 0, 0, 0, 0)).to.not.be.reverted
    })
  })

  it('zeroes PnL and fees', async () => {
    const POSITION = parse6decimal('0.0001')
    const COLLATERAL = parse6decimal('1000')
    const { user, userB, chainlink, dsu } = instanceVars

    const market = await createMarket(instanceVars)
    await dsu.connect(user).approve(market.address, COLLATERAL.mul(1e12))
    await dsu.connect(userB).approve(market.address, COLLATERAL.mul(1e12))
    await market.connect(user).update(user.address, POSITION, 0, 0, COLLATERAL)
    await market.connect(userB).update(userB.address, 0, POSITION, 0, COLLATERAL)

    await chainlink.next()
    await chainlink.next()
    const parameters = { ...(await market.parameter()) }
    parameters.closed = true
    await market.updateParameter(parameters)
    await market.settle(user.address)
    await market.settle(userB.address)

    const userCollateralBefore = (await market.locals(user.address)).collateral
    const userBCollateralBefore = (await market.locals(userB.address)).collateral
    const feesABefore = (await market.global()).protocolFee
    const feesBBefore = (await market.global()).marketFee

    await chainlink.nextWithPriceModification(price => price.mul(4))
    await chainlink.nextWithPriceModification(price => price.mul(4))
    await market.settle(user.address)
    await market.settle(userB.address)

    expect((await market.locals(user.address)).collateral).to.equal(userCollateralBefore)
    expect((await market.locals(userB.address)).collateral).to.equal(userBCollateralBefore)
    expect((await market.global()).protocolFee).to.equal(feesABefore)
    expect((await market.global()).marketFee).to.equal(feesBBefore)
  })

  it('handles closing during liquidations', async () => {
    const POSITION = parse6decimal('0.0001')
    const COLLATERAL = parse6decimal('1000')
    const { user, userB, chainlink, dsu } = instanceVars

    const market = await createMarket(instanceVars)
    await dsu.connect(user).approve(market.address, COLLATERAL.mul(1e12))
    await dsu.connect(userB).approve(market.address, COLLATERAL.mul(1e12))
    await market.connect(user).update(user.address, POSITION, 0, 0, COLLATERAL)
    await market.connect(userB).update(userB.address, 0, POSITION, 0, COLLATERAL)

    await chainlink.next()
    await chainlink.nextWithPriceModification(price => price.mul(2))
    await expect(market.settle(user.address)).to.not.be.reverted
    expect((await market.locals(user.address)).liquidation).to.eq(INITIAL_VERSION + 3)
    const parameters = { ...(await market.parameter()) }
    parameters.closed = true
    await market.updateParameter(parameters)
    await chainlink.next()

    await market.settle(user.address)
    await market.settle(userB.address)

    expect((await market.position()).version).to.eq(INITIAL_VERSION + 3)
    expect((await market.locals(user.address)).liquidation).to.eq(INITIAL_VERSION + 3)
    const userCollateralBefore = (await market.locals(user.address)).collateral
    const userBCollateralBefore = (await market.locals(userB.address)).collateral
    const feesABefore = (await market.global()).protocolFee
    const feesBBefore = (await market.global()).marketFee

    await chainlink.nextWithPriceModification(price => price.mul(4))
    await chainlink.nextWithPriceModification(price => price.mul(4))
    await market.settle(user.address)
    await market.settle(userB.address)

    expect((await market.locals(user.address)).collateral).to.equal(userCollateralBefore)
    expect((await market.locals(userB.address)).collateral).to.equal(userBCollateralBefore)
    expect((await market.global()).protocolFee).to.equal(feesABefore)
    expect((await market.global()).marketFee).to.equal(feesBBefore)
  })
})
