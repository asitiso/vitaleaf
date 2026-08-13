import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

vi.mock("../../../lib/firebase/product-media", () => ({
  uploadProductImage: vi.fn(),
  deleteProductImage: vi.fn(),
  validateImageFile: (candidate: Pick<File, "type" | "size">) => (
    ["image/jpeg", "image/png", "image/webp"].includes(candidate.type) && candidate.size <= 10 * 1024 * 1024
      ? { ok: true }
      : { ok: false, message: "지원하지 않는 파일 형식입니다." }
  ),
}));

import type { ProductMedia } from "../../../lib/products/types";
import { MediaStep, type MediaUpload } from "./media-step";

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
};

const file = (name: string, type = "image/jpeg") => new File(["image"], name, { type });

const media = (url: string, order: number): ProductMedia => ({
  url,
  storagePath: `products/draft-1/${url}`,
  alt: url,
  order,
});

it("keeps successful uploads in the staff selection order when completion order changes", async () => {
  const user = userEvent.setup();
  const first = deferred<ProductMedia>();
  const second = deferred<ProductMedia>();
  const upload = vi.fn<MediaUpload>()
    .mockReturnValueOnce({ promise: first.promise, cancel: vi.fn() })
    .mockReturnValueOnce({ promise: second.promise, cancel: vi.fn() });
  const onChange = vi.fn();
  render(<MediaStep productId="draft-1" media={[]} onChange={onChange} upload={upload} deleteImage={vi.fn()} />);

  await user.upload(screen.getByLabelText("상품 이미지 추가"), [file("first.jpg"), file("second.jpg")]);
  second.resolve(media("second.jpg", 1));
  await screen.findByText("업로드 완료");
  expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ url: "second.jpg", order: 0 })]);

  first.resolve(media("first.jpg", 0));
  await waitFor(() => expect(onChange).toHaveBeenLastCalledWith([
    expect.objectContaining({ url: "first.jpg", order: 0 }),
    expect.objectContaining({ url: "second.jpg", order: 1 }),
  ]));
});

it("retries a failed upload without removing its staff-visible failure reason", async () => {
  const user = userEvent.setup();
  const failed = deferred<ProductMedia>();
  const retried = deferred<ProductMedia>();
  const upload = vi.fn<MediaUpload>()
    .mockReturnValueOnce({ promise: failed.promise, cancel: vi.fn() })
    .mockReturnValueOnce({ promise: retried.promise, cancel: vi.fn() });
  render(<MediaStep productId="draft-1" media={[]} onChange={vi.fn()} upload={upload} deleteImage={vi.fn()} />);

  await user.upload(screen.getByLabelText("상품 이미지 추가"), file("retry.jpg"));
  failed.reject(new Error("네트워크 연결을 확인하세요."));
  expect(await screen.findByRole("alert")).toHaveTextContent("네트워크 연결을 확인하세요.");
  await user.click(screen.getByRole("button", { name: "retry.jpg 다시 시도" }));
  retried.resolve(media("retry.jpg", 0));

  expect(await screen.findByText("업로드 완료")).toBeVisible();
  expect(upload).toHaveBeenCalledTimes(2);
});

it("moves media with keyboard controls and reindexes the controlled value", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<MediaStep productId="draft-1" media={[media("first.jpg", 0), media("second.jpg", 1)]} onChange={onChange} upload={vi.fn()} deleteImage={vi.fn()} />);

  await user.click(screen.getByRole("button", { name: "두 번째 이미지를 왼쪽으로 이동" }));

  expect(onChange).toHaveBeenLastCalledWith([
    expect.objectContaining({ url: "second.jpg", order: 0 }),
    expect.objectContaining({ url: "first.jpg", order: 1 }),
  ]);
});

