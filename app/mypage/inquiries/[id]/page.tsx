import { MemberInquiryDetailPage } from "../../../../components/inquiries/member-inquiry-pages";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <MemberInquiryDetailPage id={id} />; }
