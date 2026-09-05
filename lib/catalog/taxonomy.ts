export type TaxonomyOption = {
  value: string;
  label: string;
  description: string;
};

const normalizeTaxonomyText = (value: string): string => value.trim().toLocaleLowerCase("ko-KR");

export const findTaxonomyOption = (
  options: readonly TaxonomyOption[],
  candidate: string,
): TaxonomyOption | null => {
  const normalized = normalizeTaxonomyText(candidate);
  if (!normalized) return null;
  return options.find((option) => (
    normalizeTaxonomyText(option.value) === normalized
    || normalizeTaxonomyText(option.label) === normalized
  )) ?? null;
};

export const canonicalTaxonomyValue = (
  options: readonly TaxonomyOption[],
  candidate: string,
): string => findTaxonomyOption(options, candidate)?.value ?? candidate.trim();

export const canonicalTaxonomyValues = (
  options: readonly TaxonomyOption[],
  candidates: readonly string[],
): string[] => [...new Set(candidates.map((candidate) => canonicalTaxonomyValue(options, candidate)).filter(Boolean))];

export const taxonomyLabel = (
  options: readonly TaxonomyOption[],
  candidate: string,
): string => findTaxonomyOption(options, candidate)?.label ?? candidate.trim();

export const taxonomyValuesMatch = (
  options: readonly TaxonomyOption[],
  left: string,
  right: string,
): boolean => normalizeTaxonomyText(canonicalTaxonomyValue(options, left))
  === normalizeTaxonomyText(canonicalTaxonomyValue(options, right));

export const PRODUCT_CATEGORIES = [
  { value: "nutrition", label: "영양제", description: "매일 챙기는 기본 영양" },
  { value: "vitamin", label: "비타민", description: "비타민과 미네랄" },
  { value: "probiotic", label: "유산균", description: "장 건강을 위한 프로바이오틱스" },
  { value: "wellness", label: "웰니스", description: "생활 습관별 건강 관리" },
  { value: "food", label: "건강식품", description: "간편하게 섭취하는 건강식품" },
  { value: "gift", label: "선물세트", description: "건강을 전하는 구성" },
] as const satisfies readonly TaxonomyOption[];

export const HEALTH_CONCERNS = [
  { value: "energy", label: "피로·활력", description: "일상 활력을 위한 영양" },
  { value: "immunity", label: "면역", description: "일상 방어력 관리" },
  { value: "sleep", label: "수면", description: "편안한 휴식을 위한 케어" },
  { value: "eyes", label: "눈 건강", description: "선명한 일상을 위한 영양" },
  { value: "skin", label: "피부 건강", description: "건강한 피부 보습을 위한 관리" },
  { value: "liver", label: "간 건강", description: "활기찬 일상을 위한 간 건강 관리" },
  { value: "gut", label: "장 건강", description: "편안한 속을 위한 유산균" },
  { value: "brain", label: "뇌 건강", description: "집중과 기억을 위한 케어" },
  { value: "circulation", label: "혈행", description: "원활한 혈행을 위한 관리" },
  { value: "bones", label: "관절·뼈 건강", description: "튼튼한 관절과 뼈를 위한 관리" },
] as const satisfies readonly TaxonomyOption[];

export const AGE_TARGETS = [
  { value: "child", label: "어린이", description: "성장기 어린이를 위해 확인된 상품" },
  { value: "teen", label: "청소년", description: "청소년 생활 리듬에 맞춘 상품" },
  { value: "20", label: "20대", description: "바쁜 일상의 기초 건강 관리" },
  { value: "30", label: "30대", description: "바쁜 일상을 위한 기본 관리" },
  { value: "40", label: "40대", description: "변화가 느껴질 때의 건강 관리" },
  { value: "50", label: "50대+", description: "활기찬 일상을 위한 건강 관리" },
] as const satisfies readonly TaxonomyOption[];

export const canonicalAgeTargets = (candidates: readonly string[]): string[] =>
  canonicalTaxonomyValues(AGE_TARGETS, candidates)
    .filter((value) => AGE_TARGETS.some((option) => option.value === value));

export const PRODUCT_TEMPLATES = [
  { value: "vitamin", label: "비타민", description: "비타민·미네랄 상품 등록" },
  { value: "probiotic", label: "유산균", description: "유산균 상품 등록" },
  { value: "omega3", label: "오메가3", description: "오메가3 상품 등록" },
] as const satisfies readonly TaxonomyOption[];