it("keeps an image visible when storage deletion fails and offers a retry", async () => {
  const user = userEvent.setup();
  const remove = vi.fn().mockRejectedValue(new Error("삭제할 수 없습니다."));
  render(<MediaStep productId="draft-1" media={[media("first.jpg", 0)]} onChange={vi.fn()} upload={vi.fn()} deleteImage={remove} />);

  await user.click(screen.getByRole("button", { name: "첫 번째 이미지 삭제" }));
  await user.click(screen.getByRole("button", { name: "삭제 확인" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("삭제할 수 없습니다.");
  expect(screen.getByRole("img", { name: "first.jpg" })).toBeVisible();
  expect(screen.getByRole("button", { name: "첫 번째 이미지 삭제 다시 시도" })).toHaveFocus();
});

it("does not undo a representative choice when an earlier selected upload finishes later", async () => {
  const user = userEvent.setup();
  const first = deferred<ProductMedia>();
  const second = deferred<ProductMedia>();
  const upload = vi.fn<MediaUpload>()
    .mockReturnValueOnce({ promise: first.promise, cancel: vi.fn() })
    .mockReturnValueOnce({ promise: second.promise, cancel: vi.fn() });
  const onChange = vi.fn();
  render(<MediaStep productId="draft-1" media={[media("existing.jpg", 0)]} onChange={onChange} upload={upload} deleteImage={vi.fn()} />);

  await user.upload(screen.getByLabelText("상품 이미지 추가"), [file("first.jpg"), file("second.jpg")]);
  second.resolve(media("second.jpg", 2));
  await screen.findByText("업로드 완료");
  await user.click(screen.getByRole("button", { name: "두 번째 이미지를 대표로 설정" }));
  first.resolve(media("first.jpg", 1));

  await waitFor(() => expect(onChange).toHaveBeenLastCalledWith([
    expect.objectContaining({ url: "second.jpg", order: 0 }),
    expect.objectContaining({ url: "existing.jpg", order: 1 }),
    expect.objectContaining({ url: "first.jpg", order: 2 }),
  ]));
});

it("moves an image after its destination when moving right", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<MediaStep productId="draft-1" media={[media("first.jpg", 0), media("second.jpg", 1), media("third.jpg", 2)]} onChange={onChange} upload={vi.fn()} deleteImage={vi.fn()} />);

  await user.click(screen.getByRole("button", { name: "첫 번째 이미지를 오른쪽으로 이동" }));

  expect(onChange).toHaveBeenLastCalledWith([
    expect.objectContaining({ url: "second.jpg", order: 0 }),
    expect.objectContaining({ url: "first.jpg", order: 1 }),
    expect.objectContaining({ url: "third.jpg", order: 2 }),
  ]);
});

it("keeps hidden pending slots after a visible destination when moving right", async () => {
  const user = userEvent.setup();
  const first = deferred<ProductMedia>();
  const second = deferred<ProductMedia>();
  const upload = vi.fn<MediaUpload>()
    .mockReturnValueOnce({ promise: first.promise, cancel: vi.fn() })
    .mockReturnValueOnce({ promise: second.promise, cancel: vi.fn() });
  const onChange = vi.fn();
  render(<MediaStep productId="draft-1" media={[media("a.jpg", 0)]} onChange={onChange} upload={upload} deleteImage={vi.fn()} />);

  await user.upload(screen.getByLabelText("상품 이미지 추가"), [file("p1.jpg"), file("p2.jpg")]);
  second.resolve(media("p2.jpg", 2));
  await screen.findByText("업로드 완료");
  await user.click(screen.getByRole("button", { name: "첫 번째 이미지를 오른쪽으로 이동" }));
  first.resolve(media("p1.jpg", 1));

  await waitFor(() => expect(onChange).toHaveBeenLastCalledWith([
    expect.objectContaining({ url: "p2.jpg", order: 0 }),
    expect.objectContaining({ url: "a.jpg", order: 1 }),
    expect.objectContaining({ url: "p1.jpg", order: 2 }),
  ]));
});

it("removes an acknowledged upload when the controlled parent later deletes it", async () => {
  const user = userEvent.setup();
  const completed = deferred<ProductMedia>();
  const upload = vi.fn<MediaUpload>(() => ({ promise: completed.promise, cancel: vi.fn() }));
  const onChange = vi.fn();
  const props = { productId: "draft-1", media: [media("a.jpg", 0)], onChange, upload, deleteImage: vi.fn() };
  const view = render(<MediaStep {...props} />);

  await user.upload(screen.getByLabelText("상품 이미지 추가"), file("s.jpg"));
  completed.resolve(media("s.jpg", 1));
  await screen.findByText("업로드 완료");
  view.rerender(<MediaStep {...props} media={[media("a.jpg", 0), media("s.jpg", 1)]} />);
  view.rerender(<MediaStep {...props} media={[media("a.jpg", 0)]} />);

  await waitFor(() => expect(screen.queryByRole("img", { name: "s" })).not.toBeInTheDocument());
});

it("moves focus to an enabled card control after representative control disappears", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<MediaStep productId="draft-1" media={[media("a.jpg", 0), media("b.jpg", 1)]} onChange={onChange} upload={vi.fn()} deleteImage={vi.fn()} />);

  await user.click(screen.getByRole("button", { name: "두 번째 이미지를 대표로 설정" }));

  await waitFor(() => expect(screen.getByRole("button", { name: "첫 번째 이미지를 오른쪽으로 이동" })).toHaveFocus());
});

it("keeps the latest optimistic media when an older acknowledgement arrives, then accepts a later undo", async () => {
  const user = userEvent.setup();
  const completed = deferred<ProductMedia>();
  const upload = vi.fn<MediaUpload>(() => ({ promise: completed.promise, cancel: vi.fn() }));
  const props = { productId: "draft-1", media: [] as ProductMedia[], onChange: vi.fn(), upload, deleteImage: vi.fn() };
  const view = render(<MediaStep {...props} />);

  await user.upload(screen.getByLabelText("상품 이미지 추가"), file("s.jpg"));
  completed.resolve({ ...media("s.jpg", 0), alt: "s" });
  await screen.findByText("업로드 완료");
  await user.type(screen.getByRole("textbox", { name: "첫 번째 이미지 대체 텍스트" }), "-T");
  const older = [{ ...media("s.jpg", 0), alt: "s" }];
  const latest = [{ ...media("s-new.jpg", 0), storagePath: "products/draft-1/s.jpg", alt: "s-T" }];

  view.rerender(<MediaStep {...props} media={latest} />);
  await waitFor(() => expect(screen.getByRole("textbox", { name: "첫 번째 이미지 대체 텍스트" })).toHaveValue("s-T"));
  view.rerender(<MediaStep {...props} media={[...older]} />);
  expect(screen.getByRole("textbox", { name: "첫 번째 이미지 대체 텍스트" })).toHaveValue("s-T");
  view.rerender(<MediaStep {...props} media={[{ ...older[0]!, alt: "undo" }]} />);
  await waitFor(() => expect(screen.getByRole("textbox", { name: "첫 번째 이미지 대체 텍스트" })).toHaveValue("undo"));
});
