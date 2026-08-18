// 이 스위트의 모든 spec이 공유하는 커스텀 test/expect + 헬퍼.
//
// 앱은 <script type="module">에서 실제 Firebase(gstatic.com에서 SDK를 import)에 연결한다.
// 요구사항(오프라인, 실제 네트워크 호출 없음)을 지키면서도 이전 애드혹 검증 스크립트가 쓰던
// "window.__myUid / window.__REAL_STUDENTS / window.__PROJECT_CHANNELS를 직접 주입" 패턴을
// 그대로 재사용하려면, Firebase/Google 계열 호스트로 나가는 요청을 아예 막아야 한다 — 그래야
// 모듈 스크립트의 최상위 import가 실패해서 그 안의 window.__myUid = function(){ auth.currentUser... }
// 같은 "진짜" 구현이 우리가 주입한 스텁을 덮어쓰지 않는다(모듈은 import가 실패하면 최상위 코드가
// 아예 실행되지 않는다). classic 스크립트 쪽은 어차피 전부 `window.__X ? window.__X() : ...` 식으로
// 방어돼 있어서, 모듈이 통째로 안 뜨더라도 페이지 자체는 에러 없이 정상 동작한다.
const { test: base, expect } = require('@playwright/test');

const BLOCKED_HOST_RE = /(^|\.)(gstatic\.com|googleapis\.com|google\.com|googletagmanager\.com|google-analytics\.com|firebaseio\.com|firebasestorage\.app|firebaseapp\.com|cloudfunctions\.net|gstatic\.cn)$/i;

const test = base.extend({
  page: async ({ page }, use) => {
    await page.route('**/*', (route) => {
      let hostname;
      try {
        hostname = new URL(route.request().url()).hostname;
      } catch {
        return route.continue();
      }
      if (BLOCKED_HOST_RE.test(hostname)) return route.abort();
      return route.continue();
    });
    await use(page);
  },
});

/** 앱 진입점으로 이동한다 (repo 루트를 서빙하므로 /20260801.html이 실제 엔트리). */
async function gotoApp(page) {
  await page.goto('/20260801.html');
  // DOMContentLoaded 핸들러(render/checkLoginState 등)가 다 돌 때까지 카드 그리드가 채워지는 걸로 확인.
  await page.waitForSelector('#card-grid .student-card');
}

/**
 * 로그인 상태를 흉내낸다 — 실제 Firebase Auth 대신 이 세션에서 검증해온 것과 동일한 방식으로
 * window.__myUid()와 localStorage(unily_user)를 직접 주입한다.
 * @param {import('@playwright/test').Page} page
 * @param {{ uid?: string, name?: string, email?: string }} [opts]
 */
async function loginAs(page, opts = {}) {
  const { uid = 'test-uid-1', name = 'Test User', email = 'test@university.edu' } = opts;
  await page.evaluate(({ uid, name, email }) => {
    window.__myUid = () => uid;
    const current = JSON.parse(localStorage.getItem('unily_user') || '{}');
    localStorage.setItem('unily_user', JSON.stringify({
      ...current, uid, name, email, isLoggedIn: true,
    }));
    if (typeof window.checkLoginState === 'function') window.checkLoginState();
  }, { uid, name, email });
}

/** 로그아웃 상태로 되돌린다 (기본 상태지만, 다른 테스트가 로그인해놓은 뒤 재사용할 때 대비). */
async function logout(page) {
  await page.evaluate(() => {
    window.__myUid = () => null;
    localStorage.removeItem('unily_user');
    if (typeof window.checkLoginState === 'function') window.checkLoginState();
  });
}

/** 페이지 전체 폭이 뷰포트를 벗어나지 않는지(가로 스크롤 발생 안 함) 확인한다. */
async function assertNoHorizontalOverflow(page, label) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, `${label}: scrollWidth(${scrollWidth}) should not exceed viewport width(${clientWidth})`)
    .toBeLessThanOrEqual(clientWidth + 1); // 서브픽셀 반올림 오차 1px 허용
}

module.exports = { test, expect, gotoApp, loginAs, logout, assertNoHorizontalOverflow };
