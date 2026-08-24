import Link from "next/link";
import type { ReactNode } from "react";

import { STOREFRONT_MENU } from "../../lib/navigation/storefront-menu";

function MenuDestination({
  href,
  onNavigate,
  useDocumentNavigation,
  className,
  children,
}: {
  href: string;
  onNavigate: () => void;
  useDocumentNavigation: boolean;
  className?: string;
  children: ReactNode;
}) {
  return useDocumentNavigation ? (
    <a className={className} href={href} onClick={onNavigate}>{children}</a>
  ) : (
    <Link className={className} href={href} onClick={onNavigate}>{children}</Link>
  );
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
                <MenuDestination href={category.href} onNavigate={onNavigate} useDocumentNavigation={variant === "drawer"}>{category.label}</MenuDestination>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby={`${id ?? variant}-concerns-heading`}>
          <h2 id={`${id ?? variant}-concerns-heading`}>건강 고민</h2>
          <ul className="mega-menu__concerns">
            {STOREFRONT_MENU.concerns.map((concern) => (
              <li key={concern.key}>
                <MenuDestination href={concern.href} onNavigate={onNavigate} useDocumentNavigation={variant === "drawer"}>
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
                <MenuDestination href={target.href} onNavigate={onNavigate} useDocumentNavigation={variant === "drawer"}>{target.label}</MenuDestination>
              </li>
            ))}
          </ul>
        </section>
        <MenuDestination className="mega-menu__promotion" href="/products?promotion=trial" onNavigate={onNavigate} useDocumentNavigation={variant === "drawer"}>
          <span>첫 구매 고객</span>
          <strong>7일 체험</strong>
          <span>부담 없이 건강 루틴을 시작하세요.</span>
        </MenuDestination>
      </div>
    </section>
  );
}
