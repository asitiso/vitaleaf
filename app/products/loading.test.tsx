import { render, screen } from "@testing-library/react";

import ProductsLoading from "./loading";

it("renders the shared product skeleton while Firestore is loading", () => {
  render(<ProductsLoading />);

  expect(screen.getByRole("status")).toHaveTextContent("상품을 불러오는 중");
  expect(screen.getAllByLabelText("상품 불러오는 중")).toHaveLength(4);
});
