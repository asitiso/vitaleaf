import { describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({ db: {}, auth: {} }));

import { createReviewRepository } from "./reviews";

describe("createReviewRepository", () => {
  it("queries only approved reviews for the current product", async () => {
    const calls: unknown[][] = [];
    const repository = createReviewRepository({
      query: async (...args) => {
        calls.push(args);
        return [];
      },
    });

    await expect(repository.getApprovedReviews("p1")).resolves.toEqual([]);
    expect(calls[0]).toEqual(["p1", true]);
  });

  it("maps review documents to the public review shape", async () => {
    const createdAt = new Date("2026-08-10T00:00:00.000Z");
    const repository = createReviewRepository({
      query: async () => [
        {
          id: "review-1",
          data: () => ({
            productId: "p1",
            rating: 5,
            text: "Clear and helpful",
            authorAlias: "GreenLeaf",
            approved: true,
            createdAt: { toDate: () => createdAt },
          }),
        },
      ],
    });

    await expect(repository.getApprovedReviews("p1")).resolves.toEqual([
      {
        id: "review-1",
        productId: "p1",
        rating: 5,
        text: "Clear and helpful",
        authorAlias: "GreenLeaf",
        approved: true,
        createdAt,
      },
    ]);
  });
});
