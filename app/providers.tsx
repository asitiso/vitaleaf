"use client";

import type { ReactNode } from "react";

import { AuthProvider } from "@/features/auth/auth-context";
import { CartProvider } from "@/features/cart/cart-context";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <CartProvider>{children}</CartProvider>
    </AuthProvider>
  );
}
