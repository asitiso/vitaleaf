# 바이탈리프 스토어 운영 가이드

바이탈리프는 Firebase Firestore의 공개 상품과 승인된 리뷰를 보여 주는 한국어 건강기능식품 스토어입니다. 관리자 화면은 Firebase 이메일/비밀번호 인증과 `admins/{uid}.role == "admin"`을 모두 확인한 뒤 상품 초안, 이미지, 공개 상품을 관리합니다.

현재 결제는 화면 흐름을 확인하기 위한 모의 처리입니다. 실제 PG 승인, 주문 저장, 재고 차감, 영수증 발행은 구현되어 있지 않으므로 실제 판매에 사용하면 안 됩니다.

## 운영자 필수 체크리스트 (8개)

1. **Firebase Storage 사용 설정:** Firebase Console에서 환경 변수와 같은 프로젝트를 선택하고 **Storage → 시작하기**로 기본 버킷을 만듭니다. Storage가 꺼져 있으면 관리자 이미지 업로드가 실패합니다.
2. **두 규칙 게시:** `NEXT_PUBLIC_FIREBASE_PROJECT_ID`와 Console 프로젝트 ID를 다시 확인한 뒤에만 `firestore.rules`와 `storage.rules`를 각각 게시합니다. 프로젝트 ID가 불확실하면 CLI 배포를 실행하지 않습니다.
3. **관리자 계정 생성:** Authentication에 이메일/비밀번호 사용자를 만들고, 그 사용자의 UID와 같은 문서 ID로 `admins/{uid}`를 만든 뒤 문자열 필드 `role: "admin"`을 저장합니다.
4. **초안 → 미리보기 → 공개 → 판매중지:** 새 상품과 수정 상품은 `productDrafts`에 자동 저장하고 관리자 미리보기로 확인합니다. 공개하면 `products`에 반영되고 초안은 정리됩니다. 판매중지는 공개본을 다시 초안으로 보존한 뒤 고객 목록에서 제거합니다.
5. **업로드 제한과 고아 이미지 정리:** JPEG, PNG, WebP만 파일당 10 MiB 이하로 업로드합니다. 업로드 직후 URL 확인이 실패하거나 그 단계에서 취소되면 앱이 방금 올린 파일 삭제를 최선 노력으로 시도합니다. 마법사에서 이미지를 빼거나 초안·상품을 삭제할 때는 공유 중인 공개 이미지를 보호하기 위해 브라우저가 Storage 파일을 삭제하지 않습니다. 미참조 파일 정리는 아래의 보수적인 운영 절차를 따릅니다.
6. **CSV는 초안으로 가져오기:** CSV 검증을 통과한 행도 즉시 판매 공개되지 않고 각각 `productDrafts`에 임시 저장됩니다. **임시 저장** 탭에서 검토·보완한 뒤 개별 공개합니다.
7. **PG와 주문 영속화는 제외:** `processPayment(orderDraft)`는 모의 주문번호만 반환하며 `orders` 읽기·쓰기는 규칙에서 거부됩니다. 실제 판매 전에 서버 기반 PG 승인과 주문·재고 저장을 별도로 구현해야 합니다.
8. **에뮬레이터 버전 고정:** 규칙 포함 전체 테스트는 Firebase CLI `15.26.0`과 JDK 21 이상으로 Firestore·Storage Emulator를 함께 실행합니다.

## 1. 환경 변수와 로컬 실행

Node.js `22.13.0` 이상이 필요합니다. `.env.example`을 `.env.local`로 복사하고 한 Firebase 웹 앱의 값만 입력합니다.

