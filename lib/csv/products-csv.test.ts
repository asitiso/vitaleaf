import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import type { Product } from "../products/types";
import { parseProductCsv, serializeProducts } from "./products-csv";

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
  isBest: true,
  isNew: false,
  salesRank: 3,
  ratingAverage: 4.8,
  reviewCount: 126,
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  updatedAt: new Date("2026-08-09T00:00:00.000Z"),
};

describe("parseProductCsv", () => {
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
      { row: 2, field: "price", message: "판매가는 0 이상의 숫자여야 합니다." },
      { row: 2, field: "isBest", message: "true 또는 false를 입력해 주세요." },
      { row: 4, field: "name", message: "상품명을 입력해 주세요." },
      { row: 4, field: "category", message: "카테고리를 입력해 주세요." },
    ]);
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
});

describe("serializeProducts", () => {
  it("round-trips every ProductInput field while intentionally omitting id and timestamps", () => {
    const csv = serializeProducts([representativeProduct]);
    const result = parseProductCsv(csv);

    expect(result.errors).toEqual([]);
    expect(result.valid).toEqual([{
      name: "오메가3, 프리미엄",
      slug: "premium-omega-3",
      category: "혈행 건강",
      concerns: ["혈행", "기억력"],
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
      isBest: true,
      isNew: false,
      salesRank: 3,
      ratingAverage: 4.8,
      reviewCount: 126,
    }]);
    expect(csv.slice(1).split(/\r?\n/, 1)[0].split(",")).not.toContain("id");
    expect(csv).not.toContain("2026-08-01");
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
});

it("ships the exact BOM-prefixed import template consumed by the parser", () => {
  const template = readFileSync(resolve(process.cwd(), "public/products-template.csv"), "utf8");

  expect(template.replaceAll("\r\n", "\n")).toBe("\uFEFFname,slug,category,concerns,price,originalPrice,thumbnailUrl,images,description,benefits,ingredients,dosage,origin,certifications,cautions,stock,isBest,isNew,salesRank,ratingAverage,reviewCount\n");
  expect(parseProductCsv(template)).toEqual({ valid: [], errors: [] });
});
