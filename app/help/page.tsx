import { InfoPage } from "../../components/content/info-page";
import { formatSupportHours, STORE_POLICIES } from "../../lib/site/policies";

export default function HelpPage() {
  return (
    <InfoPage
      eyebrow="VITALEAF HELP"
      title="고객센터"
      description="주문 전후에 필요한 도움을 빠르게 확인해 보세요."
      sections={[
        { title: "상담 안내", body: formatSupportHours() },
        { title: "전화 문의", body: STORE_POLICIES.support.phone },
      ]}
      links={[
        { href: "/mypage/inquiries", label: "회원 1:1 문의" },
        { href: "/order-lookup", label: "비회원 주문 문의" },
        { href: "/help/shipping", label: "배송 안내" },
        { href: "/help/returns", label: "교환 및 반품 안내" },
      ]}
    />
  );
}
