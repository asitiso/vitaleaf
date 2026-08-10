"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useCart } from "../../features/cart/cart-context";
import { MegaMenu } from "./mega-menu";

const primaryNavigation = [
  { href: "/products?sort=best", label: "베스트" },
  { href: "/products?filter=new", label: "신상품" },
  { href: "/products?promotion=trial", label: "첫 구매 혜택" },
  { href: "/products?view=ingredients", label: "성분 가이드" },
  { href: "/story", label: "브랜드 스토리" },
];

export function SiteHeader() {
  const { itemCount } = useCart();
  const [isMegaMenuOpen, setIsMegaMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const menuRootRef = useRef<HTMLDivElement>(null);
  const categoryTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const megaMenuId = useId();

  const closeMegaMenu = (returnFocus = false) => {
    setIsMegaMenuOpen(false);
    if (returnFocus) requestAnimationFrame(() => categoryTriggerRef.current?.focus());
  };
  const closeMobileMenu = (returnFocus = false) => {
    setIsMobileMenuOpen(false);
    if (returnFocus) requestAnimationFrame(() => mobileMenuTriggerRef.current?.focus());
  };

  useEffect(() => {
    if (!isMegaMenuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRootRef.current?.contains(event.target as Node)) closeMegaMenu();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isMegaMenuOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (isMobileMenuOpen) {
        event.preventDefault();
        closeMobileMenu(true);
      } else if (isMegaMenuOpen) {
        event.preventDefault();
        closeMegaMenu(true);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isMegaMenuOpen, isMobileMenuOpen]);

  return (
    <header className="site-header">
      <div className="site-header__benefit-bar"><p>첫 구매 10% 쿠폰 · 3만원 이상 무료배송 · 오후 2시 이전 당일 출고</p></div>
      <div className="site-header__main-shell">
        <div className="site-header__main-row">
          <button ref={mobileMenuTriggerRef} className="site-header__mobile-trigger" type="button" aria-label="메뉴 열기" aria-expanded={isMobileMenuOpen} onClick={() => setIsMobileMenuOpen(true)}><span aria-hidden="true">☰</span></button>
          <Link className="site-header__wordmark" href="/" aria-label="Vitaleaf 홈"><span>VITA</span>LEAF</Link>
          <form className="site-header__search" action="/products" method="get" role="search">
            <label className="sr-only" htmlFor="site-search">상품 검색</label>
            <input id="site-search" name="q" type="search" placeholder="성분, 기능, 상품명으로 검색하세요" />
            <button type="submit">검색</button>
          </form>
          <nav className="site-header__utility-nav" aria-label="사용자 메뉴">
            <a href="/login">로그인</a><a href="/admin">관리자</a>
            <a className="site-header__cart" href="/cart" aria-label={`장바구니 ${itemCount}개`}>장바구니 <span aria-hidden="true">{itemCount}</span></a>
          </nav>
        </div>
        <div ref={menuRootRef} className="site-header__navigation-row">
          <nav className="site-header__primary-nav" aria-label="주요 메뉴">
            <button ref={categoryTriggerRef} className="site-header__category-trigger" type="button" aria-expanded={isMegaMenuOpen} aria-controls={megaMenuId} onClick={() => setIsMegaMenuOpen((isOpen) => !isOpen)}><span aria-hidden="true">☷</span> 전체 카테고리</button>
            {primaryNavigation.map((item) => <a key={item.label} href={item.href}>{item.label}</a>)}
          </nav>
          {isMegaMenuOpen ? <MegaMenu id={megaMenuId} onNavigate={() => closeMegaMenu()} /> : null}
        </div>
      </div>
      {isMobileMenuOpen ? (
        <div className="site-header__drawer-backdrop">
          <button className="site-header__drawer-close" type="button" aria-label="모바일 메뉴 닫기" onClick={() => closeMobileMenu(true)} />
          <aside className="site-header__mobile-drawer" role="dialog" aria-modal="true" aria-label="모바일 메뉴">
            <div className="site-header__drawer-header"><span>메뉴</span><button type="button" onClick={() => closeMobileMenu(true)}>닫기</button></div>
            <nav aria-label="모바일 주요 메뉴">
              <a href="/products" onClick={() => closeMobileMenu()}>전체 상품</a>
              {primaryNavigation.map((item) => <a key={item.label} href={item.href} onClick={() => closeMobileMenu()}>{item.label}</a>)}
              <a href="/cart" onClick={() => closeMobileMenu()}>장바구니 ({itemCount})</a>
            </nav>
          </aside>
        </div>
      ) : null}
    </header>
  );
}
