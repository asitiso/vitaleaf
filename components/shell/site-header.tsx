"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type RefObject } from "react";

import { useAuth } from "../../features/auth/auth-context";
import { useCart } from "../../features/cart/cart-context";
import { STOREFRONT_DESTINATIONS, STOREFRONT_MENU } from "../../lib/navigation/storefront-menu";
import { formatShippingBenefitBar } from "../../lib/site/policies";

import { MegaMenu } from "./mega-menu";

const MEGA_MENU_ID = "site-header-mega-menu";

function SearchForm({
  className,
  formId,
  hidden,
  inputRef,
}: {
  className?: string;
  formId?: string;
  hidden?: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  return (
    <form id={formId} className={`site-header__search ${className ?? ""}`} action="/products" method="get" role="search" hidden={hidden}>
      <label className="sr-only" htmlFor={className ? "mobile-site-search" : "site-search"}>상품 검색</label>
      <input
        ref={inputRef}
        id={className ? "mobile-site-search" : "site-search"}
        name="q"
        type="search"
        placeholder="성분, 기능, 상품명으로 검색하세요"
      />
      <button type="submit">검색</button>
    </form>
  );
}

function AccountActions({
  documentNavigation = false,
  onLogout,
}: {
  documentNavigation?: boolean;
  onLogout?: () => void;
}) {
  const { status, user, error, signOutMember } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const isMember = status === "signed-in" && user !== null;

  const logout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      if (await signOutMember()) onLogout?.();
    } catch {
      // AuthProvider exposes a member-facing error when the Firebase sign-out request fails.
    } finally {
      setIsLoggingOut(false);
    }
  };

  const accountLink = (href: string, label: string) => (
    documentNavigation
      ? <a href={href}>{label}</a>
      : <Link href={href}>{label}</Link>
  );
  const errorNotice = error ? <span className="site-header__account-error" role="alert">{error}</span> : null;

  if (status === "checking") {
    return <span className="site-header__account-placeholder" role="status" aria-label="회원 상태 확인 중" />;
  }

  if (isMember) {
    return <>
      {accountLink(STOREFRONT_DESTINATIONS.mypage.href, STOREFRONT_DESTINATIONS.mypage.label)}
      <button type="button" onClick={() => void logout()} disabled={isLoggingOut}>
        {isLoggingOut ? "로그아웃 중" : "로그아웃"}
      </button>
      {errorNotice}
    </>;
  }

  return <>
    {accountLink(STOREFRONT_DESTINATIONS.login.href, STOREFRONT_DESTINATIONS.login.label)}
    {accountLink(STOREFRONT_DESTINATIONS.signup.href, STOREFRONT_DESTINATIONS.signup.label)}
    {errorNotice}
  </>;
}

function getFocusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled])'),
  ).filter((element) => !element.closest("[hidden]"));
}

