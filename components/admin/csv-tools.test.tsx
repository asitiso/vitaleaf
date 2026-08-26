import { act, render, screen, waitFor } from "@testing-library/react";
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
  media: [{ url: "https://example.com/omega.jpg", storagePath: null, alt: "Omega", order: 0 }],
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

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
};

it("ignores a stale file read so only the latest selection can be previewed and imported", async () => {
  const user = userEvent.setup();
  const onImport = vi.fn().mockResolvedValue(undefined);
  const pending = new Map<string, (contents: string) => void>();
  const readFile = vi.fn((file: File) => new Promise<string>((resolve) => {
    pending.set(file.name, resolve);
  }));
  render(<CsvTools products={[]} onImportDrafts={onImport} readFile={readFile} />);

  await user.upload(screen.getByLabelText("상품 CSV 파일"), new File(["older"], "older.csv", { type: "text/csv" }));
  await user.upload(screen.getByLabelText("상품 CSV 파일"), new File(["latest"], "latest.csv", { type: "text/csv" }));
  expect(readFile).toHaveBeenCalledTimes(2);

  await act(async () => pending.get("latest.csv")?.([
    "name,category,price,stock",
    "최신 상품,혈행,21000,5",
  ].join("\n")));
  expect(await screen.findByText("임시저장할 상품 1개를 확인해 주세요.")).toBeVisible();

  await act(async () => pending.get("older.csv")?.([
    "name,category,price,stock",
    "오래된 상품,혈행,10000,1",
  ].join("\n")));
  await user.click(screen.getByRole("button", { name: "1개 상품을 임시저장으로 가져오기" }));

  expect(onImport).toHaveBeenCalledWith([
    expect.objectContaining({ name: "최신 상품", price: 21_000 }),
  ]);
  expect(onImport).not.toHaveBeenCalledWith([
    expect.objectContaining({ name: "오래된 상품" }),
  ]);
});

it("blocks all writes when any row is invalid and shows every row-field error", async () => {
  const user = userEvent.setup();
  const onImport = vi.fn();
  render(<CsvTools products={[]} onImportDrafts={onImport} />);

  await user.upload(screen.getByLabelText("상품 CSV 파일"), csvFile([
    "name,category,price,stock",
    "불량 가격,혈행,-1,2",
    ",혈행,12000,-2",
  ].join("\n")));

  expect(await screen.findByText("2행 판매가: 판매가는 0 이상의 숫자여야 합니다.")).toBeVisible();
  expect(screen.getByText("3행 상품명: 상품명을 입력해 주세요.")).toBeVisible();
  expect(screen.getByText("3행 재고: 재고는 0 이상의 정수여야 합니다.")).toBeVisible();
  expect(screen.queryByRole("button", { name: /임시저장으로 가져오기/ })).not.toBeInTheDocument();
  expect(onImport).not.toHaveBeenCalled();
});

it.each([
  ['"오메가3"x,혈행,35000,10', "닫는 큰따옴표 뒤에는 쉼표 또는 줄바꿈만 사용할 수 있습니다."],
  ['오"메가3,혈행,35000,10', "큰따옴표는 셀의 시작에서만 사용할 수 있습니다."],
  ["오메가3,혈행,35000", "열 개수가 헤더와 일치하지 않습니다. 헤더 4개, 현재 행 3개입니다."],
])("blocks preview and writes for malformed CSV structure: %s", async (row, message) => {
  const user = userEvent.setup();
  const onImport = vi.fn();
  render(<CsvTools products={[]} onImportDrafts={onImport} />);

  await user.upload(screen.getByLabelText("상품 CSV 파일"), csvFile([
    "name,category,price,stock",
    row,
  ].join("\n")));

  expect(await screen.findByText(`2행: ${message}`)).toBeVisible();
  expect(screen.queryByText(/임시저장할 상품 \d+개를 확인해 주세요/)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /임시저장으로 가져오기/ })).not.toBeInTheDocument();
  expect(onImport).not.toHaveBeenCalled();
});

it("previews valid rows and requires explicit confirmation before saving drafts", async () => {
  const user = userEvent.setup();
  const onImport = vi.fn().mockResolvedValue(undefined);
  render(<CsvTools products={[]} onImportDrafts={onImport} />);

  await user.upload(screen.getByLabelText("상품 CSV 파일"), csvFile([
    "name,category,price,stock,isBest,ageTargets",
    "오메가3,혈행,35000,10,true,teen|20",
    "비타민D,뼈 건강,12000,8,false,",
  ].join("\n")));

  expect(await screen.findByText("임시저장할 상품 2개를 확인해 주세요.")).toBeVisible();
  expect(onImport).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "2개 상품을 임시저장으로 가져오기" }));

  await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
  expect(onImport).toHaveBeenCalledWith([
    expect.objectContaining({ name: "오메가3", price: 35_000, isBest: true, ageTargets: ["teen", "20"] }),
    expect.objectContaining({ name: "비타민D", price: 12_000, isBest: false }),
  ]);
  expect(await screen.findByText("상품 2개를 임시저장했습니다.")).toBeVisible();
});