```dotenv
NEXT_PUBLIC_FIREBASE_API_KEY=YOUR_WEB_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=YOUR_PROJECT.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=YOUR_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=YOUR_PROJECT.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=YOUR_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID=YOUR_WEB_APP_ID
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=YOUR_MEASUREMENT_ID
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

`NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`는 Analytics를 쓰지 않으면 비워 둘 수 있습니다. 운영 배포에서는 `NEXT_PUBLIC_SITE_URL`을 실제 HTTPS 주소로 바꿉니다. `NEXT_PUBLIC_*`는 브라우저에 공개되는 웹 앱 설정이므로 서비스 계정 JSON, Admin SDK 비공개 키, PG 비밀 키, 사용자 비밀번호를 넣지 마세요.

```bash
npm install
npm run dev
npm run lint
npm run build
```

## 2. Firebase 초기 설정과 규칙 게시

### Authentication과 관리자 권한

1. **Authentication → Sign-in method**에서 이메일/비밀번호 제공업체를 사용 설정합니다.
2. **Authentication → Users → 사용자 추가**에서 운영자 계정을 만들고 UID를 복사합니다.
3. **Firestore Database → Data**에서 컬렉션 `admins`, 문서 ID `{복사한 UID}`, 문자열 필드 `role = admin`을 만듭니다.
4. 운영자는 첫 로그인 뒤 비밀번호를 바꾸고 계정을 공유하지 않습니다. 권한이 끝난 운영자는 Auth 사용자와 `admins/{uid}`를 함께 제거합니다.

클라이언트가 관리자 문서를 만들 수 있게 하면 권한 상승 취약점이 됩니다. `firestore.rules`는 `admins`의 클라이언트 쓰기를 거부하므로 Console 또는 신뢰할 수 있는 서버용 Admin SDK에서만 관리합니다.

### Storage 사용 설정

Firebase Console의 **Storage → 시작하기**에서 환경 변수와 같은 프로젝트의 기본 버킷을 만듭니다. `.env.local`의 `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`이 Console 버킷 이름과 같은지 확인합니다. 관리자 화면은 `products/{productId}/{생성된 파일명}` 아래에만 이미지를 저장합니다.

### Firestore와 Storage 규칙 게시

운영 프로젝트를 자동 선택하는 `.firebaserc`를 저장소에 두지 않습니다. 다음 순서로 프로젝트 혼동을 막습니다.

1. `.env.local`의 `NEXT_PUBLIC_FIREBASE_PROJECT_ID`와 Firebase Console 상단 프로젝트 ID가 완전히 같은지 확인합니다.
2. **Firestore Database → Rules**에 `firestore.rules` 전체를 붙여 넣고 게시합니다.
3. **Storage → Rules**에 `storage.rules` 전체를 붙여 넣고 게시합니다.
4. 게시 이력과 시간을 기록하고, 로그아웃·일반 사용자·`role: "admin"` 사용자의 허용/거부 동작을 확인합니다.

명시적으로 올바른 프로젝트에 연결한 환경에서만 다음과 같은 CLI 게시를 사용할 수 있습니다. `YOUR_PROJECT_ID`를 확인하지 못했다면 실행하지 마세요.

```bash
npx firebase-tools@15.26.0 deploy --only firestore:rules,storage --project YOUR_PROJECT_ID
```

규칙 경계는 다음과 같습니다.

- `products`: 공개 읽기, 명시적 관리자만 쓰기
- `productDrafts`: 명시적 관리자만 읽기·쓰기
- `reviews`: `approved == true`인 문서만 읽기, 모든 클라이언트 쓰기 거부
- `admins`: 로그인 사용자의 자기 문서 읽기만 허용, 모든 클라이언트 쓰기 거부
- `orders`와 그 밖의 경로: 기본 거부
- Storage `products/{productId}/**`: 관리자만 쓰기, 10 MiB 이하 JPEG/PNG/WebP만 허용

## 3. 상품 운영 흐름

1. **상품 등록**에서 4단계(기본 정보 → 상품 이미지 → 상세 정보 → 판매 설정)를 작성합니다.
2. 변경 후 약 1.2초 뒤 자동 저장 상태가 `저장됨`으로 바뀌는지 확인합니다. 실패하면 입력을 유지한 채 다시 저장합니다.
3. **미리 보기**에서 실제 상품 상세 레이아웃과 비활성 구매 버튼을 확인합니다.
4. 필수 정보와 이미지가 모두 유효할 때 **판매 공개**합니다. 공개 성공 전에는 고객 화면에 새 상품이 보이지 않습니다.
5. 공개 상품을 편집하는 동안 기존 공개본은 계속 고객에게 보이며, 수정 초안을 다시 공개할 때만 교체됩니다.
6. **판매중지**는 확인 대화상자 뒤 공개 문서를 초안으로 보존하고 `products`에서 제거합니다. 다시 공개하려면 임시 저장 탭에서 검토합니다.

상품 복제는 리뷰·평점·판매순위를 복사하지 않고 `상품명 (복사본)`, 재고 0의 초안을 만듭니다. 공개 상품을 편집하거나 복제한 초안은 기존 Storage 경로를 공유할 수 있으므로, 초안에서 이미지를 제거하거나 초안·상품 문서를 삭제해도 브라우저는 실제 파일을 삭제하지 않습니다.

## 4. 이미지 업로드와 정리

- 허용 형식: JPEG (`image/jpeg`), PNG (`image/png`), WebP (`image/webp`)
- 최대 크기: 파일당 10 MiB
- 저장 경로: `products/{productId}/{앱이 생성한 UUID 파일명}`
- 첫 성공 이미지가 대표 이미지가 되며, 순서 변경·대표 지정·대체텍스트·초안 참조 제거를 지원합니다. 대표 이미지를 제거하면 다음 이미지가 대표가 됩니다.
- 업로드 실패는 작성 중인 초안을 지우지 않으며 파일별 재시도와 취소를 제공합니다.
- URL 확인 단계의 실패·취소는 업로드 파일 삭제를 시도합니다. 이 정리가 실패하면 같은 경로가 오류 정보에 남으므로 Storage Console에서 확인합니다.
- 마법사의 개별 제거는 현재 초안의 `media` 참조만 지웁니다. 새 초안·공개 상품 편집·복제 중 어느 경우에도 기존 Storage 객체를 브라우저에서 물리적으로 삭제하지 않습니다.
- 초안/상품 문서 삭제도 Storage 폴더를 자동 삭제하지 않습니다. 따라서 편집 중 제거한 신규 업로드 파일이 미참조 파일로 남을 수 있습니다.

Firestore 문서와 Storage 객체는 함께 원자적으로 삭제할 수 없고, 브라우저가 전체 컬렉션을 스캔해 참조 여부를 판정하는 방식은 경쟁 상태와 권한 범위 때문에 안전하지 않습니다. 참조를 인식하는 신뢰할 수 있는 백엔드/정기 운영 작업은 이번 클라이언트 범위에서 보류했습니다. 그 기능을 만들기 전에는 관리자가 충분한 보존 기간을 둔 스냅샷을 기준으로 `products`와 `productDrafts` 어디에서도 참조하지 않는 것이 확인된 파일만 수동 정리하고, 다른 문서가 참조하거나 판단이 불확실한 파일은 삭제하지 마세요.

## 5. CSV 일괄등록

관리자 화면의 **CSV 양식 다운로드**를 사용합니다. UTF-8(BOM 허용) CSV를 한 번에 최대 400개 유효 행까지 검증하며, 알 수 없는/중복/필수 누락 헤더, 열 개수, 따옴표, 숫자 범위, 불리언, 원료 JSON, 수식 주입 위험을 검사합니다. 오류가 하나라도 있으면 어떤 초안도 만들지 않습니다.

오류 없는 행을 확인하면 각 행을 새 문서 ID의 초안으로 저장합니다. 네트워크 오류 때는 일부 초안만 저장될 수 있으므로 결과 메시지와 **임시 저장** 탭을 확인하고 누락분만 다시 가져오세요. CSV 가져오기는 기존 공개 상품을 덮어쓰거나 자동 공개하지 않습니다.

`concerns`, `images`, `benefits`, `certifications`, `cautions`는 `|`로 구분합니다. 값 안의 파이프는 `\|`, 역슬래시는 `\\`로 입력합니다. `ingredients`는 다음 형태의 JSON 배열입니다.

```json
[{"name":"EPA","amount":"900 mg","dailyValue":"-"}]
```

## 6. 에뮬레이터와 전체 검증

JDK 21 이상과 Firebase CLI `15.26.0`을 사용합니다. 테스트 프로젝트 ID `demo-vitaleaf-rules-test`는 운영 데이터나 운영 자격 증명과 분리된 로컬 Emulator 전용 ID입니다.

전체 애플리케이션·Firestore·Storage 규칙 테스트를 직렬 실행합니다.

```bash
npx firebase-tools@15.26.0 emulators:exec --only firestore,storage --project demo-vitaleaf-rules-test "npm test -- --maxWorkers=1 --no-file-parallelism"
```

규칙만 집중 확인할 때도 두 Emulator를 함께 사용합니다.

```bash
npx firebase-tools@15.26.0 emulators:exec --only firestore,storage --project demo-vitaleaf-rules-test "npm test -- firestore.rules.test.ts storage.rules.test.ts --maxWorkers=1 --no-file-parallelism"
```

출시 후보 커밋에서는 이어서 실행합니다.

```bash
npm run lint
npm run build
git diff --check
```

## 7. 실제 PG 연동 시 교체 지점

`lib/payment/process-payment.ts`의 `processPayment(orderDraft)`는 `VL-날짜-임의문자` 주문번호와 수신 시각만 반환합니다. PG 승인, 서버 금액 검증, 주문 저장, 재고 차감, 영수증, 취소·환불을 처리하지 않습니다.

실제 연동에서는 이 함수의 호출 경계를 유지하되 비밀 키를 보관하는 서버 API에서 금액을 다시 계산하고, PG 웹훅 서명과 중복 승인을 검증한 뒤 주문·재고를 원자적으로 저장해야 합니다. 이 작업과 개인정보·약관 검토가 끝나기 전에는 고객 결제를 받지 마세요.

## 8. 출시 전 수동 확인

- [ ] Firebase 프로젝트 ID, Storage 버킷, 웹 앱 환경 변수가 한 프로젝트의 값인지 확인
- [ ] Storage, 이메일/비밀번호 Auth, Firestore가 사용 설정되었는지 확인
- [ ] 운영자 Auth UID와 `admins/{uid}.role = admin`을 확인
- [ ] Firestore·Storage 규칙 게시 이력과 비관리자 거부를 확인
- [ ] 데스크톱 1440×900, 모바일 390×844에서 모든 메뉴·관리자 전체 흐름을 확인
- [ ] 정상/거부 이미지 업로드, 진행·재시도·대표 변경·키보드 순서 조정을 확인
- [ ] 공개·수정 초안·판매중지·복제·CSV 초안 흐름을 확인
- [ ] 한글 깨짐, 가로 스크롤, 저장 상태, 오류 포커스를 확인
- [ ] `npm test`, `npm run lint`, `npm run build`, 규칙 Emulator 테스트를 통과
- [ ] 기존 Sites 프로젝트와 owner-only 비공개 접근을 유지하고 공개 전환하지 않았는지 확인

브라우저 전체 흐름과 실제 Firebase 게시·비공개 Sites 새 버전 저장은 올바른 계정과 프로젝트를 확인할 수 있는 운영자가 수행합니다.
