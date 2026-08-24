# Complete Menu Navigation Design

## Goal

Make every visible VITALEAF navigation destination lead to a real, useful page on desktop and mobile, including header search, top navigation, the full category menu, home shortcuts, footer links, and shopping-flow links.

## Root cause

The existing route contract only enumerates `STOREFRONT_MENU`. Links declared directly in the home and information pages are outside that contract, and the contract validates supported URLs without proving that sample data produces a useful result. In addition, the desktop mega menu closes and unmounts during client-side link activation, which has the same cancellation risk previously observed in the mobile drawer.

## Design

- Keep one small registry of public destinations that are reused by the visible navigation components.
- Expand the route contract to include utility, promotion, information, and shopping-flow destinations.
- Verify product destinations against the sample catalog so each category, concern, age, and promotion menu produces at least one product.
- Normalize common punctuation differences in product search so labels such as `오메가-3` find products written as `오메가3`.
- Use document navigation for destinations inside any menu that unmounts when selected; keep ordinary Next links elsewhere.
- Preserve the current design, Firebase model, cart behavior, and private access policy.

## Verification

- Unit and route-contract tests must demonstrate the new failures before production changes.
- Run the complete test suite, lint, and production build.
- Click representative desktop and mobile navigation paths, including search, category, promotion, footer, product detail, cart, and admin.
- Publish the exact validated source to the existing private Sites project.

