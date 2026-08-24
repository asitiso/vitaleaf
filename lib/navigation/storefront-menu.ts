import {
  AGE_TARGETS,
  HEALTH_CONCERNS,
  PRODUCT_CATEGORIES,
  type TaxonomyOption,
} from "../catalog/taxonomy";

export type StorefrontMenuItem = {
  key: string;
  label: string;
  href: string;
  value?: string;
  description?: string;
};

export const STOREFRONT_DESTINATIONS = {
  home: { key: "home", label: "홈", href: "/" },
  products: { key: "products", label: "전체 상품", href: "/products" },
  login: { key: "login", label: "로그인", href: "/login" },
  signup: { key: "signup", label: "회원가입", href: "/signup" },
  mypage: { key: "mypage", label: "마이페이지", href: "/mypage" },
  admin: { key: "admin", label: "관리자", href: "/admin" },
  cart: { key: "cart", label: "장바구니", href: "/cart" },
  checkout: { key: "checkout", label: "주문하기", href: "/checkout" },
  best: { key: "best", label: "베스트", href: "/products?sort=popular" },
  newest: { key: "newest", label: "신상품", href: "/products?sort=newest" },
  today: { key: "today", label: "오늘의 특가", href: "/products?promotion=today" },
  concerns: { key: "concerns", label: "건강 고민별", href: "/products?view=concerns" },
  gift: { key: "gift", label: "선물세트", href: "/products?category=gift" },
  ingredientsGuide: { key: "ingredients-guide", label: "성분 가이드", href: "/ingredients" },
  trial: { key: "trial", label: "첫 구매 추천", href: "/products?promotion=trial" },
  inStock: { key: "in-stock", label: "구매 가능 상품", href: "/products?stock=1" },
  ingredientsView: { key: "ingredients-view", label: "성분별 상품", href: "/products?view=ingredients" },
  omega3Search: { key: "omega3-search", label: "오메가-3 상품", href: "/products?q=오메가-3" },
  story: { key: "story", label: "브랜드 소개", href: "/story" },
  help: { key: "help", label: "고객센터", href: "/help" },
  shipping: { key: "shipping", label: "배송 안내", href: "/help/shipping" },
  returns: { key: "returns", label: "교환·반품", href: "/help/returns" },
} as const satisfies Record<string, StorefrontMenuItem>;

export const storefrontCategoryHref = (value: (typeof PRODUCT_CATEGORIES)[number]["value"]): string =>
  `/products?category=${value}`;

const toCategoryMenuItem = (option: (typeof PRODUCT_CATEGORIES)[number]): StorefrontMenuItem => ({
  key: `category-${option.value}`,
  label: option.label,
  href: storefrontCategoryHref(option.value),
  value: option.value,
  description: option.description,
});

const toConcernMenuItem = (option: TaxonomyOption): StorefrontMenuItem => ({
  key: `concern-${option.value}`,
  label: option.label,
  href: `/products?concern=${option.value}`,
  value: option.value,
  description: option.description,
});

const toAgeMenuItem = (option: TaxonomyOption): StorefrontMenuItem => ({
  key: `age-${option.value}`,
  label: option.label,
  href: `/products?age=${option.value}`,
  value: option.value,
  description: option.description,
});

export const STOREFRONT_MENU = {
  header: [
    STOREFRONT_DESTINATIONS.best,
    STOREFRONT_DESTINATIONS.today,
    STOREFRONT_DESTINATIONS.concerns,
    STOREFRONT_DESTINATIONS.gift,
    STOREFRONT_DESTINATIONS.ingredientsGuide,
  ],
  footer: [
    STOREFRONT_DESTINATIONS.story,
    STOREFRONT_DESTINATIONS.help,
    STOREFRONT_DESTINATIONS.shipping,
    STOREFRONT_DESTINATIONS.returns,
  ],
  destinations: Object.values(STOREFRONT_DESTINATIONS),
  categories: PRODUCT_CATEGORIES.map(toCategoryMenuItem),
  concerns: HEALTH_CONCERNS.map(toConcernMenuItem),
  ages: AGE_TARGETS.map(toAgeMenuItem),
} as const;

export function flattenMenuLinks(menu: typeof STOREFRONT_MENU): readonly StorefrontMenuItem[] {
  const links = [
    ...menu.destinations,
    ...menu.header,
    ...menu.categories,
    ...menu.concerns,
    ...menu.ages,
    ...menu.footer,
  ];

  return links.filter((link, index) => links.findIndex(({ href }) => href === link.href) === index);
}
