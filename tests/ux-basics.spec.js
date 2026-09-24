const { test, expect, gotoApp, loginAs } = require('./fixtures');

// UX 기본기 세 가지: 로딩 스켈레톤 / 모달 공통 동작(Esc·스크롤 잠금·포커스 복귀) / 터치 타깃 44px.
test.describe('UX 기본기', () => {
  test('커뮤니티 피드는 목록이 오기 전에 스켈레톤을 보여준다', async ({ page }) => {
    await gotoApp(page);
    // 목록 응답을 늦춰서 로딩 구간을 관찰한다.
    await page.evaluate(() => {
      const original = CommunityService.getPosts;
      CommunityService.getPosts = (...args) =>
        new Promise((resolve) => setTimeout(() => resolve(original(...args)), 1200)).then((p) => p);
    });
    // 첫 로딩과 같은 상태(아직 아무것도 못 그린 피드)를 만든다.
    await page.evaluate(() => {
      showPage('community');
      document.getElementById('postFeed').innerHTML = '';
      renderFeed(true);
    });

    await expect(page.locator('#postFeed .skeleton-card').first()).toBeVisible();
    // 도착하면 스켈레톤은 사라지고 실제 카드가 들어온다.
    await expect(page.locator('#postFeed .post-card').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#postFeed .skeleton-card')).toHaveCount(0);
  });

  test('대학 목록 모달도 데이터가 오기 전에 자리를 잡아둔다', async ({ page }) => {
    await gotoApp(page);
    await page.route('**/top_1200_universities.json', async (route) => {
      await new Promise((r) => setTimeout(r, 1200));
      await route.continue();
    });
    await page.evaluate(() => openUniversityDirectory());

    await expect(page.locator('#uniDirectoryList .skeleton-uni-row').first()).toBeVisible();
    await expect(page.locator('#uniDirectoryList .uni-directory-item').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#uniDirectoryList .skeleton-uni-row')).toHaveCount(0);
  });

  test('Esc로 모달이 닫히고, 열린 동안 배경 스크롤이 잠긴다', async ({ page }) => {
    await gotoApp(page);

    await page.click('#countryHoverTrigger');
    await expect(page.locator('#countryDirectoryOverlay')).toHaveClass(/active/);
    await expect(page.locator('body')).toHaveClass(/modal-open/);

    await page.keyboard.press('Escape');
    await expect(page.locator('#countryDirectoryOverlay')).not.toHaveClass(/active/);
    await expect(page.locator('body')).not.toHaveClass(/modal-open/);
  });

  test('모달을 닫으면 열기 전에 있던 버튼으로 포커스가 돌아온다', async ({ page }) => {
    await gotoApp(page);
    await page.focus('#countryHoverTrigger');
    await page.keyboard.press('Enter');
    await expect(page.locator('#countryDirectoryOverlay')).toHaveClass(/active/);

    await page.keyboard.press('Escape');
    const focusedId = await page.evaluate(() => document.activeElement && document.activeElement.id);
    expect(focusedId).toBe('countryHoverTrigger');
  });

  test('온보딩 위저드는 Esc로 닫히지 않는다 (끝내야 하는 흐름)', async ({ page }) => {
    await gotoApp(page);
    await loginAs(page, { uid: 'me' });
    await page.evaluate(() => onboardingOpen());
    await expect(page.locator('#onboardingOverlay')).toHaveClass(/active/);

    await page.keyboard.press('Escape');
    await expect(page.locator('#onboardingOverlay')).toHaveClass(/active/);
    // 스크롤 잠금은 온보딩에도 걸린다.
    await expect(page.locator('body')).toHaveClass(/modal-open/);
  });

  test('모바일에서 44px보다 작은 터치 타깃이 없다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page);
    await loginAs(page, { uid: 'me', name: '빛나' });

    // 일반 컨트롤은 44px 기준. 본문에 촘촘히 박히는 작은 글자 버튼(태그, "원문 보기")만 32px 기준으로
    // 본다 — 44px로 키우면 글이 읽히지 않는다(구글 가이드도 밀집 요소엔 더 작은 값을 허용한다).
    const DENSE = ['post-tag', 'view-original-btn'];
    const tooSmall = [];
    for (const name of ['home', 'community', 'messages', 'mypage']) {
      await page.evaluate((n) => showPage(n), name);
      await page.waitForTimeout(600);
      const found = await page.evaluate((dense) =>
        Array.from(document.querySelectorAll('button, a[onclick], [role="button"], .footer-links a'))
          .filter((el) => {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) return false;
            const cls = String(el.className || '');
            const min = dense.some((d) => cls.includes(d)) ? 32 : 44;
            return r.width < min || r.height < min;
          })
          .map((el) => `${el.className || el.tagName} ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`)
      , DENSE);
      tooSmall.push(...found.map((f) => `[${name}] ${f}`));
    }
    expect(tooSmall, `44px 미만 터치 타깃:\n${tooSmall.join('\n')}`).toHaveLength(0);
  });
});
