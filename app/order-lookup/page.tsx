import { GuestOrderLookupForm } from "../../components/orders/guest-order-lookup-form";

type OrderLookupPageProps = {
  searchParams: Promise<{ orderNumber?: string | string[] }>;
};

const ORDER_NUMBER_PATTERN = /^VL-\d{8}-[A-Z0-9]{6}$/u;

export default async function OrderLookupPage({ searchParams }: OrderLookupPageProps) {
  const params = await searchParams;
  const candidate = typeof params.orderNumber === "string" ? params.orderNumber : "";
  const initialOrderNumber = ORDER_NUMBER_PATTERN.test(candidate) ? candidate : "";

  return (
    <main>
      <GuestOrderLookupForm initialOrderNumber={initialOrderNumber} />
    </main>
  );
}
