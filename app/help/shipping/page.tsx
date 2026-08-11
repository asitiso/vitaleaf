import { InfoPage } from "../../../components/content/info-page";
import { formatShippingFeePolicy, STORE_POLICIES } from "../../../lib/site/policies";

export default function ShippingPage() { return <InfoPage eyebrow="VITALEAF HELP" title="배송 안내" description="배송비와 출고 기준을 안내합니다." sections={[{ title: "배송비", body: formatShippingFeePolicy() }, { title: "출고", body: STORE_POLICIES.shipping.dispatch }]} links={[{ href: "/help/returns", label: "교환 및 반품 안내" }, { href: "/help", label: "고객센터" }]} />; }
