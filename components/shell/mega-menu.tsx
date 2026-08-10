type MenuLink = { href: string; label: string };

const productCategories: MenuLink[] = [
  { href: "/products?category=nutrition", label: "영양제" },
  { href: "/products?category=vitamin", label: "비타민" },
  { href: "/products?category=probiotic", label: "유산균" },
  { href: "/products?category=wellness", label: "웰니스" },
  { href: "/products?category=food", label: "건강식품" },
];

const concerns: MenuLink[] = [
  { href: "/products?concern=energy", label: "피로·활력" },
  { href: "/products?concern=immunity", label: "면역" },
  { href: "/products?concern=sleep", label: "수면" },
  { href: "/products?concern=eyes", label: "눈 건강" },
  { href: "/products?concern=gut", label: "장 건강" },
  { href: "/products?concern=brain", label: "뇌 건강" },
];

const ageTargets: MenuLink[] = [
  { href: "/products?age=30", label: "30대" },
  { href: "/products?age=40", label: "40대" },
  { href: "/products?age=50", label: "50대+" },
];

export function MegaMenu({ id, onNavigate }: { id?: string; onNavigate: () => void }) {
  return (
    <section id={id} className="mega-menu" aria-label="전체 카테고리 메뉴">
      <div className="mega-menu__content">
        <section aria-labelledby="mega-products-heading">
          <h2 id="mega-products-heading">상품 카테고리</h2>
          <ul className="mega-menu__link-list">
            {productCategories.map((category) => (
              <li key={category.label}>
                <a href={category.href} onClick={onNavigate}>{category.label}</a>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="mega-concerns-heading">
          <h2 id="mega-concerns-heading">건강 고민</h2>
          <ul className="mega-menu__concerns">
            {concerns.map((concern) => (
              <li key={concern.label}>
                <a href={concern.href} onClick={onNavigate}>
                  <span aria-hidden="true">{concern.label.slice(0, 1)}</span>
                  {concern.label}
                </a>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="mega-age-heading">
          <h2 id="mega-age-heading">연령별 추천</h2>
          <ul className="mega-menu__age-list">
            {ageTargets.map((target) => (
              <li key={target.label}>
                <a href={target.href} onClick={onNavigate}>{target.label}</a>
              </li>
            ))}
          </ul>
        </section>
        <a className="mega-menu__promotion" href="/products?promotion=trial" onClick={onNavigate}>
          <span>첫 구매 고객</span>
          <strong>7일 체험</strong>
          <span>부담 없이 건강 루틴을 시작하세요.</span>
        </a>
      </div>
    </section>
  );
}
