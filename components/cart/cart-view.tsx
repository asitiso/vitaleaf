"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { useCart } from "../../features/cart/cart-context";
import type { CartLine } from "../../features/cart/cart-types";
import { formatWon } from "../../lib/format";

type PendingDeletion =
  | { type: "line"; line: CartLine }
  | { type: "selected" }
  | null;

function getFocusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled])'),
  );
}

function CartQuantity({ line }: { line: CartLine }) {
  const { setQuantity } = useCart();
  const isUnavailable = line.stock < 1;

  return (
    <div className="cart-view__quantity" role="group" aria-label={`${line.name} 수량 선택`}>
      <button
        type="button"
        aria-label="수량 줄이기"
        disabled={isUnavailable || line.quantity <= 1}
        onClick={() => setQuantity(line.productId, line.quantity - 1)}
      >
        −
      </button>
      <output aria-label={`${line.name} 수량`}>{line.quantity}</output>
      <button
        type="button"
        aria-label="수량 늘리기"
        disabled={isUnavailable || line.quantity >= line.stock}
        onClick={() => setQuantity(line.productId, line.quantity + 1)}
      >
        +
      </button>
    </div>
  );
}

function CartThumbnail({ line }: { line: CartLine }) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <div className="cart-view__image" aria-hidden="true">
      {line.thumbnailUrl && !imageFailed ? (
        // Cart thumbnails are merchant-managed URLs, like product gallery images.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={line.thumbnailUrl} alt="" onError={() => setImageFailed(true)} />
      ) : (
        <span>VITALEAF</span>
      )}
    </div>
  );
}

