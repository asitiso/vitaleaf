"use client";

import {
  createContext,
  startTransition,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { getPurchaseOptionPrice } from "../../lib/products/purchase-options";
import type { Product, PurchaseOption } from "@/lib/products/types";

import { calculateCart, cartLineId, clampQuantity, normalizeStoredCart } from "./cart-utils";
import type { CartContextValue, CartLine, DuplicateCartStrategy } from "./cart-types";

const STORAGE_KEY = "vitaleaf-cart-v1";
const BUY_NOW_STORAGE_KEY = "vitaleaf-buy-now-v1";

type CartSummary = ReturnType<typeof calculateCart>;
type CartContextState = CartContextValue & CartSummary;

const CartContext = createContext<CartContextState | null>(null);

function readStoredCart(): CartLine[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === null ? [] : normalizeStoredCart(JSON.parse(stored));
  } catch {
    return [];
  }
}

function toCartLine(product: Product, option: PurchaseOption, quantity: number, selected = true): CartLine {
  const line: CartLine = {
    lineId: cartLineId(product.id, option.id),
    productId: product.id,
    purchaseOptionId: option.id,
    purchaseOptionLabel: option.label,
    sku: option.sku,
    name: product.name,
    thumbnailUrl: product.thumbnailUrl,
    unitPrice: getPurchaseOptionPrice(product.price, option),
    stock: option.stock,
    quantity: 1,
    selected,
  };

  return { ...line, quantity: clampQuantity(line, quantity) };
}

function readStoredBuyNowLine(): CartLine | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const stored = window.sessionStorage.getItem(BUY_NOW_STORAGE_KEY);
    const line = stored === null ? undefined : normalizeStoredCart([JSON.parse(stored)])[0];
    return line ? { ...line, selected: true } : null;
  } catch {
    return null;
  }
}

function isSameCartLineSnapshot(current: CartLine, snapshot: CartLine) {
  return current.lineId === snapshot.lineId
    && current.productId === snapshot.productId
    && current.purchaseOptionId === snapshot.purchaseOptionId
    && current.purchaseOptionLabel === snapshot.purchaseOptionLabel
    && current.sku === snapshot.sku
    && current.name === snapshot.name
    && current.thumbnailUrl === snapshot.thumbnailUrl
    && current.unitPrice === snapshot.unitPrice
    && current.stock === snapshot.stock
    && current.quantity === snapshot.quantity
    && current.selected === snapshot.selected;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [buyNowLine, setBuyNowLine] = useState<CartLine | null>(null);
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    const storedLines = readStoredCart();
    const storedBuyNowLine = readStoredBuyNowLine();
    startTransition(() => {
      setLines(storedLines);
      setBuyNowLine(storedBuyNowLine);
      setHasHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // The cart remains usable if browser storage is unavailable.
    }
  }, [hasHydrated, lines]);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    try {
      if (buyNowLine) {
        window.sessionStorage.setItem(BUY_NOW_STORAGE_KEY, JSON.stringify(buyNowLine));
      } else {
        window.sessionStorage.removeItem(BUY_NOW_STORAGE_KEY);
      }
    } catch {
      // The current page keeps the buy-now line even if session storage is unavailable.
    }
  }, [buyNowLine, hasHydrated]);

  useEffect(() => {
    const syncCart = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY && event.key !== null) {
        return;
      }

      try {
        setLines(event.newValue === null ? [] : normalizeStoredCart(JSON.parse(event.newValue)));
      } catch {
        setLines([]);
      }
    };

    window.addEventListener("storage", syncCart);
    return () => window.removeEventListener("storage", syncCart);
  }, []);

  const add = useCallback((
    product: Product,
    option: PurchaseOption,
    quantity: number,
    strategy?: DuplicateCartStrategy,
  ) => {
    if (!option.active || option.stock < 1 || !Number.isFinite(quantity)) {
      return;
    }

    setLines((currentLines) => {
      const nextLineId = cartLineId(product.id, option.id);
      const existing = currentLines.find((line) => line.lineId === nextLineId);
      if (!existing) {
        return [...currentLines, toCartLine(product, option, quantity)];
      }

      if (strategy !== "increment") {
        return currentLines;
      }

      const updatedLine = toCartLine(product, option, existing.quantity + quantity, existing.selected);
      return currentLines.map((line) => (line.lineId === nextLineId ? updatedLine : line));
    });
  }, []);

  const remove = useCallback((lineId: string) => {
    setLines((currentLines) => currentLines.filter((line) => line.lineId !== lineId));
  }, []);

  const setQuantity = useCallback((lineId: string, quantity: number) => {
    setLines((currentLines) =>
      currentLines.map((line) =>
        line.lineId === lineId ? { ...line, quantity: clampQuantity(line, quantity) } : line,
      ),
    );
  }, []);

  const setSelected = useCallback((lineId: string, selected: boolean) => {
    setLines((currentLines) =>
      currentLines.map((line) => (line.lineId === lineId ? { ...line, selected } : line)),
    );
  }, []);

  const selectAll = useCallback((selected: boolean) => {
    setLines((currentLines) => currentLines.map((line) => ({ ...line, selected })));
  }, []);

  const clearSelected = useCallback(() => {
    setLines((currentLines) => currentLines.filter((line) => !line.selected));
  }, []);

  const prepareBuyNow = useCallback((product: Product, option: PurchaseOption, quantity: number) => {
    if (!option.active || option.stock < 1 || !Number.isFinite(quantity)) {
      return;
    }
    setBuyNowLine(toCartLine(product, option, quantity));
  }, []);

  const clearBuyNow = useCallback(() => setBuyNowLine(null), []);

  const clearSubmitted = useCallback((submittedLines: readonly CartLine[]) => {
    const submittedByLineId = new Map(submittedLines.map((line) => [line.lineId, line]));
    setLines((currentLines) => currentLines.filter((line) => {
      const submittedLine = submittedByLineId.get(line.lineId);
      return !submittedLine || !isSameCartLineSnapshot(line, submittedLine);
    }));
  }, []);

  const summary = useMemo(() => calculateCart(lines), [lines]);
  const itemCount = useMemo(() => lines.reduce((count, line) => count + line.quantity, 0), [lines]);
  const value = useMemo<CartContextState>(
    () => ({ lines, buyNowLine, itemCount, hasHydrated, add, prepareBuyNow, clearBuyNow, remove, setQuantity, setSelected, selectAll, clearSelected, clearSubmitted, ...summary }),
    [add, buyNowLine, clearBuyNow, clearSelected, clearSubmitted, hasHydrated, itemCount, lines, prepareBuyNow, remove, selectAll, setQuantity, setSelected, summary],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const value = useContext(CartContext);
  if (value === null) {
    throw new Error("useCart must be used within a CartProvider");
  }

  return value;
}
