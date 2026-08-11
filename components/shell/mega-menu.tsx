import Link from "next/link";

import { STOREFRONT_MENU } from "../../lib/navigation/storefront-menu";

export function MegaMenu({
  id,
  onNavigate,
  variant = "dropdown",
}: {
  id?: string;
  onNavigate: () => void;
  variant?: "dropdown" | "drawer";
}) {
  return (
    <section id={id} className={`mega-menu mega-menu--${variant}`} aria-label="전체 카테고리 메뉴">
      <div className="mega-menu__content">
        <section aria-labelledby={`${id ?? variant}-products-heading`}>
          <h2 id={`${id ?? variant}-products-heading`}>상품 카테고리</h2>
          <ul className="mega-menu__link-list">
            {STOREFRONT_MENU.categories.map((category) => (
              <li key={category.key}>
                <Link href={category.href} onClick={onNavigate}>{category.label}</Link>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby={`${id ?? variant}-concerns-heading`}>
          <h2 id={`${id ?? variant}-concerns-heading`}>건강 고민</h2>
          <ul className="mega-menu__concerns">
            {STOREFRONT_MENU.concerns.map((concern) => (
              <li key={concern.key}>
                <Link href={concern.href} onClick={onNavigate}>
                  <span aria-hidden="true">{concern.label.slice(0, 1)}</span>
                  {concern.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby={`${id ?? variant}-age-heading`}>
          <h2 id={`${id ?? variant}-age-heading`}>연령별 추천</h2>
          <ul className="mega-menu__age-list">
            {STOREFRONT_MENU.ages.map((target) => (
              <li key={target.key}>
                <Link href={target.href} onClick={onNavigate}>{target.label}</Link>
              </li>
            ))}
          </ul>
        </section>
        <Link className="mega-menu__promotion" href="/products?promotion=trial" onClick={onNavigate}>
          <span>첫 구매 고객</span>
          <strong>7일 체험</strong>
          <span>부담 없이 건강 루틴을 시작하세요.</span>
        </Link>
      </div>
    </section>
  );
}