export function CartView() {
  const {
    lines,
    itemCount,
    remove,
    setSelected,
    selectAll,
    clearSelected,
    subtotal,
    shippingFee,
    total,
    remainingForFreeShipping,
  } = useCart();
  const [pendingDeletion, setPendingDeletion] = useState<PendingDeletion>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  const selectedLines = lines.filter((line) => line.selected);
  const allSelected = lines.length > 0 && selectedLines.length === lines.length;
  const selectedHasNoStock = selectedLines.some((line) => line.stock < 1);
  const checkoutDisabled = selectedLines.length === 0 || selectedHasNoStock;
  const progressValue = Math.min(subtotal, 30_000);

  const restoreDeleteTriggerFocus = useCallback(() => {
    const trigger = deleteTriggerRef.current;
    if (trigger?.isConnected && !trigger.disabled) {
      trigger.focus();
    }
  }, []);

  const closeDeletion = useCallback(() => {
    setPendingDeletion(null);
    requestAnimationFrame(restoreDeleteTriggerFocus);
  }, [restoreDeleteTriggerFocus]);

  const confirmDeletion = () => {
    if (pendingDeletion?.type === "line") {
      remove(pendingDeletion.line.productId);
    }
    if (pendingDeletion?.type === "selected") {
      clearSelected();
    }
    closeDeletion();
  };

  const openDeletion = (deletion: Exclude<PendingDeletion, null>, trigger: HTMLButtonElement) => {
    deleteTriggerRef.current = trigger;
    setPendingDeletion(deletion);
  };

  useEffect(() => {
    if (!pendingDeletion) {
      return;
    }

    cancelButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDeletion();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) {
        return;
      }

      const focusableElements = getFocusableElements(dialogRef.current);
      const first = focusableElements.at(0);
      const last = focusableElements.at(-1);
      if (!first || !last) {
        return;
      }

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
  }, [closeDeletion, pendingDeletion]);

  if (lines.length === 0) {
    return (
      <main className="cart-view cart-view--empty">
        <p className="cart-view__eyebrow">VITALEAF CART</p>
        <h1>장바구니가 비어 있어요</h1>
        <p>내 몸에 맞는 건강 루틴을 상품 목록에서 찾아보세요.</p>
        <Link href="/products">상품 둘러보기</Link>
      </main>
    );
  }

  return (
    <main className="cart-view">
      <header className="cart-view__heading">
        <p className="cart-view__eyebrow">VITALEAF CART</p>
        <h1>장바구니</h1>
        <p>담은 상품 {itemCount}개를 확인하고 주문할 상품을 선택하세요.</p>
      </header>

      <div className="cart-view__layout">
        <section className="cart-view__lines" aria-labelledby="cart-items-heading">
          <div className="cart-view__line-actions">
            <h2 id="cart-items-heading">담은 상품</h2>
            <label>
              <input
                type="checkbox"
                aria-label="전체 선택"
                checked={allSelected}
                onChange={(event) => selectAll(event.target.checked)}
              />
              전체 선택
            </label>
            <button
              type="button"
              disabled={selectedLines.length === 0}
              onClick={(event) => openDeletion({ type: "selected" }, event.currentTarget)}
            >
              선택 삭제
            </button>
          </div>

          <ul className="cart-view__list">
            {lines.map((line) => (
              <li key={line.productId} className={line.stock < 1 ? "cart-view__line cart-view__line--unavailable" : "cart-view__line"}>
                <label className="cart-view__select-line">
                  <input
                    type="checkbox"
                    aria-label={`${line.name} 선택`}
                    checked={line.selected}
                    onChange={(event) => setSelected(line.productId, event.target.checked)}
                  />
                </label>
                <CartThumbnail line={line} />
                <div className="cart-view__product">
                  <h3>{line.name}</h3>
                  <p>{formatWon(line.unitPrice)} / 개</p>
                  {line.stock < 1 ? <p className="cart-view__stock-warning">현재 재고가 없어 주문할 수 없어요.</p> : null}
                </div>
                <CartQuantity line={line} />
                <strong className="cart-view__line-total">{formatWon(line.unitPrice * line.quantity)}</strong>
                <button
                  className="cart-view__remove"
                  type="button"
                  aria-label={`${line.name} 삭제`}
                  onClick={(event) => openDeletion({ type: "line", line }, event.currentTarget)}
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
        </section>

        <aside className="cart-view__summary" aria-labelledby="cart-summary-heading">
          <h2 id="cart-summary-heading">주문 금액</h2>
          <p className="cart-view__selected-count">선택 상품 {selectedLines.length}개</p>
          <div className="cart-view__shipping-progress">
            <p>
              {subtotal === 0
                ? "상품을 선택하면 무료배송까지 남은 금액을 알려드릴게요."
                : remainingForFreeShipping > 0
                  ? `무료배송까지 ${formatWon(remainingForFreeShipping)} 남았어요`
                  : "무료배송 혜택을 받고 있어요"}
            </p>
            <progress aria-label="무료배송 달성도" value={progressValue} max={30_000} />
          </div>
          <dl>
            <div><dt>상품 금액</dt><dd>{formatWon(subtotal)}</dd></div>
            <div><dt>배송비</dt><dd>{formatWon(shippingFee)}</dd></div>
            <div className="cart-view__total"><dt>총 결제 예정 금액</dt><dd>{formatWon(total)}</dd></div>
          </dl>
          {selectedHasNoStock ? <p className="cart-view__checkout-warning" role="alert">재고가 없는 선택 상품을 해제한 뒤 주문해 주세요.</p> : null}
          <Link
            className="cart-view__checkout"
            href="/checkout"
            aria-disabled={checkoutDisabled}
            tabIndex={checkoutDisabled ? -1 : undefined}
            onClick={(event) => {
              if (checkoutDisabled) event.preventDefault();
            }}
          >
            선택 상품 주문하기
          </Link>
        </aside>
      </div>

      {pendingDeletion ? (
        <div className="cart-view__dialog-backdrop">
          <section ref={dialogRef} className="cart-view__dialog" role="dialog" aria-modal="true" aria-labelledby="cart-delete-heading">
            <h2 id="cart-delete-heading">상품 삭제 확인</h2>
            <p>{pendingDeletion.type === "line" ? `${pendingDeletion.line.name}을(를) 장바구니에서 삭제할까요?` : "선택한 상품을 장바구니에서 삭제할까요?"}</p>
            <div>
              <button ref={cancelButtonRef} type="button" onClick={closeDeletion}>취소</button>
              <button type="button" onClick={confirmDeletion}>삭제하기</button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
