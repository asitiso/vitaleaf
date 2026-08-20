"use client";

import { useRef, useState, type ChangeEvent } from "react";

import {
  parseProductCsv,
  serializeProducts,
  type CsvRowError,
} from "../../lib/csv/products-csv";
import type { Product, ProductInput } from "../../lib/products/types";

const MAX_IMPORT_COUNT = 400;

const FIELD_LABELS: Record<CsvRowError["field"], string> = {
  row: "행",
  name: "상품명",
  slug: "슬러그",
  category: "카테고리",
  concerns: "관련 건강",
  price: "판매가",
  originalPrice: "정상가",
  thumbnailUrl: "대표 이미지 URL",
  images: "이미지 URL 목록",
  description: "상품 설명",
  benefits: "혜택",
  ingredients: "원료 정보",
  dosage: "섭취 방법",
  origin: "원산지",
  certifications: "인증",
  cautions: "주의사항",
  stock: "재고",
  isBest: "베스트 상품",
  isNew: "신상품",
  salesRank: "판매 순위",
  ratingAverage: "평점",
  reviewCount: "리뷰 수",
};

const readUtf8File = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
  reader.onerror = () => reject(reader.error ?? new Error("file read failed"));
  reader.readAsText(file, "utf-8");
});

const downloadCsvInBrowser = (csv: string, filename: string): void => {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

export type CsvDraftImportFailure = {
  input: ProductInput;
  message: string;
};

export type CsvDraftImportResult = {
  savedCount: number;
  failures: CsvDraftImportFailure[];
  stale?: boolean;
};

type CsvToolsProps = {
  products: readonly Product[];
  onImportDrafts(products: ProductInput[]): Promise<CsvDraftImportResult>;
  importing?: boolean;
  downloadCsv?: (csv: string, filename: string) => void;
  readFile?: (file: File) => Promise<string>;
};

export function CsvTools({ products, onImportDrafts, importing = false, downloadCsv = downloadCsvInBrowser, readFile = readUtf8File }: CsvToolsProps) {
  const [preview, setPreview] = useState<ProductInput[]>([]);
  const [previewGeneration, setPreviewGeneration] = useState<number | null>(null);
  const [errors, setErrors] = useState<CsvRowError[]>([]);
  const [message, setMessage] = useState("");
  const [importError, setImportError] = useState("");
  const [exportError, setExportError] = useState("");
  const [localImporting, setLocalImporting] = useState(false);
  const selectionGeneration = useRef(0);
  const previewGenerationRef = useRef<number | null>(null);
  const importLock = useRef(false);

  const selectFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const generation = selectionGeneration.current + 1;
    selectionGeneration.current = generation;
    setPreview([]);
    setPreviewGeneration(null);
    setErrors([]);
    setMessage("");
    previewGenerationRef.current = null;
    setImportError("");
    if (!file) return;

    try {
      const contents = await readFile(file);
      if (generation !== selectionGeneration.current) return;
      const result = parseProductCsv(contents);
      if (result.errors.length > 0) {
        setErrors(result.errors);
        return;
      }
      if (result.valid.length === 0) {
        setImportError("임시저장할 상품이 없습니다.");
        return;
      }
      if (result.valid.length > MAX_IMPORT_COUNT) {
        setImportError(`한 번에 최대 ${MAX_IMPORT_COUNT}개 상품만 임시저장할 수 있습니다.`);
        return;
      }
      setPreview(result.valid);
      setPreviewGeneration(generation);
      previewGenerationRef.current = generation;
    } catch {
      if (generation !== selectionGeneration.current) return;
      setImportError("CSV 파일을 읽지 못했습니다. UTF-8 형식인지 확인해 주세요.");
    }
  };

  const confirmImport = async () => {
    if (
      preview.length === 0
      || errors.length > 0
      || previewGeneration !== selectionGeneration.current
      || localImporting
      || importing
      || importLock.current
    ) return;
    const batch = preview;
    const batchGeneration = previewGeneration;
    setLocalImporting(true);
    setImportError("");
    setMessage("");
    try {
      importLock.current = true;
      const outcome = (await onImportDrafts(batch)) ?? { savedCount: batch.length, failures: [] };
      if (outcome.stale || selectionGeneration.current !== batchGeneration || previewGenerationRef.current !== batchGeneration) return;
      if (outcome.failures.length > 0) {
        const failedInputs = outcome.failures.map((failure) => failure.input);
        setPreview(failedInputs);
        setPreviewGeneration(selectionGeneration.current);
        setImportError(`상품 ${outcome.savedCount}개를 임시저장했습니다. ${failedInputs.length}개는 저장하지 못했습니다. 다시 시도해 주세요.`);
        return;
      }
      setMessage(`상품 ${outcome.savedCount}개를 임시저장했습니다.`);
      setPreview([]);
      setPreviewGeneration(null);
    } catch {
      if (selectionGeneration.current === batchGeneration && previewGenerationRef.current === batchGeneration) {
        setImportError("상품을 임시저장하지 못했습니다. 네트워크 연결을 확인하고 다시 시도해 주세요.");
      }
    } finally {
      importLock.current = false;
      setLocalImporting(false);
    }
  };

  const exportProducts = () => {
    setExportError("");
    try {
      downloadCsv(serializeProducts(products), "products.csv");
    } catch {
      setExportError("CSV 파일을 내보내지 못했습니다. 다시 시도해 주세요.");
    }
  };

  return (
    <section aria-labelledby="csv-tools-heading">
      <div className="admin-section-heading">
        <div>
          <p className="admin-eyebrow">CSV BULK TOOLS</p>
          <h2 id="csv-tools-heading">CSV 일괄 관리</h2>
        </div>
      </div>
      <p>
        양식을 내려받아 한 번에 최대 400개 상품을 검증한 뒤 임시저장할 수 있습니다.
        배열 값은 <code>|</code>로 구분하고 값 안의 <code>|</code>와 <code>\</code>는 각각 <code>\|</code>와 <code>\\</code>로 입력해 주세요.
        원료 정보는 JSON 배열로 입력해 주세요.
      </p>
      <div className="admin-form-actions">
        <a className="admin-secondary-button" href="/products-template.csv" download="products-template.csv">CSV 양식 다운로드</a>
        <button type="button" className="admin-secondary-button" onClick={exportProducts}>상품 CSV 내보내기</button>
      </div>
      <label>
        <span>상품 CSV 파일</span>
        <input aria-label="상품 CSV 파일" type="file" accept=".csv,text/csv" disabled={importing} onChange={(event) => void selectFile(event)} />
      </label>

      {errors.length > 0 && (
        <div className="admin-error" role="alert">
          <p>오류 {errors.length}개를 모두 수정한 뒤 다시 선택해 주세요. 상품은 임시저장되지 않았습니다.</p>
          <ul aria-label="CSV 검증 오류">
            {errors.map((error, index) => (
              <li key={`${error.row}-${error.field}-${index}`}>
                {error.row}행{error.field === "row" ? "" : ` ${FIELD_LABELS[error.field]}`}: {error.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {importError && <p className="admin-error" role="alert">{importError}</p>}
      {exportError && <p className="admin-error" role="alert">{exportError}</p>}
      {message && <p role="status">{message}</p>}
      {preview.length > 0 && (
        <div role="status">
          <p>임시저장할 상품 {preview.length}개를 확인해 주세요.</p>
          <button
            type="button"
            className="admin-primary-button"
            disabled={localImporting || importing}
            onClick={() => void confirmImport()}
          >
            {localImporting || importing
              ? "임시저장 중"
              : importError
                ? `${preview.length}개 상품을 임시저장으로 다시 시도`
                : `${preview.length}개 상품을 임시저장으로 가져오기`}
          </button>
        </div>
      )}
    </section>
  );
}
