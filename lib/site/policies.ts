export const STORE_POLICIES = {
  support: {
    phone: "02-1234-5678",
    hours: "평일 09:00–18:00",
    lunch: "12:00–13:00",
  },
  shipping: {
    freeThreshold: 30_000,
    baseFee: 3_000,
    dispatch: "결제 확인 후 영업일 기준 순차 출고",
  },
  storefront: {
    firstPurchaseRecommendation: "첫 구매 추천 상품",
  },
  returns: { requestWindow: "수령 후 7일 이내", contactRequired: true },
} as const;

const formatPolicyWon = (amount: number) => `${amount.toLocaleString("ko-KR")}원`;
const formatCompactWon = (amount: number) => amount % 10_000 === 0 ? `${amount / 10_000}만원` : formatPolicyWon(amount);

export const formatFreeShippingCondition = () => `${formatCompactWon(STORE_POLICIES.shipping.freeThreshold)} 이상 무료배송`;
export const formatShippingFeePolicy = () => `${formatPolicyWon(STORE_POLICIES.shipping.freeThreshold)} 이상 구매 시 무료이며, 미만일 경우 ${formatPolicyWon(STORE_POLICIES.shipping.baseFee)}입니다.`;
export const formatSupportHours = () => `${STORE_POLICIES.support.hours} (점심 ${STORE_POLICIES.support.lunch})`;
export const formatShippingBenefitBar = () => `${STORE_POLICIES.storefront.firstPurchaseRecommendation} · ${formatFreeShippingCondition()} · ${STORE_POLICIES.shipping.dispatch}`;
export const supportPhoneHref = () => `tel:${STORE_POLICIES.support.phone.replaceAll("-", "")}`;