it("keeps only failed rows available for a locked retry and reports the partial draft save", async () => {
  const user = userEvent.setup();
  const onImport = vi.fn()
    .mockResolvedValueOnce({ savedCount: 1, failures: [{ input: { name: "비타민D" }, message: "offline" }] })
    .mockResolvedValueOnce({ savedCount: 1, failures: [] });
  render(<CsvTools products={[]} onImportDrafts={onImport} />);

  await user.upload(screen.getByLabelText("상품 CSV 파일"), csvFile([
    "name,category,price,stock",
    "오메가3,혈행,35000,10",
    "비타민D,뼈 건강,12000,8",
  ].join("\n")));
  await user.click(await screen.findByRole("button", { name: "2개 상품을 임시저장으로 가져오기" }));

  expect(await screen.findByText("상품 1개를 임시저장했습니다. 1개는 저장하지 못했습니다. 다시 시도해 주세요.")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "1개 상품을 임시저장으로 다시 시도" }));

  await waitFor(() => expect(onImport).toHaveBeenCalledTimes(2));
  expect(onImport.mock.calls[1]?.[0]).toEqual([expect.objectContaining({ name: "비타민D" })]);
  expect(await screen.findByText("상품 1개를 임시저장했습니다.")).toBeVisible();
});

it.each([
  [{ savedCount: 1, failures: [] }, "상품 1개를 임시저장했습니다."],
  [{ savedCount: 0, failures: [{ input: { name: "A" }, message: "offline" }] }, "저장하지 못했습니다"],
])("does not let a completed old import replace a newer file preview", async (result, absentText) => {
  const user = userEvent.setup();
  const pending = deferred<unknown>();
  const onImportDrafts = vi.fn(() => pending.promise as Promise<never>);
  render(<CsvTools products={[]} onImportDrafts={onImportDrafts} />);

  await user.upload(screen.getByLabelText("상품 CSV 파일"), csvFile("name,category,price,stock\nA,vitamin,1000,1"));
  await user.click(await screen.findByRole("button", { name: "1개 상품을 임시저장으로 가져오기" }));
  await user.upload(screen.getByLabelText("상품 CSV 파일"), csvFile("name,category,price,stock\nB,vitamin,2000,2"));
  expect(await screen.findByText("임시저장할 상품 1개를 확인해 주세요.")).toBeVisible();

  await act(async () => pending.resolve(result));

  expect(screen.getByText("임시저장할 상품 1개를 확인해 주세요.")).toBeVisible();
  expect(screen.queryByText(absentText)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "1개 상품을 임시저장으로 가져오기" })).toBeEnabled();
});

it("rejects more than 400 rows before calling the import adapter", async () => {
  const user = userEvent.setup();
  const onImport = vi.fn();
  const rows = Array.from({ length: 401 }, (_, index) => `상품 ${index + 1},기타,1000,1`);
  render(<CsvTools products={[]} onImportDrafts={onImport} />);

  await user.upload(screen.getByLabelText("상품 CSV 파일"), csvFile([
    "name,category,price,stock",
    ...rows,
  ].join("\n")));

  expect(await screen.findByText("한 번에 최대 400개 상품만 임시저장할 수 있습니다.")).toBeVisible();
  expect(screen.queryByRole("button", { name: /임시저장으로 가져오기/ })).not.toBeInTheDocument();
  expect(onImport).not.toHaveBeenCalled();
});

it("links the exact public template and exports Excel-compatible BOM CSV", async () => {
  const user = userEvent.setup();
  const downloadCsv = vi.fn();
  render(<CsvTools products={[product]} onImportDrafts={vi.fn()} downloadCsv={downloadCsv} />);

  expect(screen.getByRole("link", { name: "CSV 양식 다운로드" })).toHaveAttribute("href", "/products-template.csv");
  expect(screen.getByRole("link", { name: "CSV 양식 다운로드" })).toHaveAttribute("download", "products-template.csv");
  await user.click(screen.getByRole("button", { name: "상품 CSV 내보내기" }));

  expect(downloadCsv).toHaveBeenCalledWith(expect.stringMatching(/^\uFEFFname,slug,category,/), "products.csv");
});

it("shows recoverable import and export failure states", async () => {
  const user = userEvent.setup();
  const onImport = vi.fn().mockRejectedValue(new Error("firestore unavailable"));
  const downloadCsv = vi.fn(() => { throw new Error("download unavailable"); });
  render(<CsvTools products={[product]} onImportDrafts={onImport} downloadCsv={downloadCsv} />);

  await user.upload(screen.getByLabelText("상품 CSV 파일"), csvFile([
    "name,category,price,stock",
    "오메가3,혈행,35000,10",
  ].join("\n")));
  await user.click(await screen.findByRole("button", { name: "1개 상품을 임시저장으로 가져오기" }));
  expect(await screen.findByText("상품을 임시저장하지 못했습니다. 네트워크 연결을 확인하고 다시 시도해 주세요.")).toBeVisible();

  await user.click(screen.getByRole("button", { name: "상품 CSV 내보내기" }));
  expect(await screen.findByText("CSV 파일을 내보내지 못했습니다. 다시 시도해 주세요.")).toBeVisible();
});
