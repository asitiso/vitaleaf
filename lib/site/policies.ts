export const STORE_POLICIES = {
  support: { phone: "02-1234-5678", hours: "평일 09:00–18:00", lunch: "12:00–13:00" },
  shipping: { freeThreshold: 30_000, baseFee: 3_000, dispatch: "결제 확인 후 영업일 기준 순차 출고" },
  returns: { requestWindow: "수령 후 7일 이내", contactRequired: true },
} as const;
