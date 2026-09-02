// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  get: vi.fn(),
  listForGuestOrder: vi.fn(),
  listForMember: vi.fn(),
  verifyBearerMember: vi.fn(),
}));

vi.mock("../../../lib/firebase/admin-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/firebase/admin-auth")>();
  return { ...actual, verifyBearerMember: mocks.verifyBearerMember };
});

vi.mock("../../../lib/firebase/inquiries", () => ({
  inquiryRepository: {
    create: mocks.create,
    get: mocks.get,
    listForGuestOrder: mocks.listForGuestOrder,
    listForMember: mocks.listForMember,
  },
}));

import { FirebaseAdminConfigurationError } from "../../../lib/firebase/admin";
import { ServerAuthenticationError } from "../../../lib/firebase/admin-auth";
import { POST as create } from "./route";
import { POST as detail } from "./detail/route";
import { POST as list } from "./list/route";

const authorization = { authorization: "Bearer member-token", "content-type": "application/json" };
const createRequest = (): Request => new Request("http://localhost/api/inquiries", {
  method: "POST",
  headers: authorization,
  body: JSON.stringify({
    category: "product",
    title: "상품 문의",
    body: "섭취 방법을 알려주세요.",
    orderNumber: null,
    uploadReceipts: [],
  }),
});
const listRequest = (): Request => new Request("http://localhost/api/inquiries/list", {
  method: "POST",
  headers: authorization,
  body: "{}",
});
const detailRequest = (): Request => new Request("http://localhost/api/inquiries/detail", {
  method: "POST",
  headers: authorization,
  body: JSON.stringify({ id: "inquiry-1" }),
});

beforeEach(() => {
  mocks.create.mockReset().mockResolvedValue(undefined);
  mocks.get.mockReset().mockResolvedValue(null);
  mocks.listForGuestOrder.mockReset().mockResolvedValue([]);
  mocks.listForMember.mockReset().mockResolvedValue([]);
  mocks.verifyBearerMember.mockReset().mockResolvedValue({ uid: "member-1" });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("member inquiry routes with real subject resolution", () => {
  it("maps preserved Firebase Admin configuration failures to the existing safe 503 response", async () => {
    mocks.verifyBearerMember.mockRejectedValue(new FirebaseAdminConfigurationError());
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const responses = await Promise.all([create(createRequest()), list(listRequest()), detail(detailRequest())]);

    expect(responses.map((response) => response.status)).toEqual([503, 503, 503]);
    await expect(responses[0].json()).resolves.toEqual({ message: "문의 서버 설정이 필요합니다." });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.listForMember).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("keeps invalid Firebase bearer failures at the unauthenticated 401 boundary", async () => {
    mocks.verifyBearerMember.mockRejectedValue(new ServerAuthenticationError(401));

    const responses = await Promise.all([create(createRequest()), list(listRequest()), detail(detailRequest())]);

    expect(responses.map((response) => response.status)).toEqual([401, 401, 401]);
  });
});
