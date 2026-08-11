import { InfoPage } from "../../../components/content/info-page";
import { STORE_POLICIES } from "../../../lib/site/policies";

const won = (amount: number) => `${amount.toLocaleString("ko-KR")}원`;
export default function ShippingPage() { return <InfoPage eyebrow="VITALEAF HELP" title="배송 안내" description="배송비와 출고 기준을 안내합니다." sections={[{ title: "배송비", body: `${won(STORE_POLICIES.shipping.freeThreshold)} 이상 구매 시 무료이며, 미만일 경우 ${won(STORE_POLICIES.shipping.baseFee)}입니다.` }, { title: "출고", body: STORE_POLICIES.shipping.dispatch }]} links={[{ href: "/help/returns", label: "교환 및 반품 안내" }, { href: "/help", label: "고객센터" }]} />; }
