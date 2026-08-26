import Link from "next/link";

import { STOREFRONT_DESTINATIONS, STOREFRONT_MENU } from "../../lib/navigation/storefront-menu";
import { formatSupportHours, STORE_POLICIES, supportPhoneHref } from "../../lib/site/policies";

export function SiteFooter() {
  return <footer className="site-footer"><div className="site-footer__inner">
    <div><Link className="site-footer__wordmark" href={STOREFRONT_DESTINATIONS.home.href} aria-label="Vitaleaf 홈"><span>VITA</span>LEAF</Link><p>성분과 기준을 투명하게 공개하는 건강 루틴 스토어</p></div>
    <nav aria-label="푸터 메뉴">{STOREFRONT_MENU.footer.map((item) => <Link key={item.key} href={item.href}>{item.label}</Link>)}</nav>
    <address>고객센터 <a href={supportPhoneHref()}>{STORE_POLICIES.support.phone}</a><br />{formatSupportHours()}</address>
  </div><Link className="site-footer__admin" href={STOREFRONT_DESTINATIONS.admin.href}>관리자 로그인</Link></footer>;
}
