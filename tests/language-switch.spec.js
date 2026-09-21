// 언어 전환 회귀 테스트.
//
// 고치기 전 동작: switchLanguage가 "사이트 전체 문장의 번역이 전부 끝날 때까지" await한 뒤에야
// 화면을 다시 그렸고, 그 번역은 문장 하나당 Gemini 호출 한 번이었다. 그래서 언어를 골라도
// 한참(혹은 할당량 초과로 영영) 아무 글자도 바뀌지 않았다.
//
// 여기서 지키려는 것:
//  1) 언어 버튼을 누르면 번역 응답을 기다리지 않고 화면이 즉시 새 언어 상태로 다시 그려진다.
//  2) 번역 요청은 문장마다가 아니라 묶음(배치)으로 나간다.
//  3) 번역이 도착하면 홈/탐색/커뮤니티 등 "지금 안 보고 있던 화면"까지 새 언어로 채워진다.
//  4) 고른 언어는 새로고침 후에도 유지된다.
const { test, expect, gotoApp } = require('./fixtures');

/**
 * 모듈 스크립트(실제 Firebase/Gemini)는 이 스위트에서 네트워크가 막혀 아예 실행되지 않으므로,
 * classic 스크립트가 호출하는 번역 훅만 가짜로 심어 "Gemini가 응답하는 상황"을 흉내낸다.
 * 일부러 지연을 줘서, 화면 갱신이 번역 완료를 기다리지 않는지(1번 요구사항) 확인할 수 있게 한다.
 */
async function stubGemini(page, { delayMs = 300 } = {}) {
  await page.addInitScript((delay) => {
    window.__aiBatchCalls = 0;
    window.__aiBatchTexts = 0;
    window.__aiTranslateBatch = async function (texts, sourceLang, targetLang) {
      window.__aiBatchCalls += 1;
      window.__aiBatchTexts += texts.length;
      await new Promise((r) => setTimeout(r, delay));
      return texts.map((t) => `[${targetLang}] ${t}`);
    };
    window.__aiTranslate = async function (text, sourceLang, targetLang) {
      return (await window.__aiTranslateBatch([text], sourceLang, targetLang))[0];
    };
  }, delayMs);
}

