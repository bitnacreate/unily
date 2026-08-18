const { test, gotoApp, loginAs, assertNoHorizontalOverflow } = require('./fixtures');

// 이 앱은 "1fr" 그리드 트랙이 안의 nowrap/스크롤 콘텐츠 때문에 여러 번 뷰포트 밖으로 밀려난
// 전례가 있다(메시지함 사이드바, 커뮤니티 레이아웃, 알림 드롭다운 등 — 전부 이번 세션에 실제로
// 터졌던 버그). 화면을 바꿀 때마다 가로 스크롤이 생기지 않는지 지켜서 같은 종류의 회귀를 잡는다.
const VIEWPORTS = [
  { width: 360, height: 740, label: '360px(Android)' },
  { width: 390, height: 844, label: '390px(iPhone)' },
];

for (const vp of VIEWPORTS) {
  test.describe(`모바일 레이아웃 — ${vp.label}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('홈/탐색 페이지', async ({ page }) => {
      await gotoApp(page);
      await assertNoHorizontalOverflow(page, `홈 @ ${vp.label}`);
    });

    test('커뮤니티 페이지', async ({ page }) => {
      await gotoApp(page);
      await page.evaluate(() => showPage('community'));
      await assertNoHorizontalOverflow(page, `커뮤니티 @ ${vp.label}`);
    });

    test('메시지함 — 개인 메시지 탭 (로그인 상태)', async ({ page }) => {
      await gotoApp(page);
      await loginAs(page);
      await page.evaluate(() => showPage('messages'));
      await assertNoHorizontalOverflow(page, `메시지함(DM) @ ${vp.label}`);
    });

    test('메시지함 — 프로젝트 채널 탭 (로그인 상태)', async ({ page }) => {
      await gotoApp(page);
      await loginAs(page);
      await page.evaluate(() => {
        showPage('messages');
        switchMessagesTab('channels');
      });
      await assertNoHorizontalOverflow(page, `메시지함(채널) @ ${vp.label}`);
    });

    test('마이페이지 — 로그인 전 화면', async ({ page }) => {
      await gotoApp(page);
      await page.evaluate(() => showPage('mypage'));
      await assertNoHorizontalOverflow(page, `마이페이지(로그인 전) @ ${vp.label}`);
    });
  });
}
