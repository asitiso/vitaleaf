import { CheckoutForm } from "../../components/checkout/checkout-form";

type CheckoutPageProps = {
  searchParams: Promise<{ mode?: string | string[] }>;
};

export default async function CheckoutPage({ searchParams }: CheckoutPageProps) {
  const { mode } = await searchParams;
  return <CheckoutForm mode={mode === "buy-now" ? "buy-now" : "cart"} />;
}
