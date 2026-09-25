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
    await expect(page.locator('[data-i18n="community_title"]')).toHaveText('[fr] 커뮤니티', { timeout: 15000 });
    // 게시글 본문은 TranslationService(원문 언어 → 현재 언어) 경로를 탄다.
    await expect(page.locator('.post-body').first()).toContainText('[fr]', { timeout: 15000 });
  });

  test('고른 언어가 새로고침 후에도 유지된다', async ({ page }) => {
    await stubGemini(page, { delayMs: 50 });
    await gotoApp(page);

    await page.click('.btn-lang:has-text("English")');
    await expect(page.locator('#nav-home')).toHaveText('Home');

    await page.reload();
    await page.waitForSelector('#card-grid .student-card', { state: 'attached' });
    await expect(page.locator('#nav-home')).toHaveText('Home', { timeout: 5000 });
    await expect(page.locator('#footerLangSelect')).toHaveValue('en');
  });

  // Gemini가 막혀 있을 때(할당량 소진, API 오류, 네트워크 문제) 쓰이는 예비 경로는 엔진이 둘이다.
  //  1) clients5: q를 여러 개 받아 항목별로 번역하고 원문 언어도 항목마다 따로 감지한다.
  //  2) gtx: clients5가 막혔을 때의 두 번째 줄. 다중 q를 지원하지 않아 줄바꿈으로 묶는데,
  //     그러면 묶음 전체 단위로 언어가 감지돼 한/영을 섞으면 영어 줄이 번역되지 않고 돌아온다.
  test('1차 예비 엔진(clients5)은 한/영이 섞여도 한 요청으로 항목별 번역한다', async ({ page }) => {
    await gotoApp(page);

    const result = await page.evaluate(async () => {
      const sent = [];
      const realFetch = window.fetch;
      window.fetch = async (url, ...rest) => {
        if (typeof url === 'string' && url.includes('clients5.google.com')) {
          const qs = new URL(url).searchParams.getAll('q');
          sent.push(qs);
          // clients5 응답 모양: [["번역문","감지된 원문 언어"], ...]
          return { json: async () => qs.map((q) => [`C5(${q})`, 'ko']) };
        }
        return realFetch.call(window, url, ...rest);
      };
      try {
        const inputs = ['홈', 'Dream Exchange', '커뮤니티', 'Global Networking', '마이페이지', 'Research'];
        const out = await window.fallbackTranslateMany(inputs, 'ja');
        return { sent, out, inputs };
      } finally {
        window.fetch = realFetch;
      }
    });

    // 한 요청에 6개가 그대로 실리고, 결과는 입력과 같은 순서·길이로 돌아온다.
    expect(result.sent.length).toBe(1);
    expect(result.sent[0]).toEqual(result.inputs);
    expect(result.out).toEqual(result.inputs.map((t) => `C5(${t})`));
  });

  test('clients5가 실패하면 gtx로 넘어가고, 거기선 한국어와 영어를 같은 요청에 섞지 않는다', async ({ page }) => {
    await gotoApp(page);

    const result = await page.evaluate(async () => {
      const sent = [];
      const realFetch = window.fetch;
      window.fetch = async (url, ...rest) => {
        if (typeof url === 'string' && url.includes('clients5.google.com')) {
          throw new Error('clients5 down');  // 1차 엔진이 죽은 상황
        }
        if (typeof url === 'string' && url.includes('translate.googleapis.com')) {
          const q = decodeURIComponent(new URL(url).searchParams.get('q'));
          sent.push(q);
          // gtx 응답 모양(줄마다 한 덩어리, 끝에 줄바꿈)
          return { json: async () => [q.split('\n').map((line) => [`T(${line})\n`])] };
        }
        return realFetch.call(window, url, ...rest);
      };
      try {
        const inputs = ['홈', 'Dream Exchange', '커뮤니티', 'Global Networking', '마이페이지', 'Research'];
        const out = await window.fallbackTranslateMany(inputs, 'ja');
        return { sent, out, inputs };
      } finally {
        window.fetch = realFetch;
      }
    });

    const HANGUL = /[\u3130-\u318F\uAC00-\uD7AF]/;
    for (const q of result.sent) {
      const lines = q.split('\n');
      const withHangul = lines.filter((l) => HANGUL.test(l)).length;
      expect(withHangul === 0 || withHangul === lines.length,
        `한 요청에 한국어와 영어가 섞였다: ${JSON.stringify(lines)}`).toBe(true);
    }
    // 1차 엔진이 죽어도 결과는 빠짐없이, 입력과 같은 순서로 채워져야 한다.
    expect(result.out).toEqual(result.inputs.map((t) => `T(${t})`));
    expect(result.sent.length).toBe(2); // 한글 묶음 + 비한글 묶음
  });

  test('모든 번역 엔진이 죽어도, 전에 본 적 있는 언어는 저장해둔 번역으로 즉시 바뀐다', async ({ page }) => {
    // 1회차: 정상적으로 번역해서 localStorage에 쌓는다.
    await page.addInitScript(() => {
      window.__aiTranslateBatch = async (texts, s, t) => texts.map((x) => `AI(${x})`);
    });
    await gotoApp(page);
    await page.click('.btn-lang:has-text("日本語")');
    await expect(page.locator('#nav-home')).toHaveText('AI(홈)', { timeout: 15000 });
    // 저장 디바운스(1.5초)가 끝날 때까지 기다린다
    await page.waitForFunction(
      () => { try { return !!localStorage.getItem('unily.tcache.ja'); } catch (e) { return false; } },
      { timeout: 10000 }
    );

    // 2회차: 새로고침 + 번역 수단을 전부 끊는다(Gemini 미등록 + 모든 fetch 실패).
    await page.addInitScript(() => {
      delete window.__aiTranslateBatch;
      window.__aiTranslate = undefined;
      window.fetch = async () => { throw new Error('offline'); };
    });
    await page.reload();
    await page.waitForSelector('#card-grid .student-card', { state: 'attached' });

    // 저장된 언어가 복원되면서, 네트워크 없이도 화면이 일본어로 떠야 한다.
    await expect(page.locator('#nav-home')).toHaveText('AI(홈)', { timeout: 10000 });
  });

  // Gemini 무료 티어는 분당 5요청이고, 문장을 크게 묶으면 한 호출에 20초 넘게 걸리거나
  // 모델 과부하로 500이 나기도 한다(실측). 그동안 원문이 그대로 떠 있으면 "언어를 골라도
  // 안 바뀐다"는 체감이 그대로 돌아오므로, 예비 번역으로 먼저 채우고 나중에 갈아끼워야 한다.
  test('Gemini가 늦으면 예비 번역으로 먼저 채우고, 도착하면 Gemini 번역으로 갈아끼운다', async ({ page }) => {
    test.setTimeout(90000);
    await page.addInitScript(() => {
      // Gemini: 소프트 타임아웃(6초)보다 한참 느리게 응답
      window.__aiTranslateBatch = async (texts) => {
        await new Promise((r) => setTimeout(r, 9000));
        return texts.map((t) => `AI(${t})`);
      };
      // 예비 경로(구글 무료 엔드포인트): 즉시 응답
      const realFetch = window.fetch;
      window.fetch = async (url, ...rest) => {
        if (typeof url === 'string' && url.includes('translate.googleapis.com')) {
          const q = decodeURIComponent(new URL(url).searchParams.get('q'));
          return { json: async () => [q.split('\n').map((line) => [`FB(${line})\n`])] };
        }
        return realFetch.call(window, url, ...rest);
      };
    });
    await gotoApp(page);

    await page.click('.btn-lang:has-text("日本語")');
    // 1) Gemini를 끝까지 기다리지 않고 예비 번역이 먼저 화면을 채운다
    await expect(page.locator('#nav-home')).toHaveText('FB(홈)', { timeout: 8500 });
    // 2) 뒤늦게 도착한 Gemini 번역으로 갈아끼운다
    await expect(page.locator('#nav-home')).toHaveText('AI(홈)', { timeout: 30000 });
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
