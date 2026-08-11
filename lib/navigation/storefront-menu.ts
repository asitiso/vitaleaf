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

const toCategoryMenuItem = (option: TaxonomyOption): StorefrontMenuItem => ({
  key: `category-${option.value}`,
  label: option.label,
  href: `/products?category=${option.value}`,
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
    { key: "best", label: "베스트", href: "/products?sort=popular" },
    { key: "today", label: "오늘의 특가", href: "/products?promotion=today" },
    { key: "concerns", label: "건강 고민별", href: "/products?view=concerns" },
    { key: "gift", label: "선물세트", href: "/products?category=gift" },
    { key: "ingredients", label: "성분 가이드", href: "/ingredients" },
  ],
  footer: [
    { key: "story", label: "브랜드 소개", href: "/story" },
    { key: "help", label: "고객센터", href: "/help" },
    { key: "shipping", label: "배송 안내", href: "/help/shipping" },
    { key: "returns", label: "교환·반품", href: "/help/returns" },
  ],
  categories: PRODUCT_CATEGORIES.map(toCategoryMenuItem),
  concerns: HEALTH_CONCERNS.map(toConcernMenuItem),
  ages: AGE_TARGETS.map(toAgeMenuItem),
} as const;

export function flattenMenuLinks(menu: typeof STOREFRONT_MENU): readonly StorefrontMenuItem[] {
  const links = [
    ...menu.header,
    ...menu.categories,
    ...menu.concerns,
    ...menu.ages,
    ...menu.footer,
  ];

  return links.filter((link, index) => links.findIndex(({ href }) => href === link.href) === index);
}
