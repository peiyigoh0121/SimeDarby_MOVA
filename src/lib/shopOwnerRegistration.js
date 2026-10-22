export function isShopOwnerSignup(role, hasShop) {
  return role === 'shop_owner' || (role === 'resident' && hasShop)
}

export function buildShopOwnerMetadata({ role, hasShop, shop }) {
  const shopOwner = isShopOwnerSignup(role, hasShop)
  return {
    role,
    shopOwner,
    ...(shopOwner ? { shop } : {}),
  }
}

export function hasShopkeeperMonitorAccess(metadata) {
  const hasShopOwnerRole = metadata?.shopOwner === true || metadata?.role === 'shop_owner'
  return hasShopOwnerRole && hasValidShopDetails(metadata?.shop)
}

export function hasShopOwnerAccess(metadata) {
  return metadata?.shopOwner === true || metadata?.role === 'shop_owner'
}

export function hasValidShopDetails(shop) {
  return Boolean(
    shop
    && typeof shop.name === 'string' && shop.name.trim()
    && typeof shop.address === 'string' && shop.address.trim()
    && typeof shop.type === 'string' && shop.type
    && typeof shop.contact === 'string' && shop.contact.trim(),
  )
}

export function getShopOwnerRegistrationError({ registeringShopOwner, shop }) {
  if (!registeringShopOwner) return null
  if (!shop.name.trim()) return 'Enter your shop name to enable Shopkeeper Monitor.'
  if (!shop.address.trim()) return 'Enter your shop address or lot location to enable Shopkeeper Monitor.'
  if (!shop.type) return 'Select your shop type to enable Shopkeeper Monitor.'
  if (!shop.contact.trim()) return 'Enter a shop contact number to enable Shopkeeper Monitor.'
  return null
}

export function getShopRegistrationValidationError({ isSignup, registeringShopOwner, shop }) {
  return isSignup ? getShopOwnerRegistrationError({ registeringShopOwner, shop }) : null
}
