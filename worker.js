/**
 * 홍콩 가족여행 AI 채팅 프록시 (Cloudflare Workers AI)
 *
 * 브라우저 → 이 Worker → Gemma 4 26B A4B (Cloudflare Workers AI)
 * API 키는 env.AI 바인딩으로 자동 주입되며 클라이언트에 절대 노출되지 않습니다.
 *
 * 배포 방법은 DEPLOY.md 참고.
 */

// 이 Worker를 호출할 수 있는 도메인 화이트리스트.
// 다른 사이트에서 호출하면 403으로 거부 → 무료 한도 도용 방지.
const ALLOWED_ORIGINS = [
  'https://hjm8377.github.io',                       // GitHub Pages (현재)
  'https://hongkong-trip-81ee2.web.app',             // Firebase Hosting (이전 예정)
  'https://hongkong-trip-81ee2.firebaseapp.com',     // Firebase Hosting 별칭
  'http://localhost',                                 // 로컬 테스트 (포트 무관)
  'http://127.0.0.1',                                 // 로컬 테스트
];

// 사용할 모델 (Cloudflare Workers AI 모델 ID)
const MODEL = '@cf/google/gemma-4-26b-a4b-it';

// 홍콩 여행 시스템 프롬프트
const SYSTEM_PROMPT = `당신은 홍콩 가족여행 전용 도우미입니다. 아래 여행 정보를 바탕으로 질문에 간결하게 답하세요. 모르는 것은 솔직히 말해주세요. 한국어로 답하세요.

여행 정보
- 기간: 2026년 5월 1일(금) ~ 5월 5일(화)
- 숙소: Royal Peninsula Hotel, 8 Hung Lai Rd, Hung Hom
- 항공: CX439 인천13:40→홍콩16:30 / CX410 홍콩09:20→인천13:55
- 통화: HKD (약 1 HKD = 170 KRW)
- 교통: 옥토퍼스 카드, MTR, 공항버스 A22 (공항↔홍함 HKD33, 약60분)

일정 요약
DAY1(5/1 금) 도착의 날: 16:30 홍콩 도착(CX439) → 17:30 공항버스 A22 → 18:30 호텔 체크인 → 19:30 침사추이 저녁(Cheung Hing Kee 미슐랭 빕구르망) → 21:00 1881 Heritage + 워터프론트 야경 → 22:00 호텔
DAY2(5/2 토) 디즈니랜드: 09:00 MTR 출발 → 10:00~20:00 홍콩 디즈니랜드 → 20:30 호텔 복귀
DAY3(5/3 일) 센트럴 미식·하버 야경: 11:00 호텔 브런치 → 13:00 Mak's Noodles 점심(센트럴) → 14:30 미드레벨 에스컬레이터·소호 → 16:30 Lan Fong Yuen 차 타임 → 17:30 Star Ferry 노을 페리 → 18:30 Avenue of Stars 야경 → 19:30 침사추이 저녁(Lung Dim Sum) → 21:00 호텔
DAY4(5/4 월) 수업+템플 야시장: 08:30 호텔 조식 → 09:30-11:00 동생 수업(숙소) → 11:30 홍함 차찬텡 점심 → 13:00 호텔 휴식 → 15:30-17:00 동생 수업(숙소) → 18:00 야우마테이 이른 저녁(Mido Cafe) → 19:00 템플 스트리트 야시장 → 21:30 호텔
DAY5(5/5 화) 귀국: 05:30 기상 → 06:15 호텔 출발 → 07:15 공항 → 09:20 CX410 출발 → 13:55 인천 도착(어린이날 🎉)

주요 맛집
- 침사추이(5/1 저녁, 5/3 저녁): Cheung Hing Kee(미슐랭빕구르망 완탕·군만두), Lung Dim Sum(모던 딤섬), Tim Ho Wan(미슐랭1스타 딤섬), Hutong(18층 야경 북경요리)
- 센트럴(5/3 점심·차): Mak's Noodles(1920년대 새우 완탕), Tsim Chai Kee(미슐랭 빕구르망), Kau Kee(우육면), Lan Fong Yuen(실크스타킹 밀크티 원조), Tai Cheong Bakery(에그타르트)
- 디즈니랜드(5/2): Crystal Lotus(캐릭터 딤섬/예약필수), Tahitian Terrace(폴리네시안), Main Street Bakery(미키 와플)
- 홍함(5/4 점심): 홍함 완탕면집, Mido Cafe(MTR 5분 야우마테이), Australia Dairy Company(스크램블에그 토스트)
- 야우마테이·템플 스트리트(5/4 저녁): Mido Cafe, 클레이팟 라이스, Wing Fat Seafood(다이파이동), 에그와플, Lantern Seafood(흑트러플 로스트구스)

긴급연락: 경찰/앰뷸런스 999, 소방서 998, 관광경찰 2527-7177`;

function isOriginAllowed(origin) {
  if (!origin) return false;
  return ALLOWED_ORIGINS.some((allowed) => origin === allowed || origin.startsWith(allowed + ':'));
}

function corsHeaders(origin) {
  const allow = isOriginAllowed(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function jsonResponse(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(origin),
    },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // 헬스체크
    if (request.method === 'GET') {
      return jsonResponse({ status: 'ok', model: MODEL }, 200, origin);
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405, origin);
    }

    // Origin 화이트리스트 검사 (외부 도용 방지)
    if (!isOriginAllowed(origin)) {
      return jsonResponse(
        { error: 'Forbidden origin', origin },
        403,
        origin,
      );
    }

    let payload;
    try {
      payload = await request.json();
    } catch (error) {
      return jsonResponse({ error: 'Invalid JSON body' }, 400, origin);
    }

    const userMessages = Array.isArray(payload?.messages) ? payload.messages : null;
    if (!userMessages || userMessages.length === 0) {
      return jsonResponse({ error: 'messages array required' }, 400, origin);
    }

    // 너무 긴 대화 컷오프 (남용 방지)
    const trimmed = userMessages.slice(-20).map((m) => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: String(m.content ?? '').slice(0, 4000),
    }));

    // Workers AI는 OpenAI 호환 messages 형식을 받습니다.
    const aiMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...trimmed,
    ];

    try {
      const result = await env.AI.run(MODEL, {
        messages: aiMessages,
        max_tokens: 1024,
        temperature: 0.7,
      });

      // Workers AI 응답 형식은 모델마다 다름. 여러 경로 시도.
      // - 일반: { response: "..." }
      // - 래핑: { result: { response: "..." } }
      // - OpenAI 호환: { choices: [{ message: { content: "..." } }] }
      // - Gemma 4: thinking 모드일 경우 output_text 또는 message.content
      const reply =
        result?.response ??
        result?.result?.response ??
        result?.choices?.[0]?.message?.content ??
        result?.message?.content ??
        result?.output_text ??
        result?.output?.[0]?.content?.[0]?.text ??
        '';

      if (!reply) {
        // 디버그: 어떤 모양으로 왔는지 클라이언트에서 볼 수 있게 함
        return jsonResponse(
          { error: 'Empty response from model', raw: result },
          502,
          origin,
        );
      }

      return jsonResponse({ reply, model: MODEL }, 200, origin);
    } catch (error) {
      return jsonResponse(
        { error: error?.message || 'Model invocation failed' },
        500,
        origin,
      );
    }
  },
};
