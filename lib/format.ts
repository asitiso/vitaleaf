export const formatWon = (value: number): string =>
  `${Math.round(value).toLocaleString("ko-KR")}원`;
