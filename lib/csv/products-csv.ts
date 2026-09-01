import type { Ingredient, Product, ProductDraft, ProductInput } from "../products/types";
import { canonicalAgeTargets } from "../catalog/taxonomy";
import { getProductAvailableStock, normalizePurchaseOptions } from "../products/purchase-options";
import { isSafeIntegerKrw } from "../products/price";

export type CsvRowError = {
  row: number;
  field: keyof ProductInput | "row";
  message: string;
};

export const PRODUCT_CSV_HEADERS = [
  "name",
  "slug",
  "category",
  "concerns",
  "ageTargets",
  "price",
  "originalPrice",
  "thumbnailUrl",
  "images",
  "description",
  "benefits",
  "ingredients",
  "dosage",
  "origin",
  "certifications",
  "cautions",
  "stock",
  "purchaseOptionsJson",
  "isBest",
  "isNew",
  "salesRank",
  "ratingAverage",
  "reviewCount",
] as const satisfies readonly (keyof ProductInput | "purchaseOptionsJson")[];

type ProductCsvHeader = (typeof PRODUCT_CSV_HEADERS)[number];

type ParsedRow = {
  cells: string[];
  sourceRow: number;
};

const REQUIRED_HEADERS = ["name", "category", "price", "stock"] as const;
const HEADER_SET = new Set<string>(PRODUCT_CSV_HEADERS);

const emptyProduct = (): ProductInput => ({
  name: "",
  slug: "",
  category: "",
  concerns: [],
  ageTargets: [],
  price: 0,
  originalPrice: null,
  thumbnailUrl: "",
  images: [],
  description: "",
  benefits: [],
  ingredients: [],
  dosage: "",
  origin: "",
  certifications: [],
  cautions: [],
  stock: 0,
  isBest: false,
  isNew: false,
  salesRank: null,
  ratingAverage: 0,
  reviewCount: 0,
});

export const createCsvDraft = (input: ProductInput, id: string): ProductDraft => ({
  ...input,
  id,
  media: [],
  status: "draft",
  mode: "create",
  sessionId: null,
  revision: 0,
  sourceProductId: null,
  sourceProductRevision: null,
  sourceCreatedAt: null,
  sourceCreatedBy: null,
  currentStep: 1,
  createdAt: null,
  updatedAt: null,
  createdBy: null,
  updatedBy: null,
});

const encodeSpreadsheetSafe = (value: string): string => {
  if (value.startsWith("'") || /^[=+\-@]/.test(value)) return `'${value}`;
  return value;
};

const decodeSpreadsheetSafe = (value: string): string => {
  if (value.startsWith("''") || /^'[=+\-@]/.test(value)) return value.slice(1);
  return value;
};

const encodeList = (values: readonly string[]): string => values
  .map((item) => item.replaceAll("\\", "\\\\").replaceAll("|", "\\|"))
  .join("|");

const decodeList = (value: string): string[] => {
  const items: string[] = [];
  let item = "";
  let escaping = false;
  for (const character of value) {
    if (escaping) {
      item += character === "|" || character === "\\" ? character : `\\${character}`;
      escaping = false;
    } else if (character === "\\") {
      escaping = true;
    } else if (character === "|") {
      if (item.trim()) items.push(item.trim());
      item = "";
    } else {
      item += character;
    }
  }
  if (escaping) item += "\\";
  if (item.trim()) items.push(item.trim());
  return items;
};

const parseRows = (input: string): { rows: ParsedRow[]; errors: CsvRowError[] } => {
  const text = input.startsWith("\uFEFF") ? input.slice(1) : input;
  const rows: ParsedRow[] = [];
  const cells: string[] = [];
  const errors: CsvRowError[] = [];
  let cell = "";
  let inQuotes = false;
  let afterClosingQuote = false;
  let line = 1;
  let sourceRow = 1;

  const finishRow = () => {
    cells.push(cell);
    rows.push({ cells: [...cells], sourceRow });
    cells.length = 0;
    cell = "";
    afterClosingQuote = false;
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
          afterClosingQuote = true;
        }
      } else if (character === "\r") {
        if (text[index + 1] === "\n") index += 1;
        cell += "\n";
        line += 1;
      } else {
        cell += character;
        if (character === "\n") line += 1;
      }
      continue;
    }

    if (afterClosingQuote) {
      if (character === ",") {
        cells.push(cell);
        cell = "";
        afterClosingQuote = false;
      } else if (character === "\r" || character === "\n") {
        if (character === "\r" && text[index + 1] === "\n") index += 1;
        finishRow();
        line += 1;
        sourceRow = line;
      } else {
        errors.push({
          row: sourceRow,
          field: "row",
          message: "닫는 큰따옴표 뒤에는 쉼표 또는 줄바꿈만 사용할 수 있습니다.",
        });
        cell += character;
        afterClosingQuote = false;
      }
    } else if (character === '"' && cell.length === 0) {
      inQuotes = true;
    } else if (character === '"') {
      errors.push({
        row: sourceRow,
        field: "row",
        message: "큰따옴표는 셀의 시작에서만 사용할 수 있습니다.",
      });
      cell += character;
    } else if (character === ",") {
      cells.push(cell);
      cell = "";
    } else if (character === "\r" || character === "\n") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      finishRow();
      line += 1;
      sourceRow = line;
    } else {
      cell += character;
    }
  }

  if (inQuotes) {
    errors.push({ row: sourceRow, field: "row", message: "닫히지 않은 큰따옴표가 있습니다." });
  } else if (cell.length > 0 || cells.length > 0) {
    finishRow();
  }

  return { rows, errors };
};

