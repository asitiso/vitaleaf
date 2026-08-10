# 바이탈리프 스토어 운영 가이드

바이탈리프는 Firebase Firestore의 상품을 공개하고, 승인된 리뷰만 보여 주는 한국어 건강기능식품 스토어입니다. 관리자 화면에서는 Firebase 이메일/비밀번호 인증과 `admins/{uid}` 문서를 모두 확인한 뒤 상품을 관리합니다.

현재 결제는 화면 흐름을 확인하기 위한 모의 처리이며 주문을 저장하거나 실제 결제를 승인하지 않습니다. 실제 판매를 시작하기 전에 아래의 PG 교체와 주문 저장 작업이 반드시 필요합니다.

## 1. 준비와 로컬 실행

필수 항목은 Node.js `22.13.0` 이상, Firebase 프로젝트의 웹 앱, Cloud Firestore 데이터베이스입니다. 저장소의 `.env.example`은 제공된 Firebase 프로젝트 `todaysell-d4bbc`의 웹 클라이언트 설정을 담고 있습니다. 다른 Firebase 프로젝트를 쓸 때는 아래 값을 한 프로젝트의 웹 앱 설정으로 모두 교체하고 서로 다른 프로젝트 값을 섞지 마세요.

`.env.example`을 `.env.local`로 복사한 뒤 다음 환경 변수 이름을 그대로 사용합니다.

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

`NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`는 Analytics를 사용하지 않으면 비워 둘 수 있습니다. `NEXT_PUBLIC_SITE_URL`은 프록시 호스트 정보를 받을 수 없는 환경에서 소셜 미리보기의 절대 URL을 만드는 예비 값이며, 운영 배포에서는 실제 HTTPS 주소로 바꿉니다. `NEXT_PUBLIC_*` 값은 브라우저에 공개되는 설정입니다. 서비스 계정 JSON, Admin SDK 비공개 키, PG 비밀 키, 사용자 비밀번호는 저장소나 `.env.local`에 넣지 마세요.

기본 명령은 다음과 같습니다.

```bash
npm install
npm run dev
npm test
npm run lint
npm run build
```

`npm run dev`가 출력한 로컬 주소에서 스토어를 확인합니다. 배포 전에는 `npm test`, `npm run lint`, `npm run build`를 모두 통과시켜야 합니다.

`npm test`에는 Firestore 규칙 테스트도 포함되므로 Firestore Emulator가 실행 중이어야 합니다. 가장 간단하고 운영 데이터와 분리된 실행 방법은 아래의 전체 직렬 테스트 명령입니다.

### Firestore 규칙 테스트

`firestore.rules.test.ts`는 실제 프로젝트가 아닌 `demo-vitaleaf-rules-test` 프로젝트 ID와 매 테스트 초기화되는 로컬 Firestore Emulator만 사용합니다. 운영 데이터나 운영 자격 증명을 읽지 않습니다. 아래에서 고정한 Firebase CLI `15.26.0` 기준으로 규칙 테스트에는 Java JDK 21 이상이 필요합니다.

저장소에 `firebase.json`이 없다는 CLI 경고가 표시될 수 있지만, 테스트 초기화가 `firestore.rules`를 에뮬레이터에 직접 로드한 뒤에만 검증을 시작합니다. 이 방식은 운영 프로젝트나 규칙에 연결하지 않습니다.

집중 규칙 테스트:

```bash
npx firebase-tools@15.26.0 emulators:exec --only firestore --project demo-vitaleaf-rules-test "npm test -- firestore.rules.test.ts --maxWorkers=1 --no-file-parallelism"
```

규칙을 포함한 전체 테스트를 직렬 실행하려면 다음 명령을 사용합니다.

```bash
npx firebase-tools@15.26.0 emulators:exec --only firestore --project demo-vitaleaf-rules-test "npm test -- --maxWorkers=1 --no-file-parallelism"
```

## 2. Firebase 초기 설정

