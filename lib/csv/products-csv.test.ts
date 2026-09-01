import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import type { Product } from "../products/types";
import { createCsvDraft, parseProductCsv, serializeProducts } from "./products-csv";

const representativeProduct: Product = {
  id: "omega-3",
  name: "오메가3, 프리미엄",
  slug: "premium-omega-3",
  category: "혈행 건강",
  concerns: ["혈행", "기억력"],
  price: 35_000,
  originalPrice: 42_000,
  thumbnailUrl: "https://example.com/omega,front.jpg",
  images: ["https://example.com/front.jpg", "https://example.com/back.jpg"],
  media: [
    { url: "https://example.com/omega,front.jpg", storagePath: null, alt: "Omega front", order: 0 },
    { url: "https://example.com/front.jpg", storagePath: null, alt: "Front", order: 1 },
    { url: "https://example.com/back.jpg", storagePath: null, alt: "Back", order: 2 },
  ],
  description: "깨끗한 원료의 \"고함량\" 오메가3",
  benefits: ["혈행 개선", "기억력 개선"],
  ingredients: [
    { name: "EPA 및 DHA", amount: "900 mg", dailyValue: "-" },
    { name: "비타민 E", amount: "3.3 mg", dailyValue: "30%" },
  ],
  dosage: "하루 1회, 2캡슐",
  origin: "대한민국",
  certifications: ["GMP", "IFOS"],
  cautions: ["임산부는 상담 후 섭취", "알레르기 확인"],
  stock: 18,
  purchaseOptions: [
    {
      id: "2-month",
      label: "2개월분",
      durationMonths: 2,
      sku: "OMEGA-2M",
      priceAdjustment: -17_500,
      stock: 8,
      active: true,
      isDefault: false,
    },
    {
      id: "4-month",
      label: "4개월분",
      durationMonths: 4,
      sku: "OMEGA-4M",
      priceAdjustment: 0,
      stock: 10,
      active: true,
      isDefault: true,
    },
  ],
  isBest: true,
  isNew: false,
  salesRank: 3,
  ratingAverage: 4.8,
  reviewCount: 126,
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  updatedAt: new Date("2026-08-09T00:00:00.000Z"),
};

