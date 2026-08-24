import type { ReactNode } from "react";

import { STOREFRONT_DESTINATIONS, STOREFRONT_MENU } from "../../lib/navigation/storefront-menu";

function MenuDestination({
  href,
  onNavigate,
  className,
  children,
}: {
  href: string;
  onNavigate: () => void;
  className?: string;
  children: ReactNode;
}) {
  return <a className={className} href={href} onClick={onNavigate}>{children}</a>;
}

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
                <MenuDestination href={category.href} onNavigate={onNavigate}>{category.label}</MenuDestination>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby={`${id ?? variant}-concerns-heading`}>
          <h2 id={`${id ?? variant}-concerns-heading`}>건강 고민</h2>
          <ul className="mega-menu__concerns">
            {STOREFRONT_MENU.concerns.map((concern) => (
              <li key={concern.key}>
                <MenuDestination href={concern.href} onNavigate={onNavigate}>
                  <span aria-hidden="true">{concern.label.slice(0, 1)}</span>
                  {concern.label}
                </MenuDestination>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby={`${id ?? variant}-age-heading`}>
          <h2 id={`${id ?? variant}-age-heading`}>연령별 추천</h2>
          <ul className="mega-menu__age-list">
            {STOREFRONT_MENU.ages.map((target) => (
              <li key={target.key}>
                <MenuDestination href={target.href} onNavigate={onNavigate}>{target.label}</MenuDestination>
              </li>
            ))}
          </ul>
        </section>
        <MenuDestination className="mega-menu__promotion" href={STOREFRONT_DESTINATIONS.trial.href} onNavigate={onNavigate}>
          <span>첫 구매 추천</span>
          <strong>3만원 이하 상품</strong>
          <span>부담 없이 시작할 수 있는 재고 보유 상품을 모았습니다.</span>
        </MenuDestination>
      </div>
    </section>
  );
}