### 이메일/비밀번호 로그인 켜기

1. Firebase Console에서 해당 프로젝트를 엽니다.
2. **Authentication → 시작하기 → Sign-in method**로 이동합니다.
3. **이메일/비밀번호** 제공업체를 선택해 사용 설정하고 저장합니다. 이메일 링크 로그인은 이 앱에 필요하지 않습니다.
4. **Authentication → Users → 사용자 추가**에서 운영자 이메일과 임시 비밀번호로 계정을 만듭니다.
5. 생성된 사용자의 UID를 복사합니다. 이메일 주소가 아니라 UID를 다음 단계의 문서 ID로 사용합니다.

운영자는 처음 로그인한 뒤 비밀번호를 안전하게 변경하고 계정을 공유하지 않는 것이 좋습니다.

### 관리자 UID 문서 만들기

Firebase Console의 **Firestore Database → Data**에서 다음 문서를 직접 만듭니다.

- 컬렉션: `admins`
- 문서 ID: Authentication에서 복사한 운영자 UID와 완전히 같은 값
- 필드: `role` (string) = `admin`

오타가 나면 관리자로 로그인할 수 없으므로 UID를 입력하지 말고 복사해 붙여 넣은 뒤 다시 비교하세요. 필요한 운영자만 한 명씩 추가하고, 퇴사하거나 권한이 끝난 운영자의 Authentication 계정과 `admins/{uid}` 문서를 즉시 제거합니다.

클라이언트가 스스로 관리자 문서를 만들 수 있게 하면 권한 상승 취약점이 됩니다. 제공된 `firestore.rules`는 `admins`의 모든 클라이언트 쓰기를 거부하므로 Firebase Console 또는 별도의 신뢰할 수 있는 서버용 Admin SDK에서만 이 문서를 관리합니다. 서비스 계정 키를 브라우저 코드에 넣지 마세요.

### Firestore 규칙 게시

이 저장소는 운영 Firebase 프로젝트를 자동 선택하는 `firebase.json`/`.firebaserc`를 제공하지 않습니다. 프로젝트 혼동을 막기 위해 다음 Console 절차를 기본으로 사용합니다.

1. Firebase Console에서 환경 변수의 `NEXT_PUBLIC_FIREBASE_PROJECT_ID`와 같은 프로젝트인지 확인합니다.
2. **Firestore Database → Rules**를 엽니다.
3. 저장소의 `firestore.rules` 전체를 붙여 넣습니다.
4. **Publish**를 누른 뒤 규칙 게시 이력과 시간을 확인합니다.
5. 로그아웃 상태에서 상품 조회, 일반 사용자 상품 쓰기 거부, 관리자 상품 저장을 각각 확인합니다.

나중에 해당 프로젝트에 연결된 `firebase.json`과 `.firebaserc`를 명시적으로 만든 경우에만 `npx firebase-tools@15.26.0 deploy --only firestore:rules`를 사용할 수 있습니다. 설정 파일이 없거나 현재 프로젝트가 확실하지 않으면 CLI 배포를 실행하지 마세요.

제공 규칙의 경계는 다음과 같습니다.

- `products`: 누구나 문서와 목록을 읽을 수 있지만, `admins/{uid}` 문서가 존재하고 그 문서의 문자열 필드가 `role: "admin"`인 로그인 사용자만 생성·수정·삭제할 수 있습니다.
- `reviews`: `approved == true`인 문서만 읽을 수 있습니다. 조회 쿼리에도 `approved == true` 조건이 있어야 하며 모든 클라이언트 쓰기는 거부됩니다.
- `admins`: 로그인 사용자는 자기 UID 경로만 읽을 수 있고 모든 클라이언트 쓰기는 거부됩니다.
- `orders`: 현재 릴리스에서는 모든 읽기와 쓰기가 거부됩니다.
- 그 밖의 컬렉션과 하위 컬렉션: 기본 거부됩니다.

## 3. 상품 CSV 운영

