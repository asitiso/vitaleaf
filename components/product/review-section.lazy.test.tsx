import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

it("renders review content without initializing Firebase before a retry", async () => {
  vi.doMock("../../lib/firebase/reviews", () => {
    throw new Error("Firebase initialized eagerly");
  });

  const { ReviewSection } = await import("./review-section");
  render(<ReviewSection productId="sample-product" initialReviews={[]} />);

  expect(screen.getByText("아직 등록된 리뷰가 없습니다")).toBeVisible();
});
