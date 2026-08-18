const { test, expect, gotoApp, loginAs, logout } = require('./fixtures');

test.describe('비로그인 상태 게이트', () => {
  test('메시지함은 로그인 게이트를 보여주고 대화 목록은 숨긴다', async ({ page }) => {
    await gotoApp(page);
    await logout(page);
    await page.evaluate(() => showPage('messages'));

    await expect(page.locator('#msgLoginGate')).toBeVisible();
    await expect(page.locator('#msgList')).toBeHidden();
  });

  test('마이페이지는 로그인 전엔 약관 동의 게이트만 보여준다', async ({ page }) => {
    await gotoApp(page);
    await logout(page);
    await page.evaluate(() => showPage('mypage'));

    await expect(page.locator('#authConsentGate')).toBeVisible();
    await expect(page.locator('#profileContainer')).toBeHidden();
  });

  test('로그아웃 상태에서는 하트(저장) 표시가 절대 뜨지 않는다', async ({ page }) => {
    await gotoApp(page);

    // 로그인 상태에서 첫 학생 카드를 저장해둔다.
    await loginAs(page);
    const firstCard = page.locator('#card-grid .student-card').first();
    await firstCard.locator('.card-fav-btn').click();
    await expect(firstCard.locator('.card-fav-btn')).toHaveClass(/is-saved/);

    // 로그아웃하면, 같은 학생을 저장해뒀던 사실과 무관하게 저장 표시가 사라져야 한다
    // (isSaved()가 window.__myUid()를 확인하므로) — 로그인 안 한 사용자에게 남의 저장
    // 상태가 노출되던 예전 버그의 회귀 테스트.
    await logout(page);
    await page.evaluate(() => typeof render === 'function' && render());
    await expect(page.locator('#card-grid .student-card').first().locator('.card-fav-btn'))
      .not.toHaveClass(/is-saved/);
  });
});