describe("parseProductCsv", () => {
  it("keeps only supported recommendation ages from the escaped pipe list", () => {
    const result = parseProductCsv([
      "name,category,price,stock,ageTargets",
      "오메가3,혈행,35000,10,teen|unsupported|20|teen",
    ].join("\n"));

    expect(result.errors).toEqual([]);
    expect(result.valid[0]?.ageTargets).toEqual(["teen", "20"]);
  });

  it("removes a BOM and parses quoted commas, escaped quotes, arrays, numbers, and booleans", () => {
    const csv = [
      "\uFEFFname,category,price,originalPrice,stock,benefits,description,isBest,isNew,salesRank",
      '"오메가3, 프리미엄",혈행,35000,42000,10,"혈행|기억력","원료를 ""꼼꼼히"" 골랐습니다",true,false,3',
    ].join("\r\n");

    const result = parseProductCsv(csv);

    expect(result.errors).toEqual([]);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0]).toMatchObject({
      name: "오메가3, 프리미엄",
      benefits: ["혈행", "기억력"],
      description: '원료를 "꼼꼼히" 골랐습니다',
      price: 35_000,
      originalPrice: 42_000,
      stock: 10,
      isBest: true,
      isNew: false,
      salesRank: 3,
    });
  });

  it("reports every invalid field with its exact physical source row and a clear Korean message", () => {
    const csv = [
      "name,category,price,stock,isBest",
      '"두 줄짜리',
      '상품명",혈행,-1,2,maybe',
      ",,12000,1,false",
    ].join("\n");

    const result = parseProductCsv(csv);

    expect(result.valid).toEqual([]);
    expect(result.errors).toEqual([
      { row: 2, field: "price", message: "판매가는 0 이상의 정수여야 합니다." },
      { row: 2, field: "isBest", message: "true 또는 false를 입력해 주세요." },
      { row: 4, field: "name", message: "상품명을 입력해 주세요." },
      { row: 4, field: "category", message: "카테고리를 입력해 주세요." },
    ]);
  });

  it("rejects fractional and unsafe selling or original KRW prices by field", () => {
    const result = parseProductCsv([
      "name,category,price,originalPrice,stock",
      "소수 판매가,혈행,35000.5,,10",
      `안전 범위 초과 판매가,혈행,${Number.MAX_SAFE_INTEGER + 1},,10`,
      "소수 정상가,혈행,35000,42000.5,10",
      `안전 범위 초과 정상가,혈행,35000,${Number.MAX_SAFE_INTEGER + 1},10`,
    ].join("\n"));

    expect(result).toEqual({
      valid: [],
      errors: [
        { row: 2, field: "price", message: "판매가는 0 이상의 정수여야 합니다." },
        { row: 3, field: "price", message: "판매가는 0 이상의 정수여야 합니다." },
        { row: 4, field: "originalPrice", message: "정상가는 0 이상의 정수여야 합니다." },
        { row: 5, field: "originalPrice", message: "정상가는 0 이상의 정수여야 합니다." },
      ],
    });
  });

  it("rejects malformed ingredient JSON and an unclosed quoted row without throwing", () => {
    const invalidIngredients = parseProductCsv([
      "name,category,price,stock,ingredients",
      '오메가3,혈행,35000,10,"not json"',
    ].join("\n"));
    expect(invalidIngredients.errors).toEqual([
      { row: 2, field: "ingredients", message: "원료 정보는 JSON 배열 형식이어야 합니다." },
    ]);

    const unclosed = parseProductCsv('name,category,price,stock\n"오메가3,혈행,35000,10');
    expect(unclosed.errors).toEqual([
      { row: 2, field: "row", message: "닫히지 않은 큰따옴표가 있습니다." },
    ]);
  });

  it("rejects characters after a closing quote before the next delimiter", () => {
    const result = parseProductCsv([
      "name,category,price,stock",
      '"오메가3"x,혈행,35000,10',
    ].join("\n"));

    expect(result).toEqual({
      valid: [],
      errors: [{
        row: 2,
        field: "row",
        message: "닫는 큰따옴표 뒤에는 쉼표 또는 줄바꿈만 사용할 수 있습니다.",
      }],
    });
  });

  it("rejects a quote inside an unquoted cell", () => {
    const result = parseProductCsv([
      "name,category,price,stock",
      '오"메가3,혈행,35000,10',
    ].join("\n"));

    expect(result).toEqual({
      valid: [],
      errors: [{
        row: 2,
        field: "row",
        message: "큰따옴표는 셀의 시작에서만 사용할 수 있습니다.",
      }],
    });
  });

  it("rejects both extra and missing row columns against the header", () => {
    const result = parseProductCsv([
      "name,category,price,stock",
      "열 초과,혈행,35000,10,unexpected",
      "열 부족,혈행,35000",
    ].join("\n"));

    expect(result).toEqual({
      valid: [],
      errors: [
        { row: 2, field: "row", message: "열 개수가 헤더와 일치하지 않습니다. 헤더 4개, 현재 행 5개입니다." },
        { row: 3, field: "row", message: "열 개수가 헤더와 일치하지 않습니다. 헤더 4개, 현재 행 3개입니다." },
      ],
    });
  });
});

it("maps a valid CSV input to a new, unpublished draft identity", () => {
  const draft = createCsvDraft({
    name: "CSV 비타민",
    slug: "csv-vitamin",
    category: "vitamin",
    concerns: [],
    price: 18_000,
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
    stock: 20,
    isBest: false,
    isNew: false,
    salesRank: null,
    ratingAverage: 0,
    reviewCount: 0,
  }, "new-csv-draft");

  expect(draft).toMatchObject({
    id: "new-csv-draft",
    status: "draft",
    mode: "create",
    sessionId: null,
    revision: 0,
    sourceProductId: null,
    media: [],
    name: "CSV 비타민",
    stock: 20,
  });
});

