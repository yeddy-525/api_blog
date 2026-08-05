# 네이버 검색광고 API → GPT Action 연결

이 프로젝트는 GPT가 네이버 검색광고 `/keywordstool`을 안전하게 조회할 수 있도록 중간 서버 역할을 합니다.

## 구조

GPT Action  
→ Vercel API `/api/keywords`  
→ 요청마다 HMAC-SHA256 서명 생성  
→ 네이버 검색광고 API  
→ 키워드 검색량·연관 키워드 반환

네이버 API License, Secret Key, Customer ID는 GPT에 넣지 않고 Vercel 환경변수에만 저장합니다.

## 1. 배포

### 가장 쉬운 방법
1. 이 폴더 전체를 새 GitHub 저장소에 업로드합니다.
2. Vercel에서 `Add New → Project`를 누릅니다.
3. 방금 만든 GitHub 저장소를 가져옵니다.
4. Framework Preset은 `Other`로 둡니다.
5. 환경변수 4개를 등록합니다.

- `NAVER_API_KEY`
- `NAVER_SECRET_KEY`
- `NAVER_CUSTOMER_ID`
- `ACTION_API_KEY`

`ACTION_API_KEY`는 네이버에서 받은 값이 아니라 직접 만드는 별도 비밀번호입니다. 영문·숫자·특수문자를 섞어 32자 이상으로 만드세요.

6. Deploy를 누릅니다.

## 2. 서버 상태 확인

배포 주소 뒤에 `/api/health`를 붙여 접속합니다.

예:
`https://프로젝트명.vercel.app/api/health`

`configured: true`가 나오면 환경변수 등록이 끝난 상태입니다.

## 3. 직접 테스트

터미널 또는 API 테스트 도구에서 아래처럼 호출합니다.

```bash
curl -X POST "https://프로젝트명.vercel.app/api/keywords"   -H "Content-Type: application/json"   -H "X-Action-Key: 직접만든_ACTION_API_KEY"   -d '{"seeds":["결혼식 계절","가을 결혼식","9월 결혼식"],"limit":20}'
```

## 4. GPT Action 등록

1. GPT 편집 화면에서 `구성 → 작업(Actions) → 새 작업 만들기`로 이동합니다.
2. 인증은 `API 키`를 선택합니다.
3. 인증 방식은 `사용자 지정 헤더`를 선택합니다.
4. 헤더 이름은 `X-Action-Key`로 입력합니다.
5. 값에는 Vercel의 `ACTION_API_KEY`와 똑같은 값을 입력합니다.
6. `openapi.yaml`을 열고 `YOUR-VERCEL-PROJECT`를 실제 Vercel 프로젝트 주소로 바꿉니다.
7. 수정한 OpenAPI 스키마를 GPT Action 스키마 칸에 붙여 넣습니다.
8. `researchNaverKeywords` 테스트를 실행합니다.

## 5. 개인정보처리방침

GPT를 링크 공개 또는 GPT Store에 공개할 경우 Action에 유효한 개인정보처리방침 URL이 필요할 수 있습니다.

배포 후 아래 주소를 사용할 수 있습니다.

`https://프로젝트명.vercel.app/privacy.html`

공개 전에 `public/privacy.html`의 문의 연락처를 수정하세요.

## 데이터 해석 주의

- 검색량이 `< 10`으로 오면 정확한 수치가 아닙니다.
- API가 반환하는 `compIdx`는 검색광고 경쟁도입니다.
- 이를 네이버 블로그 문서 경쟁도나 상위노출 난이도로 표현하면 안 됩니다.
- 이 API만으로 네이버 블로그 상위 글 본문이나 VIEW 순위를 분석할 수 없습니다.
