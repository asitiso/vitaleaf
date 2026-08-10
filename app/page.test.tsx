import { render, screen } from "@testing-library/react";
import Home from "./page";

it("renders the Vitaleaf storefront entry point in Korean", () => {
  render(<Home />);

  expect(
    screen.getByRole("heading", { name: "하루 한 번, 기초 건강을 빈틈없이" }),
  ).toBeInTheDocument();
});
