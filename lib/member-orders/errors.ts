export class MemberOrderUnavailableError extends Error {
  constructor() {
    super("주문할 수 없는 상품이 포함되어 있습니다.");
    this.name = "MemberOrderUnavailableError";
  }
}

export class MemberOrderIdempotencyConflictError extends Error {
  constructor() {
    super("같은 주문 요청 키에 다른 주문 정보를 사용할 수 없습니다.");
    this.name = "MemberOrderIdempotencyConflictError";
  }
}

export class MemberOrderDuplicateError extends Error {
  constructor() {
    super("이미 존재하는 주문번호입니다.");
    this.name = "MemberOrderDuplicateError";
  }
}