관리자 화면의 **CSV 양식 다운로드**로 `public/products-template.csv`와 같은 헤더를 받은 뒤 작업하세요. CSV는 쉼표로 열을 구분합니다. 쉼표, 큰따옴표 또는 줄바꿈이 들어간 셀은 CSV 큰따옴표 규칙에 맞게 저장해야 합니다.

| 열 | 필수 | 형식과 의미 |
| --- | --- | --- |
| `name` | 필수 | 상품명. 빈 값 불가 |
| `slug` | 선택 | URL 등에 쓸 영문 식별자 |
| `category` | 필수 | 상품 카테고리. 빈 값 불가 |
| `concerns` | 선택 | 건강 고민 목록 |
| `price` | 필수 | 0 이상의 숫자인 판매가 |
| `originalPrice` | 선택 | 빈 값 또는 0 이상의 숫자인 정상가 |
| `thumbnailUrl` | 선택 | 목록 대표 이미지의 HTTPS URL |
| `images` | 선택 | 상세 이미지 URL 목록 |
| `description` | 선택 | 상품 설명 |
| `benefits` | 선택 | 주요 효능·특징 목록 |
| `ingredients` | 선택 | `[{"name":"EPA","amount":"900 mg","dailyValue":"-"}]` 형태의 JSON 배열. 각 항목에 문자열 `name`, `amount`, `dailyValue` 필요 |
| `dosage` | 선택 | 섭취 방법 |
| `origin` | 선택 | 원산지 |
| `certifications` | 선택 | 인증 목록 |
| `cautions` | 선택 | 주의사항 목록 |
| `stock` | 필수 | 0 이상의 정수인 재고 |
| `isBest` | 선택 | `true` 또는 `false`; 빈 값은 `false` |
| `isNew` | 선택 | `true` 또는 `false`; 빈 값은 `false` |
| `salesRank` | 선택 | 빈 값 또는 0 이상의 숫자인 판매 순위 |
| `ratingAverage` | 선택 | 0~5 숫자; 빈 값은 0 |
| `reviewCount` | 선택 | 0 이상의 정수; 빈 값은 0 |

`concerns`, `images`, `benefits`, `certifications`, `cautions` 같은 배열 셀은 파이프 `|`로 항목을 구분합니다. 항목 자체의 파이프는 `\|`, 역슬래시는 `\\`로 입력합니다.

가져오기는 다음 안전장치를 적용합니다.

- 한 파일에서 헤더를 제외한 유효 상품은 최대 400개입니다. 빈 행은 개수에서 제외됩니다.
- UTF-8을 사용합니다. Excel에서는 **CSV UTF-8(쉼표로 분리)** 형식으로 저장하세요. 내보내기 파일은 Excel 한글 호환을 위해 UTF-8 BOM으로 시작하며, 가져오기는 BOM 유무를 모두 처리합니다.
- 알 수 없는 헤더, 중복 헤더, 필수 헤더 누락, 열 개수 불일치, 잘못된 큰따옴표, 음수·범위 밖 숫자, 잘못된 불리언이나 원료 JSON을 행·필드별로 표시합니다.
- 오류가 하나라도 있으면 미리보기와 모든 쓰기를 막습니다. 오류가 없는 경우에도 유효 행 수를 먼저 보여 주고 운영자가 확인 버튼을 눌러야 등록합니다.
- 확인 후 여러 문서 저장은 원자적 배치가 아닙니다. 네트워크 오류가 나면 일부 상품만 저장됐을 수 있으므로 상품 목록 또는 CSV 내보내기로 결과를 확인한 뒤 누락분만 다시 처리하세요.
- Firestore 문서 ID와 `createdAt`/`updatedAt`은 CSV에 포함하지 않습니다. 새 문서 ID와 서버 타임스탬프는 저장 시 생성됩니다.

## 4. 상품 이미지 URL

이 릴리스에는 이미지 업로드 기능이 없으며 `thumbnailUrl`과 `images`에 URL만 저장합니다.

