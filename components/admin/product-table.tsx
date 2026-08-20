"use client";

/* eslint-disable @next/next/no-img-element -- catalog media uses unrestricted Firebase and legacy URLs. */

import { useMemo } from "react";

import { formatWon } from "../../lib/format";
import type { Product, ProductDraft } from "../../lib/products/types";

export type ProductTableRow =
  | { kind: "published"; value: Product }
  | { kind: "draft"; value: ProductDraft };

export type ProductStatusFilter = "all" | "published" | "draft" | "sold-out";
export type ProductSort = "modified-desc" | "name-asc" | "stock-asc";

type ProductTableProps = {
  rows: ProductTableRow[];
  query: string;
  statusFilter: ProductStatusFilter;
  sort: ProductSort;
  lockedIds: ReadonlySet<string>;
  statusOptions?: ProductStatusFilter[];
  onQueryChange(query: string): void;
  onStatusFilterChange(status: ProductStatusFilter): void;
  onSortChange(sort: ProductSort): void;
  onEdit(row: ProductTableRow): void;
  onDuplicate(productId: string): void;
  onPreview(row: ProductTableRow): void;
  onPublish(draft: ProductDraft): void;
  onUnpublish(product: Product): void;
  onDelete(row: ProductTableRow): void;
  onToggleStock(product: Product): void;
};

const statusLabels: Record<ProductStatusFilter, string> = {
  all: "전체 상태",
  published: "공개 상품",
  draft: "초안",
  "sold-out": "품절",
};

const sortLabels: Record<ProductSort, string> = {
  "modified-desc": "최근 수정순",
  "name-asc": "상품명순",
  "stock-asc": "재고 적은순",
};

const koreanDateTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const normalizedText = (value: string): string => value.trim().toLocaleLowerCase("ko-KR");

const matchesStatus = (row: ProductTableRow, status: ProductStatusFilter): boolean => {
  if (status === "all") return true;
  if (status === "draft") return row.kind === "draft";
  if (status === "published") return row.kind === "published";
  return row.kind === "published" && row.value.stock === 0;
};

const modifiedAt = (row: ProductTableRow): Date | null => row.value.updatedAt ?? row.value.createdAt;

const compareRows = (sort: ProductSort) => (left: ProductTableRow, right: ProductTableRow): number => {
  if (sort === "name-asc") {
    return left.value.name.localeCompare(right.value.name, "ko-KR") || left.value.id.localeCompare(right.value.id);
  }
  if (sort === "stock-asc") {
    return left.value.stock - right.value.stock
      || left.value.name.localeCompare(right.value.name, "ko-KR");
  }
  return (modifiedAt(right)?.getTime() ?? Number.NEGATIVE_INFINITY)
    - (modifiedAt(left)?.getTime() ?? Number.NEGATIVE_INFINITY)
    || left.value.name.localeCompare(right.value.name, "ko-KR");
};

const displayDate = (date: Date): string => koreanDateTimeFormatter.format(date);

const rowStatus = (row: ProductTableRow): string => {
  if (row.kind === "published") return row.value.stock > 0 ? "판매 중" : "품절";
  if (row.value.status === "publishing") return "공개 중";
  if (row.value.mode === "restore") return "판매 중지 초안";
  if (row.value.mode === "edit") return "수정 초안";
  return "임시 저장";
};

const representativeMedia = (row: ProductTableRow): { url: string; alt: string } | null => {
  const first = [...row.value.media].sort((left, right) => left.order - right.order)[0];
  if (first?.url) return { url: first.url, alt: first.alt.trim() || `${row.value.name} 대표 이미지` };
  return row.value.thumbnailUrl
    ? { url: row.value.thumbnailUrl, alt: `${row.value.name} 대표 이미지` }
    : null;
};

