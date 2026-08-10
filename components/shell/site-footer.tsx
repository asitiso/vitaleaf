import Link from "next/link";

const footerLinks = [
  { href: "/story", label: "브랜드 소개" },
  { href: "/help/shipping", label: "배송 안내" },
  { href: "/help/returns", label: "교환·반품" },
  { href: "/help", label: "고객센터" },
];

export function SiteFooter() {
  return <footer className="site-footer"><div className="site-footer__inner">
    <div><Link className="site-footer__wordmark" href="/" aria-label="Vitaleaf 홈"><span>VITA</span>LEAF</Link><p>성분과 기준을 투명하게 공개하는 건강 루틴 스토어</p></div>
    <nav aria-label="푸터 메뉴">{footerLinks.map((item) => <Link key={item.label} href={item.href}>{item.label}</Link>)}</nav>
    <address>고객센터 <a href="tel:0212345678">02-1234-5678</a><br />평일 09:00–18:00 (점심 12:00–13:00)</address>
  </div></footer>;
}
