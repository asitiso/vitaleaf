import { InfoPage } from "../../components/content/info-page";

export default function StoryPage() { return <InfoPage eyebrow="VITALEAF STORY" title="VITALEAF 이야기" description="바쁜 일상에도 성분과 정보를 쉽게 비교할 수 있는 건강 루틴을 만듭니다." sections={[{ title: "투명한 정보", body: "주요 성분과 섭취 방법을 확인하기 쉬운 형태로 안내합니다." }, { title: "내 생활에 맞는 선택", body: "연령, 관심 성분, 건강 고민을 기준으로 상품을 비교할 수 있습니다." }]} links={[{ href: "/ingredients", label: "성분 가이드 보기" }, { href: "/products", label: "상품 둘러보기" }]} />; }