export function ProductTable({
  rows,
  query,
  statusFilter,
  sort,
  lockedIds,
  statusOptions = ["all", "published", "draft", "sold-out"],
  onQueryChange,
  onStatusFilterChange,
  onSortChange,
  onEdit,
  onDuplicate,
  onPreview,
  onPublish,
  onUnpublish,
  onDelete,
  onToggleStock,
}: ProductTableProps) {
  const visibleRows = useMemo(() => {
    const normalizedQuery = normalizedText(query);
    return rows
      .filter((row) => matchesStatus(row, statusFilter))
      .filter((row) => !normalizedQuery || [row.value.name, row.value.id, row.value.category]
        .some((value) => normalizedText(value).includes(normalizedQuery)))
      .sort(compareRows(sort));
  }, [query, rows, sort, statusFilter]);

  return (
    <section className="admin-product-table" aria-label="상품 목록">
      <div className="admin-table-controls">
        <label className="admin-table-search">
          <span>상품 검색</span>
          <input
            type="search"
            aria-label="상품 검색"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="상품명, 카테고리, ID 검색"
          />
        </label>
        <label>
          <span>상태</span>
          <select aria-label="상태 필터" value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value as ProductStatusFilter)}>
            {statusOptions.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
          </select>
        </label>
        <label>
          <span>정렬</span>
          <select aria-label="상품 정렬" value={sort} onChange={(event) => onSortChange(event.target.value as ProductSort)}>
            {(Object.keys(sortLabels) as ProductSort[]).map((option) => <option key={option} value={option}>{sortLabels[option]}</option>)}
          </select>
        </label>
      </div>

      {visibleRows.length === 0 ? (
        <div className="admin-empty">조건에 맞는 상품이 없습니다.</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption>상품 관리 목록</caption>
            <thead><tr><th>상품</th><th>상태</th><th>판매 정보</th><th>최근 수정</th><th>관리</th></tr></thead>
            <tbody>{visibleRows.map((row) => {
              const item = row.value;
              const name = item.name.trim() || "이름 없는 상품";
              const media = representativeMedia(row);
              const timestamp = modifiedAt(row);
              const locked = lockedIds.has(item.id);
              return (
                <tr key={`${row.kind}:${item.id}`} aria-busy={locked || undefined}>
                  <td data-label="상품">
                    <div className="admin-product-cell">
                      {media ? <img src={media.url} alt={media.alt} /> : <span className="admin-product-cell__placeholder" aria-hidden="true">사진 없음</span>}
                      <span><strong>{name}</strong><small>{item.id} · {item.category || "미분류"}</small></span>
                    </div>
                  </td>
                  <td data-label="상태"><span className={`admin-status admin-status--${row.kind === "published" && item.stock > 0 ? "published" : row.kind === "draft" ? "draft" : "sold-out"}`}>{rowStatus(row)}</span></td>
                  <td data-label="판매 정보">
                    <strong>{formatWon(item.price)}</strong>
                    {row.kind === "published" ? (
                      <button
                        type="button"
                        className={item.stock > 0 ? "admin-stock" : "admin-stock admin-stock--off"}
                        aria-label={`${name} ${item.stock > 0 ? "품절 처리" : "판매 재개"}`}
                        disabled={locked}
                        onClick={() => onToggleStock(item)}
                      >{item.stock > 0 ? `${item.stock}개` : "품절"}</button>
                    ) : <small>{item.stock}개</small>}
                  </td>
                  <td data-label="최근 수정">
                    {timestamp ? <time dateTime={timestamp.toISOString()}>{displayDate(timestamp)}</time> : <span>저장 전</span>}
                  </td>
                  <td data-label="관리">
                    <div className="admin-row-actions">
                      <button type="button" disabled={locked} aria-label={`${name} 수정`} onClick={() => onEdit(row)}>수정</button>
                      {row.kind === "published" ? <button type="button" disabled={locked} aria-label={`${name} 복제`} onClick={() => onDuplicate(item.id)}>복제</button> : null}
                      <button type="button" disabled={locked} aria-label={`${name} 미리 보기`} onClick={() => onPreview(row)}>미리 보기</button>
                      {row.kind === "published"
                        ? <button type="button" disabled={locked} aria-label={`${name} 판매 중지`} onClick={() => onUnpublish(row.value)}>판매 중지</button>
                        : <button type="button" disabled={locked} aria-label={`${name} 판매 공개`} onClick={() => onPublish(row.value)}>판매 공개</button>}
                      <button type="button" disabled={locked} aria-label={`${name} 삭제`} onClick={() => onDelete(row)}>삭제</button>
                    </div>
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