const isIngredient = (value: unknown): value is Ingredient => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const ingredient = value as Record<string, unknown>;
  return typeof ingredient.name === "string"
    && typeof ingredient.amount === "string"
    && typeof ingredient.dailyValue === "string";
};

export const parseProductCsv = (text: string): { valid: ProductInput[]; errors: CsvRowError[] } => {
  const parsed = parseRows(text);
  if (parsed.rows.length === 0) {
    return {
      valid: [],
      errors: parsed.errors.length
        ? parsed.errors
        : [{ row: 1, field: "row", message: "CSV 헤더가 필요합니다." }],
    };
  }

  const [headerRow, ...dataRows] = parsed.rows;
  const headers = headerRow.cells.map((header) => header.trim());
  const headerErrors: CsvRowError[] = [];
  const seenHeaders = new Set<string>();
  for (const header of headers) {
    if (!HEADER_SET.has(header)) {
      headerErrors.push({ row: 1, field: "row", message: `지원하지 않는 열입니다: ${header || "(빈 열)"}` });
    } else if (seenHeaders.has(header)) {
      headerErrors.push({ row: 1, field: "row", message: `중복된 열입니다: ${header}` });
    }
    seenHeaders.add(header);
  }
  for (const required of REQUIRED_HEADERS) {
    if (!seenHeaders.has(required)) {
      headerErrors.push({ row: 1, field: required, message: `필수 열이 없습니다: ${required}` });
    }
  }
  if (headerErrors.length > 0 || parsed.errors.length > 0) {
    return { valid: [], errors: [...headerErrors, ...parsed.errors] };
  }

  const headerIndexes = new Map<ProductCsvHeader, number>();
  headers.forEach((header, index) => headerIndexes.set(header as ProductCsvHeader, index));
  const valid: ProductInput[] = [];
  const errors: CsvRowError[] = [];

  for (const row of dataRows) {
    if (row.cells.every((value) => value.trim() === "")) continue;
    if (row.cells.length !== headers.length) {
      errors.push({
        row: row.sourceRow,
        field: "row",
        message: `열 개수가 헤더와 일치하지 않습니다. 헤더 ${headers.length}개, 현재 행 ${row.cells.length}개입니다.`,
      });
      continue;
    }
    const product = emptyProduct();
    const rowErrors: CsvRowError[] = [];
    const value = (field: ProductCsvHeader): string => {
      const index = headerIndexes.get(field);
      return index === undefined ? "" : decodeSpreadsheetSafe((row.cells[index] ?? "").trim());
    };
    const addError = (field: keyof ProductInput, message: string) => {
      rowErrors.push({ row: row.sourceRow, field, message });
    };
    const list = (field: ProductCsvHeader): string[] => decodeList(value(field));
    const optionalNumber = (field: "salesRank", message: string): number | null => {
      const raw = value(field);
      if (!raw) return null;
      const number = Number(raw);
      if (!Number.isFinite(number) || number < 0) {
        addError(field, message);
        return null;
      }
      return number;
    };
    const optionalKrw = (field: "originalPrice", message: string): number | null => {
      const raw = value(field);
      if (!raw) return null;
      const number = Number(raw);
      if (!isSafeIntegerKrw(number)) {
        addError(field, message);
        return null;
      }
      return number;
    };
    const boolean = (field: "isBest" | "isNew"): boolean => {
      const raw = value(field).toLocaleLowerCase("en-US");
      if (!raw || raw === "false") return false;
      if (raw === "true") return true;
      addError(field, "true 또는 false를 입력해 주세요.");
      return false;
    };

    product.name = value("name");
    if (!product.name) addError("name", "상품명을 입력해 주세요.");
    product.slug = value("slug");
    product.category = value("category");
    if (!product.category) addError("category", "카테고리를 입력해 주세요.");
    product.concerns = list("concerns");
    product.ageTargets = canonicalAgeTargets(list("ageTargets"));

    const priceText = value("price");
    const price = Number(priceText);
    if (!priceText) addError("price", "판매가를 입력해 주세요.");
    else if (!isSafeIntegerKrw(price)) addError("price", "판매가는 0 이상의 정수여야 합니다.");
    else product.price = price;

    product.originalPrice = optionalKrw("originalPrice", "정상가는 0 이상의 정수여야 합니다.");
    product.thumbnailUrl = value("thumbnailUrl");
    product.images = list("images");
    product.description = value("description");
    product.benefits = list("benefits");

    const ingredients = value("ingredients");
    if (ingredients) {
      try {
        const candidate: unknown = JSON.parse(ingredients);
        if (!Array.isArray(candidate) || !candidate.every(isIngredient)) throw new Error("invalid ingredients");
        product.ingredients = candidate;
      } catch {
        addError("ingredients", "원료 정보는 JSON 배열 형식이어야 합니다.");
      }
    }

    product.dosage = value("dosage");
    product.origin = value("origin");
    product.certifications = list("certifications");
    product.cautions = list("cautions");

    const stockText = value("stock");
    const stock = Number(stockText);
    if (!stockText) addError("stock", "재고를 입력해 주세요.");
    else if (!Number.isInteger(stock) || stock < 0) addError("stock", "재고는 0 이상의 정수여야 합니다.");
    else product.stock = stock;

    if (isSafeIntegerKrw(product.price) && Number.isInteger(product.stock) && product.stock >= 0) {
      const purchaseOptionsJson = value("purchaseOptionsJson");
      if (purchaseOptionsJson) {
        try {
          const rawPurchaseOptions: unknown = JSON.parse(purchaseOptionsJson);
          product.purchaseOptions = normalizePurchaseOptions(rawPurchaseOptions, product.price, product.stock);
        } catch (error) {
          addError(
            "purchaseOptions",
            error instanceof SyntaxError
              ? "구매 옵션 정보는 JSON 배열 형식이어야 합니다."
              : "구매 옵션 정보가 올바르지 않습니다.",
          );
        }
      } else {
        product.purchaseOptions = normalizePurchaseOptions([], product.price, product.stock);
      }
      product.stock = getProductAvailableStock(product);
    }

    product.isBest = boolean("isBest");
    product.isNew = boolean("isNew");
    product.salesRank = optionalNumber("salesRank", "판매 순위는 0 이상의 숫자여야 합니다.");

    const ratingText = value("ratingAverage");
    if (ratingText) {
      const rating = Number(ratingText);
      if (!Number.isFinite(rating) || rating < 0 || rating > 5) {
        addError("ratingAverage", "평점은 0 이상 5 이하의 숫자여야 합니다.");
      } else {
        product.ratingAverage = rating;
      }
    }

    const reviewText = value("reviewCount");
    if (reviewText) {
      const reviewCount = Number(reviewText);
      if (!Number.isInteger(reviewCount) || reviewCount < 0) {
        addError("reviewCount", "리뷰 수는 0 이상의 정수여야 합니다.");
      } else {
        product.reviewCount = reviewCount;
      }
    }

    if (rowErrors.length > 0) errors.push(...rowErrors);
    else valid.push(product);
  }

  return { valid, errors };
};

