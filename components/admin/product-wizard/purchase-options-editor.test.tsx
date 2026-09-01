import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PurchaseOption } from "../../../lib/products/types";
import { PurchaseOptionsEditor } from "./purchase-options-editor";

const explicitOptions = (): PurchaseOption[] => [
  {
    id: "two-month",
    label: "2개월분",
    durationMonths: 2,
    sku: "VITA-2M",
    priceAdjustment: -35_000,
    stock: 12,
    active: true,
    isDefault: false,
  },
  {
    id: "four-month",
    label: "4개월분",
    durationMonths: 4,
    sku: "VITA-4M",
    priceAdjustment: 0,
    stock: 20,
    active: true,
    isDefault: true,
  },
];

function EditorHarness({
  initialOptions = explicitOptions(),
  basePrice = 80_000,
  errors = [],
}: {
  initialOptions?: PurchaseOption[];
  basePrice?: number;
  errors?: string[];
}) {
  const [options, setOptions] = useState(initialOptions);
  return <PurchaseOptionsEditor basePrice={basePrice} options={options} errors={errors} onChange={setOptions} />;
}

describe("PurchaseOptionsEditor", () => {
  beforeEach(() => {
    let sequence = 0;
    vi.spyOn(globalThis.crypto, "randomUUID").mockImplementation(
      () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
    );
  });

  it("keeps a signed adjustment editable and shows base, adjustment, and final prices together", async () => {
    const user = userEvent.setup();
    render(<EditorHarness />);

    const firstOption = screen.getByRole("group", { name: "옵션 1 · 2개월분" });
    expect(within(firstOption).getByText("기본가격 80,000원")).toBeVisible();
    expect(within(firstOption).getByText("조정액 -35,000원")).toBeVisible();
    expect(within(firstOption).getByText("최종가격 45,000원")).toBeVisible();

    const adjustment = screen.getByLabelText("옵션 1 가격 조정액");
    await user.clear(adjustment);
    await user.type(adjustment, "-30000");

    expect(adjustment).toHaveValue(-30_000);
    expect(within(firstOption).getByText("최종가격 50,000원")).toBeVisible();
  });

  it("adds, clones, reorders, and deletes rows without changing existing IDs", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <PurchaseOptionsEditor basePrice={80_000} options={explicitOptions()} errors={[]} onChange={onChange} />,
    );

    await user.click(screen.getByRole("button", { name: "옵션 1 복제" }));
    const cloned = onChange.mock.calls.at(-1)?.[0] as PurchaseOption[];
    expect(cloned.map((option) => option.id)).toEqual([
      "two-month",
      "00000000-0000-4000-8000-000000000001",
      "four-month",
    ]);
    expect(cloned[1]).toMatchObject({ label: "2개월분", sku: "VITA-2M-COPY", isDefault: false });

    rerender(<PurchaseOptionsEditor basePrice={80_000} options={cloned} errors={[]} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "옵션 2 아래로 이동" }));
    const reordered = onChange.mock.calls.at(-1)?.[0] as PurchaseOption[];
    expect(reordered.map((option) => option.id)).toEqual([
      "two-month",
      "four-month",
      "00000000-0000-4000-8000-000000000001",
    ]);

    rerender(<PurchaseOptionsEditor basePrice={80_000} options={reordered} errors={[]} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "옵션 3 삭제" }));
    expect(onChange).toHaveBeenLastCalledWith(explicitOptions());

    rerender(<PurchaseOptionsEditor basePrice={80_000} options={explicitOptions()} errors={[]} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "구매 옵션 추가" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.arrayContaining([
      expect.objectContaining({ id: "00000000-0000-4000-8000-000000000002", sku: "OPTION-3" }),
    ]));
  });

  it("makes the selected active row the only default option", async () => {
    const user = userEvent.setup();
    render(<EditorHarness />);

    await user.click(screen.getByRole("radio", { name: "옵션 1 기본 옵션" }));

    expect(screen.getByRole("radio", { name: "옵션 1 기본 옵션" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "옵션 2 기본 옵션" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "옵션 1 판매 활성" })).toBeChecked();
  });

  it.each([
    ["duplicate SKU", async (user: ReturnType<typeof userEvent.setup>) => {
      const sku = screen.getByLabelText("옵션 2 SKU");
      await user.clear(sku);
      await user.type(sku, "VITA-2M");
    }, "Purchase option SKU values must be unique."],
    ["negative stock", async (user: ReturnType<typeof userEvent.setup>) => {
      const stock = screen.getByLabelText("옵션 1 재고");
      await user.clear(stock);
      await user.type(stock, "-1");
    }, "Purchase option stock must be a non-negative integer."],
    ["fractional adjustment", async (user: ReturnType<typeof userEvent.setup>) => {
      const adjustment = screen.getByLabelText("옵션 1 가격 조정액");
      await user.clear(adjustment);
      await user.type(adjustment, "0.5");
    }, "Purchase option priceAdjustment must be an integer."],
    ["final price below one won", async (user: ReturnType<typeof userEvent.setup>) => {
      const adjustment = screen.getByLabelText("옵션 1 가격 조정액");
      await user.clear(adjustment);
      await user.type(adjustment, "-80000");
    }, "Purchase option final price must be at least 1 KRW."],
    ["inactive default", async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(screen.getByRole("checkbox", { name: "옵션 2 판매 활성" }));
    }, "An inactive purchase option cannot be the default."],
  ])("surfaces the canonical validation message for %s", async (_name, edit, message) => {
    const user = userEvent.setup();
    render(<EditorHarness />);

    await edit(user);

    expect(screen.getByRole("alert")).toHaveTextContent(message);
  });

  it.each([
    ["adjustment", 80_000, Number.MAX_SAFE_INTEGER + 1, "Purchase option priceAdjustment must be a safe integer."],
    ["final price", Number.MAX_SAFE_INTEGER, 1, "Purchase option final price must be at least 1 KRW."],
  ])("describes only the first adjustment whose %s is unsafe", (_label, basePrice, priceAdjustment, error) => {
    const options = explicitOptions().map((option, index) => index === 0
      ? { ...option, priceAdjustment }
      : option);
    render(<EditorHarness basePrice={basePrice} initialOptions={options} />);

    const invalidAdjustment = screen.getByLabelText("옵션 1 가격 조정액");
    const validAdjustment = screen.getByLabelText("옵션 2 가격 조정액");

    expect(invalidAdjustment).toHaveAttribute("data-purchase-options-price-error-target", "true");
    expect(invalidAdjustment).toHaveAccessibleDescription(error);
    expect(validAdjustment).not.toHaveAttribute("data-purchase-options-price-error-target");
    expect(validAdjustment).not.toHaveAccessibleDescription();
  });

  it("reports a missing active default after the default row is deleted", async () => {
    const user = userEvent.setup();
    render(<EditorHarness />);

    await user.click(screen.getByRole("button", { name: "옵션 2 삭제" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Exactly one active purchase option must be the default.");
  });

  it("preserves invalid draft text instead of silently turning an empty stock into zero", async () => {
    const user = userEvent.setup();
    render(<EditorHarness />);

    const stock = screen.getByLabelText("옵션 1 재고");
    await user.clear(stock);

    expect(stock).toHaveValue(null);
    expect(screen.getByRole("alert")).toHaveTextContent("Purchase option stock must be a non-negative integer.");
  });

  it("renders caller validation errors in the editor error region", () => {
    render(<EditorHarness errors={["구매 옵션을 다시 확인해 주세요."]} />);

    expect(screen.getByRole("alert")).toHaveTextContent("구매 옵션을 다시 확인해 주세요.");
  });

  it("treats a displayed zero-stock default-shaped row as explicit and requires its SKU", () => {
    render(<EditorHarness initialOptions={[{
      id: "default",
      label: "기본 구성",
      durationMonths: null,
      sku: "",
      priceAdjustment: 0,
      stock: 0,
      active: true,
      isDefault: true,
    }]} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Purchase option sku is required.");
  });
});
