# Cloudflare Workers AI 배포 가이드

홍콩 여행 앱의 AI 채팅이 **Gemini API → Cloudflare Workers AI (Gemma 4)** 로 이전됐습니다.
이 가이드를 따라 한 번만 설정하면 끝나고, 그 뒤로는 코드를 안 건드려도 됩니다.

소요 시간: **약 10분**, 신용카드 불필요.

---

## 1단계 — Cloudflare 계정 만들기 (3분)

1. https://dash.cloudflare.com/sign-up 접속
2. 이메일 + 비밀번호로 가입 (이메일 인증 필요)
3. 로그인하면 대시보드가 보입니다

---

## 2단계 — Worker 만들기 (3분)

1. 대시보드 왼쪽 메뉴에서 **Workers & Pages** 클릭
2. **Create application** → **Create Worker** 클릭
3. Worker 이름을 정합니다. 예: `hongkong-ai`
   - 이 이름이 URL에 들어갑니다: `https://hongkong-ai.<당신의서브도메인>.workers.dev`
4. **Deploy** 클릭 (기본 Hello World 코드 그대로)
5. 배포 완료되면 **Edit code** 버튼 클릭

---

## 3단계 — Worker 코드 붙여넣기 (1분)

1. 이 저장소의 [`worker.js`](./worker.js) 파일 전체 내용을 복사
2. Cloudflare 코드 에디터의 기존 내용을 **모두 지우고** 붙여넣기
3. 우측 상단 **Save and deploy** 클릭

---

## 4단계 — AI 바인딩 추가 (2분) ⚠️ 중요

Worker가 Cloudflare AI를 호출할 수 있도록 권한(바인딩)을 줍니다.

1. Worker 페이지에서 상단 **Settings** 탭 클릭
2. 좌측 **Bindings** 메뉴 클릭
3. **Add binding** → **AI** 선택
4. Variable name 칸에 정확히 `AI` 입력 (대문자 두 글자)
5. **Save** 클릭

이걸 빼먹으면 호출할 때 `env.AI is undefined` 에러가 납니다.

---

## 5단계 — Worker URL을 index.html에 넣기 (1분)

1. Worker 메인 페이지에서 상단의 URL 복사
   - 예: `https://hongkong-ai.hjm8377.workers.dev`
2. `index.html` 파일을 열고 다음 줄을 찾으세요:
   ```javascript
   const AI_PROXY_URL = 'https://YOUR-WORKER-NAME.YOUR-SUBDOMAIN.workers.dev';
   ```
3. 따옴표 안 주소를 방금 복사한 URL로 교체:
   ```javascript
   const AI_PROXY_URL = 'https://hongkong-ai.hjm8377.workers.dev';
   ```
4. 저장 → git commit & push

---

## 6단계 — 동작 확인

1. 배포된 사이트(GitHub Pages 또는 Firebase) 접속
2. 🤖 AI 탭으로 이동
3. "3일차 일정 알려줘" 같은 질문 입력
4. 몇 초 안에 답변이 오면 성공 ✅

브라우저 DevTools(F12) → Network 탭을 보면 `workers.dev` URL로 호출이 가고,
**API 키는 어디에도 보이지 않습니다.** 끝!

---

## 도메인을 바꿨거나 추가해야 할 때

`worker.js` 상단의 `ALLOWED_ORIGINS` 배열에 도메인을 추가하고 다시 배포하세요.
현재 허용된 도메인:

- `https://hjm8377.github.io` (GitHub Pages)
- `https://hongkong-trip-81ee2.web.app` (Firebase)
- `https://hongkong-trip-81ee2.firebaseapp.com` (Firebase 별칭)
- `http://localhost`, `http://127.0.0.1` (로컬 테스트)

다른 도메인에서 호출하면 403 에러로 거부됩니다 → 무료 한도 도용 방지.

---

## 비용 / 한도

- **Workers 무료 플랜**: 일 100,000 요청
- **Workers AI 무료 한도**: 일 약 10,000 Neurons (Gemma 4 한 번 호출 ≈ 3~10 Neurons)
- 가족 여행용 챗봇 기준 **사실상 무제한**
- 한도 초과 시 자동 차단되며 과금되지 않음 (신용카드 미등록 상태이므로)

대시보드 → **Workers & Pages → 해당 Worker → Metrics** 에서 사용량 확인 가능.

---

## 모델 변경하고 싶을 때

`worker.js` 상단의 `MODEL` 상수만 바꾸면 됩니다.

| 모델 ID | 특징 |
|---|---|
| `@cf/google/gemma-4-26b-a4b-it` | 현재 사용 중. 한국어 OK, 균형형 |
| `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | 더 똑똑하지만 느릴 수 있음 |
| `@cf/qwen/qwen2.5-coder-32b-instruct` | 코딩·논리 강함 |

전체 모델 목록: https://developers.cloudflare.com/workers-ai/models/

---

## 문제 해결

**Q. 채팅에서 "AI_PROXY_URL이 설정되지 않았습니다" 에러**
→ 5단계의 URL 교체를 빠뜨렸습니다.

**Q. "Forbidden origin" 403 에러**
→ 사이트가 `ALLOWED_ORIGINS`에 없는 도메인에서 호출되고 있습니다.
   `worker.js` 화이트리스트에 추가하고 재배포하세요.

**Q. "env.AI is undefined" 에러**
→ 4단계 AI 바인딩을 빠뜨렸습니다. Variable name이 정확히 `AI`인지 확인.

**Q. 응답이 너무 느려요**
→ Cloudflare 첫 호출은 콜드스타트로 1~2초 걸립니다. 두 번째부터는 빠릅니다.
   계속 느리면 다른 모델(`llama-3.3-70b-fast`)로 바꿔보세요.
