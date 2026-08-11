import { InfoPage } from "../../../components/content/info-page";
import { STORE_POLICIES } from "../../../lib/site/policies";

export default function ReturnsPage() { return <InfoPage eyebrow="VITALEAF HELP" title="교환 및 반품 안내" description="신청 전에 아래 기준을 확인해 주세요." sections={[{ title: "신청 기간", body: STORE_POLICIES.returns.requestWindow }, { title: "신청 방법", body: STORE_POLICIES.returns.contactRequired ? "상품 상태 확인을 위해 고객센터에 먼저 문의해 주세요." : "고객센터에서 신청할 수 있습니다." }]} links={[{ href: "/help/shipping", label: "배송 안내" }, { href: "/help", label: "고객센터" }]} />; }
