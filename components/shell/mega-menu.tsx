import Link from "next/link";

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
            {productCategories.map((category) => (
              <li key={category.label}>
                <Link href={category.href} onClick={onNavigate}>{category.label}</Link>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby={`${id ?? variant}-concerns-heading`}>
          <h2 id={`${id ?? variant}-concerns-heading`}>건강 고민</h2>
          <ul className="mega-menu__concerns">
            {concerns.map((concern) => (
              <li key={concern.label}>
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
            {ageTargets.map((target) => (
              <li key={target.label}>
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
