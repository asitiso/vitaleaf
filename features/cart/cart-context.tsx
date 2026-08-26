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

import type { Product } from "@/lib/products/types";

import { calculateCart, clampQuantity } from "./cart-utils";
import type { CartContextValue, CartLine } from "./cart-types";

const STORAGE_KEY = "vitaleaf-cart-v1";
const BUY_NOW_STORAGE_KEY = "vitaleaf-buy-now-v1";

type CartSummary = ReturnType<typeof calculateCart>;
type CartContextState = CartContextValue & CartSummary;

const CartContext = createContext<CartContextState | null>(null);

function isStoredCartLine(value: unknown): value is Omit<CartLine, "quantity"> & { quantity: number } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const line = value as Record<string, unknown>;
  return (
    typeof line.productId === "string" &&
    typeof line.name === "string" &&
    typeof line.thumbnailUrl === "string" &&
    typeof line.unitPrice === "number" &&
    Number.isFinite(line.unitPrice) &&
    line.unitPrice >= 0 &&
    typeof line.stock === "number" &&
    Number.isFinite(line.stock) &&
    line.stock >= 0 &&
    typeof line.quantity === "number" &&
    Number.isFinite(line.quantity) &&
    typeof line.selected === "boolean"
  );
}

function normalizeStoredCart(value: unknown): CartLine[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isStoredCartLine(entry)) {
      return [];
    }

    const stock = Math.trunc(entry.stock);
    if (stock < 0) {
      return [];
    }

    const line: CartLine = { ...entry, stock };
    return [{ ...line, quantity: clampQuantity(line, entry.quantity) }];
  });
}

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

function toCartLine(product: Product, quantity: number, selected = true): CartLine {
  const line: CartLine = {
    productId: product.id,
    name: product.name,
    thumbnailUrl: product.thumbnailUrl,
    unitPrice: product.price,
    stock: product.stock,
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
  return current.productId === snapshot.productId
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

  const add = useCallback((product: Product, quantity: number) => {
    if (product.stock < 1 || !Number.isFinite(quantity)) {
      return;
    }

    setLines((currentLines) => {
      const existing = currentLines.find((line) => line.productId === product.id);
      if (!existing) {
        return [...currentLines, toCartLine(product, quantity)];
      }

      const updatedLine = toCartLine(product, existing.quantity + quantity, existing.selected);
      return currentLines.map((line) => (line.productId === product.id ? updatedLine : line));
    });
  }, []);

  const remove = useCallback((productId: string) => {
    setLines((currentLines) => currentLines.filter((line) => line.productId !== productId));
  }, []);

  const setQuantity = useCallback((productId: string, quantity: number) => {
    setLines((currentLines) =>
      currentLines.map((line) =>
        line.productId === productId ? { ...line, quantity: clampQuantity(line, quantity) } : line,
      ),
    );
  }, []);

  const setSelected = useCallback((productId: string, selected: boolean) => {
    setLines((currentLines) =>
      currentLines.map((line) => (line.productId === productId ? { ...line, selected } : line)),
    );
  }, []);

  const selectAll = useCallback((selected: boolean) => {
    setLines((currentLines) => currentLines.map((line) => ({ ...line, selected })));
  }, []);

  const clearSelected = useCallback(() => {
    setLines((currentLines) => currentLines.filter((line) => !line.selected));
  }, []);

  const prepareBuyNow = useCallback((product: Product, quantity: number) => {
    if (product.stock < 1 || !Number.isFinite(quantity)) {
      return;
    }
    setBuyNowLine(toCartLine(product, quantity));
  }, []);

  const clearBuyNow = useCallback(() => setBuyNowLine(null), []);

  const clearSubmitted = useCallback((submittedLines: readonly CartLine[]) => {
    const submittedByProductId = new Map(submittedLines.map((line) => [line.productId, line]));
    setLines((currentLines) => currentLines.filter((line) => {
      const submittedLine = submittedByProductId.get(line.productId);
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
