import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import type { Product } from "../../lib/products/types";
import { CsvTools } from "./csv-tools";

const product: Product = {
  id: "omega",
  name: "데일리 오메가3",
  slug: "daily-omega",
  category: "혈행 건강",
  concerns: ["혈행"],
  price: 28_000,
  originalPrice: null,
  thumbnailUrl: "https://example.com/omega.jpg",
  images: [],
  description: "매일 섭취하는 오메가3",
  benefits: ["혈행 건강"],
  ingredients: [],
  dosage: "하루 1회",
  origin: "대한민국",
  certifications: ["GMP"],
  cautions: [],
  stock: 12,
  isBest: true,
  isNew: false,
  salesRank: 2,
  ratingAverage: 4.8,
  reviewCount: 31,
  createdAt: null,
  updatedAt: null,
};

const csvFile = (contents: string) => new File([contents], "products.csv", { type: "text/csv;charset=utf-8" });

it("blocks all writes when any row is invalid and shows every row-field error", async () => {
  const user = userEvent.setup();
  const onImport = vi.fn();
  render(<CsvTools products={[]} onImport={onImport} />);

  await user.upload(screen.getByLabelText("상품 CSV 파일"), csvFile([
    "name,category,price,stock",
    "불량 가격,혈행,-1,2",
    ",혈행,12000,-2",
  ].join("\n")));

  expect(await screen.findByText("2행 판매가: 판매가는 0 이상의 숫자여야 합니다.")).toBeVisible();
  expect(screen.getByText("3행 상품명: 상품명을 입력해 주세요.")).toBeVisible();
  expect(screen.getByText("3행 재고: 재고는 0 이상의 정수여야 합니다.")).toBeVisible();
  expect(screen.queryByRole("button", { name: /상품 가져오기/ })).not.toBeInTheDocument();
  expect(onImport).not.toHaveBeenCalled();
});

it("previews valid rows and requires explicit confirmation before one import", async () => {
  const user = userEvent.setup();
  const onImport = vi.fn().mockResolvedValue(undefined);
  render(<CsvTools products={[]} onImport={onImport} />);

  await user.upload(screen.getByLabelText("상품 CSV 파일"), csvFile([
    "name,category,price,stock,isBest",
    "오메가3,혈행,35000,10,true",
    "비타민D,뼈 건강,12000,8,false",
  ].join("\n")));

  expect(await screen.findByText("가져올 상품 2개를 확인해 주세요.")).toBeVisible();
  expect(onImport).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "2개 상품 가져오기" }));

  await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
  expect(onImport).toHaveBeenCalledWith([
    expect.objectContaining({ name: "오메가3", price: 35_000, isBest: true }),
    expect.objectContaining({ name: "비타민D", price: 12_000, isBest: false }),
  ]);
  expect(await screen.findByText("상품 2개를 가져왔습니다.")).toBeVisible();
});

it("rejects more than 400 rows before calling the import adapter", async () => {
  const user = userEvent.setup();
  const onImport = vi.fn();
  const rows = Array.from({ length: 401 }, (_, index) => `상품 ${index + 1},기타,1000,1`);
  render(<CsvTools products={[]} onImport={onImport} />);

  await user.upload(screen.getByLabelText("상품 CSV 파일"), csvFile([
    "name,category,price,stock",
    ...rows,
  ].join("\n")));

  expect(await screen.findByText("한 번에 최대 400개 상품만 가져올 수 있습니다.")).toBeVisible();
  expect(screen.queryByRole("button", { name: /상품 가져오기/ })).not.toBeInTheDocument();
  expect(onImport).not.toHaveBeenCalled();
});

it("links the exact public template and exports Excel-compatible BOM CSV", async () => {
  const user = userEvent.setup();
  const downloadCsv = vi.fn();
  render(<CsvTools products={[product]} onImport={vi.fn()} downloadCsv={downloadCsv} />);

  expect(screen.getByRole("link", { name: "CSV 양식 다운로드" })).toHaveAttribute("href", "/products-template.csv");
  expect(screen.getByRole("link", { name: "CSV 양식 다운로드" })).toHaveAttribute("download", "products-template.csv");
  await user.click(screen.getByRole("button", { name: "상품 CSV 내보내기" }));

  expect(downloadCsv).toHaveBeenCalledWith(expect.stringMatching(/^\uFEFFname,slug,category,/), "products.csv");
});

it("shows recoverable import and export failure states", async () => {
  const user = userEvent.setup();
  const onImport = vi.fn().mockRejectedValue(new Error("firestore unavailable"));
  const downloadCsv = vi.fn(() => { throw new Error("download unavailable"); });
  render(<CsvTools products={[product]} onImport={onImport} downloadCsv={downloadCsv} />);

  await user.upload(screen.getByLabelText("상품 CSV 파일"), csvFile([
    "name,category,price,stock",
    "오메가3,혈행,35000,10",
  ].join("\n")));
  await user.click(await screen.findByRole("button", { name: "1개 상품 가져오기" }));
  expect(await screen.findByText("상품을 가져오지 못했습니다. 네트워크 연결을 확인하고 다시 시도해 주세요.")).toBeVisible();

  await user.click(screen.getByRole("button", { name: "상품 CSV 내보내기" }));
  expect(await screen.findByText("CSV 파일을 내보내지 못했습니다. 다시 시도해 주세요.")).toBeVisible();
});