test.describe('언어 전환', () => {
  test('영어 버튼을 누르면 정적 문구가 즉시 바뀐다 (번역 응답을 기다리지 않음)', async ({ page }) => {
    await stubGemini(page, { delayMs: 3000 }); // 번역이 아주 느려도 화면은 먼저 바뀌어야 한다
    await gotoApp(page);

    await expect(page.locator('#nav-home')).toHaveText('홈');
    await page.click('.btn-lang:has-text("English")');

    // 3초짜리 가짜 번역이 끝나기 한참 전에 이미 영어로 바뀌어 있어야 한다.
    await expect(page.locator('#nav-home')).toHaveText('Home', { timeout: 800 });
    await expect(page.locator('#nav-community')).toHaveText('Community', { timeout: 800 });
  });

  test('번역이 필요한 언어도 화면이 먼저 그려지고, 요청은 묶음으로 나간다', async ({ page }) => {
    await stubGemini(page, { delayMs: 400 });
    await gotoApp(page);

    await page.click('.btn-lang:has-text("日本語")');

    // 번역 도착 전: 아직 일본어는 아니지만 화면은 이미 다시 그려진 상태 (버튼 활성 표시가 옮겨감)
    await expect(page.locator('.btn-lang:has-text("日本語")')).toHaveClass(/active/, { timeout: 500 });

    // 번역이 도착하면 정적 문구가 채워진다.
    await expect(page.locator('#nav-home')).toHaveText('[ja] 홈', { timeout: 15000 });

    const { calls, texts } = await page.evaluate(() => ({
      calls: window.__aiBatchCalls,
      texts: window.__aiBatchTexts,
    }));
    // 수백 개 문장을 번역하면서도 호출 수는 그 수십 분의 일이어야 한다
    // (예전에는 문장 수 = 호출 수였다).
    expect(texts).toBeGreaterThan(100);
    expect(calls).toBeLessThan(texts / 10);
  });

  test('지금 보고 있지 않던 화면(탐색 카드·커뮤니티)까지 같이 번역된다', async ({ page }) => {
    await stubGemini(page, { delayMs: 100 });
    await gotoApp(page);

    await page.click('.btn-lang:has-text("Français")');
    await expect(page.locator('#nav-home')).toHaveText('[fr] 홈', { timeout: 15000 });

    // 홈 화면의 탐색 카드(자기소개/전공은 t()로 캐시에서 읽는다)
    await expect(page.locator('#card-grid .student-card').first()).toContainText('[fr]', { timeout: 15000 });

    // 언어를 바꾼 시점에 열어보지도 않았던 커뮤니티 화면
    // (카테고리 이름처럼 7개 언어를 직접 적어둔 문구는 기계 번역을 타지 않으므로 여기선 대상이 아니다)
    await page.click('#nav-community');
    await expect(page.locator('[data-i18n="community_title"]')).toHaveText('[fr] 글로벌 학생 커뮤니티', { timeout: 15000 });
    // 게시글 본문은 TranslationService(원문 언어 → 현재 언어) 경로를 탄다.
    await expect(page.locator('.post-body').first()).toContainText('[fr]', { timeout: 15000 });
  });

  test('고른 언어가 새로고침 후에도 유지된다', async ({ page }) => {
    await stubGemini(page, { delayMs: 50 });
    await gotoApp(page);

    await page.click('.btn-lang:has-text("English")');
    await expect(page.locator('#nav-home')).toHaveText('Home');

    await page.reload();
    await page.waitForSelector('#card-grid .student-card');
    await expect(page.locator('#nav-home')).toHaveText('Home', { timeout: 5000 });
    await expect(page.locator('#footerLangSelect')).toHaveValue('en');
  });

  // Gemini가 막혀 있을 때(할당량 초과, Firebase AI Logic API 미활성 등) 쓰이는 예비 경로.
  // 문장들을 줄바꿈으로 이어 한 요청으로 보내는데, sl=auto는 "요청 하나" 단위로 언어를 감지하므로
  // 한국어와 영어를 한 묶음에 섞으면 묶음 전체가 한국어로 감지돼 영어 줄이 번역되지 않고 돌아온다.
  // 그래서 한글이 든 문장과 아닌 문장은 반드시 다른 요청으로 나가야 한다.
  test('예비 번역 경로는 한국어와 영어를 같은 요청에 섞지 않는다', async ({ page }) => {
    await gotoApp(page);

    const result = await page.evaluate(async () => {
      const sent = [];
      const realFetch = window.fetch;
      window.fetch = async (url) => {
        const q = decodeURIComponent(new URL(url).searchParams.get('q'));
        sent.push(q);
        // gtx 엔드포인트 응답 모양(줄마다 한 덩어리, 끝에 줄바꿈)을 흉내낸다.
        const chunks = q.split('\n').map((line) => [`T(${line})\n`]);
        return { json: async () => [chunks] };
      };
      try {
        const inputs = ['홈', 'Dream Exchange', '커뮤니티', 'Global Networking', '마이페이지', 'Research'];
        const out = await window.fallbackTranslateMany(inputs, 'ja');
        return { sent, out, inputs };
      } finally {
        window.fetch = realFetch;
      }
    });

    const HANGUL = /[㄰-㆏가-힯]/;
    // 요청 하나에 실린 줄들은 전부 한글이거나 전부 한글이 아니어야 한다.
    for (const q of result.sent) {
      const lines = q.split('\n');
      const withHangul = lines.filter((l) => HANGUL.test(l)).length;
      expect(withHangul === 0 || withHangul === lines.length,
        `한 요청에 한국어와 영어가 섞였다: ${JSON.stringify(lines)}`).toBe(true);
    }
    // 그러면서도 결과는 입력과 같은 순서·길이로 돌아와야 한다(줄 정렬이 틀어지면 안 됨).
    expect(result.out).toEqual(result.inputs.map((t) => `T(${t})`));
    // 6개 문장이 한글/비한글 2개 요청으로만 나갔는지 (문장마다 한 건씩이 아니라)
    expect(result.sent.length).toBe(2);
  });

  test('언어를 전환하는 동안 콘솔 에러가 나지 않는다', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(String(err)));
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      // 이 스위트는 Firebase/Google 호스트를 전부 막아두므로 그쪽 로드 실패는 예상된 잡음이다.
      if (/gstatic|googleapis|firebase|google|net::ERR_FAILED|Failed to load resource/i.test(text)) return;
      errors.push(text);
    });

    await stubGemini(page, { delayMs: 50 });
    await gotoApp(page);

    await page.click('.btn-lang:has-text("Español")');
    await expect(page.locator('#nav-home')).toHaveText('[es] 홈', { timeout: 15000 });
    await page.click('.btn-lang:has-text("한국어")');
    await expect(page.locator('#nav-home')).toHaveText('홈', { timeout: 5000 });

    expect(errors).toEqual([]);
  });
});