- 브라우저에서 로그인 없이 열리는 절대 `https://` 파일 URL을 사용하세요. 로컬 경로, `file://`, 만료되는 임시 서명 URL은 사용하지 않습니다.
- 운영자가 관리하는 Firebase Storage 공개 파일 또는 신뢰할 수 있는 이미지 CDN처럼 주소가 안정적인 호스팅을 권장합니다.
- 외부 사이트의 이미지를 무단 핫링크하지 말고, 파일 교체 시 기존 URL이 깨지지 않도록 관리하세요.
- WebP/JPEG 등 웹용으로 최적화하고 목록 썸네일과 상세 이미지의 비율을 일관되게 유지합니다. 등록 후 데스크톱과 모바일에서 깨진 이미지가 없는지 확인하세요.

## 5. 실제 PG 연동 시 교체 지점

정확한 교체 지점은 `lib/payment/process-payment.ts`의 `processPayment(orderDraft)` 함수입니다. 현재 함수는 `VL-날짜-임의문자` 주문번호와 수신 시각만 반환하며 PG 승인, 금액 검증, 주문 저장, 재고 차감, 영수증 발행을 하지 않습니다. 또한 `firestore.rules`는 `orders`의 모든 클라이언트 접근을 거부합니다.

실제 연동에서는 이 함수의 호출 경계를 유지하되, 비밀 키를 보관하는 서버 API에서 주문 금액을 다시 계산하고 PG 승인과 주문 저장을 처리하도록 바꾸세요. 브라우저가 보낸 합계나 성공 응답만 신뢰하면 안 됩니다. PG 웹훅의 서명 검증, 중복 승인 방지, 실패·취소·환불 상태와 재고 처리까지 검증하기 전에는 실제 결제를 받지 마세요.

## 6. 출시 전 체크리스트

### 코드에 완료되어 있는 항목

- [x] Firestore 상품 공개 조회와 관리자 상품 생성·수정·삭제
- [x] `approved == true` 리뷰만 조회하는 저장소와 보안 규칙
- [x] Firebase 이메일/비밀번호 로그인과 `admins/{uid}` 관리자 확인
- [x] 개별 상품 관리, 검증 후 CSV 가져오기, BOM CSV 내보내기
- [x] 장바구니와 모의 주문 완료 화면
- [x] 기본 거부 Firestore 규칙과 로컬 Emulator 계약 테스트

### 운영자가 Firebase Console에서 직접 완료할 항목

- [ ] 올바른 Firebase 웹 앱 값으로 `.env.local` 작성
- [ ] Cloud Firestore 데이터베이스 생성 및 운영 상품 등록
- [ ] Authentication 이메일/비밀번호 제공업체 사용 설정
- [ ] 운영자 Auth 사용자 생성 후 같은 UID의 `admins/{uid}`와 `role: "admin"` 생성
- [ ] `firestore.rules`를 올바른 Firebase 프로젝트에 게시하고 비관리자 거부 동작 확인
- [ ] 모든 상품 이미지 URL의 공개 접근, 모바일 표시, 지속성을 확인
- [ ] 배포 도메인이 Firebase Authentication의 승인된 도메인인지 확인
- [ ] `npm test`, `npm run lint`, `npm run build` 통과 확인

### 실제 판매 전에 별도로 구현할 항목

- [ ] `processPayment(orderDraft)`를 서버 기반 실제 PG 승인으로 교체
- [ ] 서버 측 가격 재계산, 주문 영속화, 재고 차감, 웹훅 검증, 취소·환불 운영 구현
- [ ] 개인정보 처리방침, 이용약관, 배송·교환·환불 정책과 고객지원 절차 점검

모의 결제와 주문 미저장 상태는 코드 오류가 아니라 현재 범위의 의도된 제한입니다. 위 실제 판매 항목을 완료하기 전에는 이 화면으로 고객 결제를 받지 마세요.