describe("serializeProducts", () => {
  it("round-trips recommendation ages", () => {
    const result = parseProductCsv(serializeProducts([{
      ...representativeProduct,
      ageTargets: ["teen", "20"],
    }]));

    expect(result.errors).toEqual([]);
    expect(result.valid[0]?.ageTargets).toEqual(["teen", "20"]);
  });

  it("round-trips every ProductInput field while intentionally omitting id and timestamps", () => {
    const csv = serializeProducts([representativeProduct]);
    const result = parseProductCsv(csv);

    expect(result.errors).toEqual([]);
    expect(result.valid).toEqual([{
      name: "오메가3, 프리미엄",
      slug: "premium-omega-3",
      category: "혈행 건강",
      concerns: ["혈행", "기억력"],
      ageTargets: [],
      price: 35_000,
      originalPrice: 42_000,
      thumbnailUrl: "https://example.com/omega,front.jpg",
      images: ["https://example.com/front.jpg", "https://example.com/back.jpg"],
      description: '깨끗한 원료의 "고함량" 오메가3',
      benefits: ["혈행 개선", "기억력 개선"],
      ingredients: [
        { name: "EPA 및 DHA", amount: "900 mg", dailyValue: "-" },
        { name: "비타민 E", amount: "3.3 mg", dailyValue: "30%" },
      ],
      dosage: "하루 1회, 2캡슐",
      origin: "대한민국",
      certifications: ["GMP", "IFOS"],
      cautions: ["임산부는 상담 후 섭취", "알레르기 확인"],
      stock: 18,
      purchaseOptions: representativeProduct.purchaseOptions,
      isBest: true,
      isNew: false,
      salesRank: 3,
      ratingAverage: 4.8,
      reviewCount: 126,
    }]);
    expect(csv.slice(1).split(/\r?\n/, 1)[0].split(",")).not.toContain("id");
    expect(csv).not.toContain("2026-08-01");
  });

  it("reports malformed or invalid purchase option JSON without dropping the row", () => {
    const malformed = parseProductCsv([
      "name,category,price,stock,purchaseOptionsJson",
      '오메가3,혈행,35000,10,"not json"',
    ].join("\n"));
    const invalid = parseProductCsv([
      "name,category,price,stock,purchaseOptionsJson",
      '오메가3,혈행,35000,10,"[{""id"":""2-month""}]"',
    ].join("\n"));

    expect(malformed).toEqual({
      valid: [],
      errors: [{ row: 2, field: "purchaseOptions", message: "구매 옵션 정보는 JSON 배열 형식이어야 합니다." }],
    });
    expect(invalid).toEqual({
      valid: [],
      errors: [{ row: 2, field: "purchaseOptions", message: "구매 옵션 정보가 올바르지 않습니다." }],
    });
  });

  it("normalizes missing purchase option JSON as the legacy default option", () => {
    const result = parseProductCsv([
      "name,category,price,stock",
      "레거시 상품,혈행,35000,10",
    ].join("\n"));

    expect(result.errors).toEqual([]);
    expect(result.valid[0]?.purchaseOptions).toEqual([{
      id: "default",
      label: "기본 구성",
      durationMonths: null,
      sku: "",
      priceAdjustment: 0,
      stock: 10,
      active: true,
      isDefault: true,
    }]);
  });

  it("synchronizes CSV compatibility stock from active explicit purchase options", () => {
    const purchaseOptionsJson = JSON.stringify([
      {
        id: "2-month",
        label: "2개월분",
        durationMonths: 2,
        sku: "OMEGA-2M",
        priceAdjustment: -10_000,
        stock: 8,
        active: true,
        isDefault: false,
      },
      {
        id: "4-month",
        label: "4개월분",
        durationMonths: 4,
        sku: "OMEGA-4M",
        priceAdjustment: 0,
        stock: 10,
        active: true,
        isDefault: true,
      },
      {
        id: "retired",
        label: "판매 종료",
        durationMonths: null,
        sku: "OMEGA-OLD",
        priceAdjustment: 0,
        stock: 7,
        active: false,
        isDefault: false,
      },
    ]);
    const result = parseProductCsv([
      "name,category,price,stock,purchaseOptionsJson",
      `옵션 상품,혈행,35000,1,"${purchaseOptionsJson.replaceAll('"', '""')}"`,
    ].join("\n"));

    expect(result.errors).toEqual([]);
    expect(result.valid[0]?.stock).toBe(18);
  });

  it("starts with a UTF-8 BOM and neutralizes spreadsheet formulas in exported string cells", () => {
    const csv = serializeProducts([{
      ...representativeProduct,
      name: "=WEBSERVICE(\"https://bad.example\")",
      category: "+SUM(1,1)",
      description: "-2+3",
      dosage: "@cmd",
    }]);

    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("'=" + 'WEBSERVICE(""https://bad.example"")');
    expect(csv).toContain('"\'+SUM(1,1)"');
    expect(csv).toContain("'-2+3");
    expect(csv).toContain("'@cmd");
  });

  it("round-trips formula-leading strings without corrupting legitimate leading apostrophes", () => {
    const protectedProduct = {
      ...representativeProduct,
      name: "=WEBSERVICE(\"https://bad.example\")",
      slug: "'=legitimate-apostrophe",
      category: "+SUM(1,1)",
      description: "-2+3",
      dosage: "@cmd",
      origin: "''two-apostrophes",
    };

    const result = parseProductCsv(serializeProducts([protectedProduct]));

    expect(result.errors).toEqual([]);
    expect(result.valid[0]).toMatchObject({
      name: "=WEBSERVICE(\"https://bad.example\")",
      slug: "'=legitimate-apostrophe",
      category: "+SUM(1,1)",
      description: "-2+3",
      dosage: "@cmd",
      origin: "''two-apostrophes",
    });
  });

  it("round-trips array entries containing delimiters and backslashes with the documented escapes", () => {
    const escapedProduct = {
      ...representativeProduct,
      concerns: ["혈행|기억력", "경로\\하위"],
      images: ["https://example.com/a|b.jpg", "C:\\images\\front.jpg"],
      benefits: ["A\\|B", "일반 혜택"],
      certifications: ["GMP|HACCP", "인증\\번호"],
      cautions: ["첫째|둘째", "\\주의\\"],
    };

    const csv = serializeProducts([escapedProduct]);
    const result = parseProductCsv(csv);

    expect(csv).toContain("혈행\\|기억력|경로\\\\하위");
    expect(result.errors).toEqual([]);
    expect(result.valid[0]).toMatchObject({
      concerns: ["혈행|기억력", "경로\\하위"],
      images: ["https://example.com/a|b.jpg", "C:\\images\\front.jpg"],
      benefits: ["A\\|B", "일반 혜택"],
      certifications: ["GMP|HACCP", "인증\\번호"],
      cautions: ["첫째|둘째", "\\주의\\"],
    });
  });
});

it("ships the exact BOM-prefixed import template consumed by the parser", () => {
  const template = readFileSync(resolve(process.cwd(), "public/products-template.csv"), "utf8");

  expect(template.replaceAll("\r\n", "\n")).toMatch(/^\uFEFFname,slug,category,concerns,ageTargets,price,originalPrice,thumbnailUrl,images,description,benefits,ingredients,dosage,origin,certifications,cautions,stock,purchaseOptionsJson,isBest,isNew,salesRank,ratingAverage,reviewCount\n/);
  expect(parseProductCsv(template)).toMatchObject({
    errors: [],
    valid: [{
      name: "예시 상품",
      purchaseOptions: [
        expect.objectContaining({ id: "2-month", sku: "EXAMPLE-2M", priceAdjustment: -12_450 }),
        expect.objectContaining({ id: "4-month", sku: "EXAMPLE-4M", isDefault: true }),
      ],
    }],
  });
});
