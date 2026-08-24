"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useAuth } from "../../features/auth/auth-context";
import { memberAuth, type MemberIdentity } from "../../lib/firebase/member-auth";
import { listMemberOrders, type MemberOrder } from "../../lib/firebase/member-orders";
import { getUserProfile, type UserProfile, type UserProfilePatch, updateUserProfile } from "../../lib/firebase/user-profile";
import { OrderHistory } from "./order-history";
import { ProfileForm } from "./profile-form";

type LoadState<T> =
  | { kind: "error"; uid: string; retry: number }
  | { kind: "ready"; uid: string; retry: number; data: T };

type MyPageProps = {
  notice?: string | null;
};

export function MyPage({ notice }: MyPageProps) {
  const { status, user } = useAuth();

  if (status === "checking") {
    return <main aria-busy="true"><p role="status">마이페이지를 확인하는 중입니다.</p></main>;
  }

  if (status !== "signed-in" || !user) {
    return (
      <main>
        <h1>마이페이지</h1>
        <p>회원 정보와 주문 내역을 확인하려면 로그인해 주세요.</p>
        <Link href="/login?next=%2Fmypage">로그인</Link>
      </main>
    );
  }

  return <AuthenticatedMyPage key={user.uid} notice={notice} user={user} />;
}

type AuthenticatedMyPageProps = {
  notice?: string | null;
  user: MemberIdentity;
};

function AuthenticatedMyPage({ notice, user }: AuthenticatedMyPageProps) {
  const uid = user.uid;
  const [profileState, setProfileState] = useState<LoadState<UserProfile | null> | null>(null);
  const [orderState, setOrderState] = useState<LoadState<MemberOrder[]> | null>(null);
  const [profileRetry, setProfileRetry] = useState(0);
  const [orderRetry, setOrderRetry] = useState(0);
  const [verificationMessage, setVerificationMessage] = useState("");
  const [isSendingVerification, setIsSendingVerification] = useState(false);

  useEffect(() => {
    let active = true;
    const requestedUid = uid;
    void getUserProfile(requestedUid).then(
      (profile) => {
        if (!active) return;
        setProfileState({ kind: "ready", uid: requestedUid, retry: profileRetry, data: profile });
      },
      () => {
        if (!active) return;
        setProfileState({ kind: "error", uid: requestedUid, retry: profileRetry });
      },
    );
    return () => {
      active = false;
    };
  }, [profileRetry, uid]);

  useEffect(() => {
    let active = true;
    const requestedUid = uid;
    void listMemberOrders(requestedUid).then(
      (orders) => {
        if (!active) return;
        setOrderState({ kind: "ready", uid: requestedUid, retry: orderRetry, data: orders });
      },
      () => {
        if (!active) return;
        setOrderState({ kind: "error", uid: requestedUid, retry: orderRetry });
      },
    );
    return () => {
      active = false;
    };
  }, [orderRetry, uid]);

  const profileIsCurrent = profileState?.uid === uid && profileState.retry === profileRetry;
  const orderIsCurrent = orderState?.uid === uid && orderState.retry === orderRetry;

  const saveProfile = async (patch: UserProfilePatch) => {
    await updateUserProfile(uid, patch);
  };

  const sendVerification = async () => {
    if (isSendingVerification) return;
    setVerificationMessage("");
    setIsSendingVerification(true);
    try {
      await memberAuth.sendVerification();
      setVerificationMessage("인증 메일을 보냈습니다. 받은편지함을 확인해 주세요.");
    } catch {
      setVerificationMessage("인증 메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsSendingVerification(false);
    }
  };

  return (
    <main className="my-page">
      <header>
        <p>VITALEAF MEMBER</p>
        <h1>마이페이지</h1>
        <p>{user.email}</p>
      </header>
      {!user.emailVerified ? (
        <section aria-labelledby="verification-heading">
          <h2 id="verification-heading">이메일 인증 안내</h2>
          {notice === "verification-email-failed" ? <p role="alert">인증 메일을 보내지 못했습니다. 아래 버튼으로 다시 요청해 주세요.</p> : null}
          <p>이메일 인증은 계정 확인을 위한 안내이며 주문과 결제는 계속 이용할 수 있습니다.</p>
          {verificationMessage ? <p role={verificationMessage.includes("못했습니다") ? "alert" : "status"}>{verificationMessage}</p> : null}
          <button disabled={isSendingVerification} onClick={sendVerification} type="button">
            {isSendingVerification ? "인증 메일 보내는 중" : "인증 메일 다시 보내기"}
          </button>
        </section>
      ) : null}

      <section aria-labelledby="profile-heading">
        <h2 id="profile-heading">회원 정보와 기본 배송지</h2>
        {!profileIsCurrent ? <p role="status">회원 정보를 불러오는 중입니다.</p> : null}
        {profileIsCurrent && profileState.kind === "error" ? (
          <div aria-label="회원 정보 오류" role="alert">
            <p>회원 정보를 불러오지 못했습니다.</p>
            <button onClick={() => setProfileRetry((count) => count + 1)} type="button">회원 정보 다시 불러오기</button>
          </div>
        ) : null}
        {profileIsCurrent && profileState.kind === "ready" ? <ProfileForm email={user.email} onSave={saveProfile} profile={profileState.data} /> : null}
      </section>

      <section aria-labelledby="orders-heading">
        <h2 id="orders-heading">주문 내역</h2>
        {!orderIsCurrent ? <p role="status">주문 내역을 불러오는 중입니다.</p> : null}
        {orderIsCurrent && orderState.kind === "error" ? (
          <div aria-label="주문 내역 오류" role="alert">
            <p>주문 내역을 불러오지 못했습니다.</p>
            <button onClick={() => setOrderRetry((count) => count + 1)} type="button">주문 내역 다시 불러오기</button>
          </div>
        ) : null}
        {orderIsCurrent && orderState.kind === "ready" ? <OrderHistory orders={orderState.data} /> : null}
      </section>
    </main>
  );
}
