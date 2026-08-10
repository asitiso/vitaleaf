"use client";

import { useId, useState, type ReactNode } from "react";

import type { Product } from "../../lib/products/types";

type InfoKey = "dosage" | "ingredients" | "origin" | "certifications" | "cautions";

function InfoAccordion({
  id,
  label,
  open,
  onToggle,
  children,
}: {
  id: string;
  label: string;
  open: boolean;
  onToggle(): void;
  children: ReactNode;
}) {
  const buttonId = `${id}-button`;
  const regionId = `${id}-region`;

  return (
    <section className="product-info__accordion">
      <h3>
        <button
          id={buttonId}
          type="button"
          aria-expanded={open}
          aria-controls={regionId}
          onClick={onToggle}
        >
          <span>{label}</span>
          <span aria-hidden="true">{open ? "−" : "+"}</span>
        </button>
      </h3>
      {open ? (
        <div id={regionId} role="region" aria-labelledby={buttonId} className="product-info__region">
          {children}
        </div>
      ) : null}
    </section>
  );
}

const emptyText = <p>등록된 정보가 없습니다.</p>;

export function ProductInfo({ product }: { product: Product }) {
  const baseId = useId();
  const [openSections, setOpenSections] = useState<Set<InfoKey>>(() => new Set());

  const toggle = (key: InfoKey) => {
    setOpenSections((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const accordion = (key: InfoKey, label: string, content: ReactNode) => (
    <InfoAccordion
      id={`${baseId}-${key}`}
      label={label}
      open={openSections.has(key)}
      onToggle={() => toggle(key)}
    >
      {content}
    </InfoAccordion>
  );

  return (
    <section className="product-info" aria-labelledby={`${baseId}-title`}>
      <div className="product-info__heading">
        <p>PRODUCT STANDARD</p>
        <h2 id={`${baseId}-title`}>꼭 확인할 상품 정보</h2>
      </div>

      {product.benefits.length > 0 ? (
        <ul className="product-info__benefits" aria-label="핵심 기능성">
          {product.benefits.slice(0, 3).map((benefit, index) => (
            <li key={benefit}>
              <span aria-hidden="true">0{index + 1}</span>
              <strong>{benefit}</strong>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="product-info__accordions">
        {accordion("dosage", "섭취 방법", product.dosage ? <p>{product.dosage}</p> : emptyText)}
        {accordion(
          "ingredients",
          "성분·함량",
          product.ingredients.length > 0 ? (
            <div className="product-info__table-wrap">
              <table>
                <caption>성분 및 함량</caption>
                <thead>
                  <tr>
                    <th scope="col">성분명</th>
                    <th scope="col">1일 섭취량당 함량</th>
                    <th scope="col">영양성분 기준치 비율</th>
                  </tr>
                </thead>
                <tbody>
                  {product.ingredients.map((ingredient) => (
                    <tr key={`${ingredient.name}-${ingredient.amount}`}>
                      <td>{ingredient.name}</td>
                      <td>{ingredient.amount || "-"}</td>
                      <td>{ingredient.dailyValue || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : emptyText,
        )}
        {accordion("origin", "원산지", product.origin ? <p>{product.origin}</p> : emptyText)}
        {accordion(
          "certifications",
          "인증",
          product.certifications.length > 0 ? (
            <ul>{product.certifications.map((certification) => <li key={certification}>{certification}</li>)}</ul>
          ) : emptyText,
        )}
        {accordion(
          "cautions",
          "주의사항",
          product.cautions.length > 0 ? (
            <ul>{product.cautions.map((caution) => <li key={caution}>{caution}</li>)}</ul>
          ) : emptyText,
        )}
      </div>
    </section>
  );
}