export function SiteHeader() {
  const { itemCount } = useCart();
  const [isMegaMenuOpen, setIsMegaMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const menuRootRef = useRef<HTMLDivElement>(null);
  const categoryTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileDrawerRef = useRef<HTMLElement>(null);
  const mobileCloseButtonRef = useRef<HTMLButtonElement>(null);
  const mobileSearchToggleRef = useRef<HTMLButtonElement>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);

  const closeMegaMenu = (returnFocus = false) => {
    setIsMegaMenuOpen(false);
    if (returnFocus) requestAnimationFrame(() => categoryTriggerRef.current?.focus());
  };
  const closeMobileMenu = (returnFocus = false) => {
    if (returnFocus) mobileMenuTriggerRef.current?.focus();
    setIsMobileSearchOpen(false);
    setIsMobileMenuOpen(false);
  };
  const toggleMobileSearch = () => {
    setIsMobileSearchOpen((isOpen) => !isOpen);
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
    if (isMobileMenuOpen) mobileCloseButtonRef.current?.focus();
  }, [isMobileMenuOpen]);

  useEffect(() => {
    if (isMobileMenuOpen && isMobileSearchOpen) mobileSearchInputRef.current?.focus();
  }, [isMobileMenuOpen, isMobileSearchOpen]);

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (isMobileSearchOpen) {
          setIsMobileSearchOpen(false);
          mobileSearchToggleRef.current?.focus();
          return;
        }
        mobileMenuTriggerRef.current?.focus();
        setIsMobileMenuOpen(false);
        return;
      }
      if (event.key !== "Tab" || !mobileDrawerRef.current) return;

      const focusableElements = getFocusableElements(mobileDrawerRef.current);
      const first = focusableElements.at(0);
      const last = focusableElements.at(-1);
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isMobileMenuOpen, isMobileSearchOpen]);

  useEffect(() => {
    if (!isMegaMenuOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMegaMenu(true);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isMegaMenuOpen]);

  return (
    <header className="site-header">
      <div className="site-header__benefit-bar"><p>{formatShippingBenefitBar()}</p></div>
      <div className="site-header__main-shell">
        <div className="site-header__main-row">
          <button ref={mobileMenuTriggerRef} className="site-header__mobile-trigger" type="button" aria-label="메뉴 열기" aria-expanded={isMobileMenuOpen} onClick={() => setIsMobileMenuOpen(true)}><span aria-hidden="true">☰</span></button>
          <Link className="site-header__wordmark" href={STOREFRONT_DESTINATIONS.home.href} aria-label="Vitaleaf 홈"><span>VITA</span>LEAF</Link>
          <SearchForm />
          <nav className="site-header__utility-nav" aria-label="사용자 메뉴">
            <AccountActions />
            <Link href={STOREFRONT_DESTINATIONS.admin.href}>관리자</Link>
            <Link className="site-header__cart" href={STOREFRONT_DESTINATIONS.cart.href} aria-label={`장바구니 ${itemCount}개`}>장바구니 <span aria-hidden="true">{itemCount}</span></Link>
          </nav>
        </div>
        <div ref={menuRootRef} className="site-header__navigation-row">
          <nav className="site-header__primary-nav" aria-label="주요 메뉴">
            <button ref={categoryTriggerRef} className="site-header__category-trigger" type="button" aria-expanded={isMegaMenuOpen} aria-controls={MEGA_MENU_ID} onClick={() => setIsMegaMenuOpen((isOpen) => !isOpen)}><span aria-hidden="true">☷</span> 전체 카테고리</button>
            {STOREFRONT_MENU.header.map((item) => <Link key={item.key} href={item.href}>{item.label}</Link>)}
          </nav>
          {isMegaMenuOpen ? <MegaMenu id={MEGA_MENU_ID} onNavigate={() => closeMegaMenu()} /> : null}
        </div>
      </div>
      {isMobileMenuOpen ? (
        <div className="site-header__drawer-backdrop">
          <button className="site-header__drawer-close" type="button" aria-label="모바일 메뉴 닫기" onClick={() => closeMobileMenu(true)} />
          <aside ref={mobileDrawerRef} className="site-header__mobile-drawer" role="dialog" aria-modal="true" aria-label="모바일 메뉴">
            <div className="site-header__drawer-header">
              <span>메뉴</span>
              <div className="site-header__drawer-actions">
                <button
                  ref={mobileSearchToggleRef}
                  className="site-header__mobile-search-toggle"
                  type="button"
                  aria-label={isMobileSearchOpen ? "검색 닫기" : "검색 열기"}
                  aria-expanded={isMobileSearchOpen}
                  aria-controls="mobile-site-search-form"
                  onClick={toggleMobileSearch}
                >검색</button>
                <button ref={mobileCloseButtonRef} type="button" onClick={() => closeMobileMenu(true)}>닫기</button>
              </div>
            </div>
            <SearchForm
              className="site-header__mobile-search"
              formId="mobile-site-search-form"
              hidden={!isMobileSearchOpen}
              inputRef={mobileSearchInputRef}
            />
            <nav aria-label="모바일 주요 메뉴">
              <AccountActions documentNavigation onLogout={() => closeMobileMenu()} />
              {/* The drawer unmounts on click, so this destination must use browser document navigation. */}
              <a href={STOREFRONT_DESTINATIONS.products.href} onClick={() => closeMobileMenu()}>전체 상품</a>
              {STOREFRONT_MENU.header.map((item) => <a key={item.key} href={item.href} onClick={() => closeMobileMenu()}>{item.label}</a>)}
              <a href={STOREFRONT_DESTINATIONS.admin.href} onClick={() => closeMobileMenu()}>관리자</a>
              <a href={STOREFRONT_DESTINATIONS.cart.href} onClick={() => closeMobileMenu()}>장바구니 ({itemCount})</a>
            </nav>
            <MegaMenu variant="drawer" onNavigate={() => closeMobileMenu()} />
          </aside>
        </div>
      ) : null}
    </header>
  );
}
