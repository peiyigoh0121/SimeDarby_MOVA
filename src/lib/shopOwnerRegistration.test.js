import assert from 'node:assert/strict'
import test from 'node:test'
import { buildShopOwnerMetadata, getShopOwnerRegistrationError, getShopRegistrationValidationError, hasShopkeeperMonitorAccess, isShopOwnerSignup } from './shopOwnerRegistration.js'

test('shop owner sign-up and resident shop opt-in both enable the monitor', () => {
  const shop = { name: 'SS2 Corner Cafe', address: 'SS2', type: 'Cafe', contact: '0123456789' }

  assert.equal(isShopOwnerSignup('shop_owner', false), true)
  assert.equal(isShopOwnerSignup('resident', true), true)
  assert.equal(isShopOwnerSignup('resident', false), false)
  assert.deepEqual(buildShopOwnerMetadata({ role: 'shop_owner', hasShop: false, shop }), { role: 'shop_owner', shopOwner: true, shop })
})

test('monitor navigation permits either explicit shop-owner metadata path but not ordinary residents', () => {
  const shop = { name: 'SS2 Corner Cafe', address: 'SS2', type: 'Cafe', contact: '0123456789' }
  assert.equal(hasShopkeeperMonitorAccess({ shopOwner: true, role: 'resident', shop }), true)
  assert.equal(hasShopkeeperMonitorAccess({ shopOwner: false, role: 'shop_owner', shop }), true)
  assert.equal(hasShopkeeperMonitorAccess({ shopOwner: true, role: 'resident' }), false)
  assert.equal(hasShopkeeperMonitorAccess({ shopOwner: false, role: 'resident', shop }), false)
  assert.equal(hasShopkeeperMonitorAccess(undefined), false)
})

test('shop owner opt-in reports the missing shop field before registration', () => {
  const validShop = { name: 'SS2 Corner Cafe', address: 'SS2', type: 'Cafe', contact: '0123456789' }

  assert.equal(getShopOwnerRegistrationError({ registeringShopOwner: true, shop: { ...validShop, name: '' } }), 'Enter your shop name to enable Shopkeeper Monitor.')
  assert.equal(getShopOwnerRegistrationError({ registeringShopOwner: true, shop: { ...validShop, address: ' ' } }), 'Enter your shop address or lot location to enable Shopkeeper Monitor.')
  assert.equal(getShopOwnerRegistrationError({ registeringShopOwner: true, shop: { ...validShop, type: '' } }), 'Select your shop type to enable Shopkeeper Monitor.')
  assert.equal(getShopOwnerRegistrationError({ registeringShopOwner: true, shop: { ...validShop, contact: '' } }), 'Enter a shop contact number to enable Shopkeeper Monitor.')
  assert.equal(getShopOwnerRegistrationError({ registeringShopOwner: false, shop: {} }), null)
})

test('missing shop details do not block sign-in', () => {
  assert.equal(
    getShopRegistrationValidationError({ isSignup: false, registeringShopOwner: true, shop: {} }),
    null,
  )
})
