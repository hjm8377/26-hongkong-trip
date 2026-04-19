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
DAY1(5/1 금): 공항 도착 16:30 → A22 버스 → 체크인 18:30 → 홍함 저녁(Tim Ho Wan 딤섬/완탕면) → 심포니 오브 라이츠 20:00
DAY2(5/2 토): 홍콩 디즈니랜드 10:00~20:00 (MTR Hung Hom→Sunny Bay→Disneyland Resort)
DAY3(5/3 일): Ngong Ping 케이블카 → 천단대불 → 포린수도원 채식 점심 → CityGate Outlets 쇼핑 → 침사추이 저녁 → TST 야경
DAY4(5/4 월): 동생 수업 09:30-11:00 / 15:30-17:00 (숙소) / 빅토리아 피크(피크 트램) → 침사추이 쇼핑 → 템플 스트리트 야시장 19:00
DAY5(5/5 화): 06:15 호텔 출발 → 공항 07:15 → CX410 09:20 출발

주요 맛집
- 홍함: Tim Ho Wan(딤섬/미슐랭1스타), 완탕면집, Mido Cafe(밀크티)
- 침사추이: Lung Dim Sum, Cheung Hing Kee(미슐랭빕구르망), Hutong(야경뷰)
- 디즈니랜드: Crystal Lotus(캐릭터딤섬/예약필수), Tahitian Terrace
- 란타우: 포린수도원 채식식당(13시 전 방문), CityGate Food Court
- 빅토리아 피크: The Peak Lookout, Petit Jardin
- 센트럴: Mak's Noodles, Tsim Chai Kee, Lan Fong Yuen(밀크티 원조)
- 템플스트리트: Wing Fat Seafood, 에그와플, 클레이팟라이스

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

      // Workers AI 응답 형식: { response: "..." } 또는 { result: { response: "..." } }
      const reply = result?.response ?? result?.result?.response ?? '';
      if (!reply) {
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