const escapeCell = (value: string): string => {
  const safe = encodeSpreadsheetSafe(value);
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
};

const productCells = (product: Product): Record<ProductCsvHeader, string> => ({
  name: product.name,
  slug: product.slug,
  category: product.category,
  concerns: encodeList(product.concerns),
  ageTargets: encodeList(product.ageTargets ?? []),
  price: String(product.price),
  originalPrice: product.originalPrice === null ? "" : String(product.originalPrice),
  thumbnailUrl: product.thumbnailUrl,
  images: encodeList(product.images),
  description: product.description,
  benefits: encodeList(product.benefits),
  ingredients: JSON.stringify(product.ingredients),
  dosage: product.dosage,
  origin: product.origin,
  certifications: encodeList(product.certifications),
  cautions: encodeList(product.cautions),
  stock: String(product.stock),
  purchaseOptionsJson: JSON.stringify(normalizePurchaseOptions(
    product.purchaseOptions,
    product.price,
    product.stock,
  )),
  isBest: String(product.isBest),
  isNew: String(product.isNew),
  salesRank: product.salesRank === null ? "" : String(product.salesRank),
  ratingAverage: String(product.ratingAverage),
  reviewCount: String(product.reviewCount),
});

export const serializeProducts = (products: readonly Product[]): string => {
  // The CSV mirrors ProductInput. Firestore document IDs and server-managed timestamps are intentionally omitted.
  const lines = [PRODUCT_CSV_HEADERS.join(",")];
  for (const product of products) {
    const cells = productCells(product);
    lines.push(PRODUCT_CSV_HEADERS.map((header) => escapeCell(cells[header])).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}`;
};
