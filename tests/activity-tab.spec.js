const { test, expect, gotoApp, loginAs } = require('./fixtures');

// 마이페이지 "활동" 탭: 항목 메뉴(작성한 게시글/댓글/좋아요/저장한 글/신고/차단) → 상세
// 두 단계로 동작한다. 예전에는 모든 목록이 한 화면에 펼쳐져 있었고, 저장한 글은 별도 탭이었다.
async function openActivityTab(page) {
  await gotoApp(page);
  await loginAs(page, { uid: 'me', name: 'Test User' });
  await page.evaluate(() => {
    // Firebase가 막혀 있는 테스트 환경이라 신고 내역 조회만 스텁으로 대신한다.
    window.__fbGetMyReports = async () => ([
      { id: 'r1', type: 'post', targetId: 'p1', postId: 'p1', reason: 'spam', status: 'open', createdAt: Date.now() - 60000 },
      { id: 'r2', type: 'comment', targetId: 'c9', postId: 'no-such-post', reason: 'harassment', status: 'open', createdAt: Date.now() - 120000 },
    ]);
    window.__myBlockedUids = ['blocked-1'];
    window.__REAL_STUDENTS = [{ uid: 'blocked-1', name: 'Mallory', university: 'Example University', onboardingComplete: true, interests: [] }];
    showPage('mypage');
    switchMyPageTab('activity');
  });
}

test.describe('마이페이지 활동 탭', () => {
  test('항목 메뉴가 먼저 보이고, 목록은 펼쳐져 있지 않다', async ({ page }) => {
    await openActivityTab(page);

    await expect(page.locator('#activityMenu .activity-menu-item')).toHaveCount(6);
    await expect(page.locator('#activityDetail')).toBeHidden();
    // 저장한 글은 더 이상 별도 탭이 아니라 이 메뉴 안에 있다.
    await expect(page.locator('.mypage-tab[data-tab="saved"]')).toHaveCount(0);
    await expect(page.locator('.activity-menu-item', { hasText: '저장한 글' })).toBeVisible();
    // 개수 배지는 데이터가 도착하면 채워진다 (신고 2건, 차단 1명).
    await expect(page.locator('.activity-menu-item', { hasText: '신고한 내역' }).locator('.activity-menu-count')).toHaveText('2');
    await expect(page.locator('.activity-menu-item', { hasText: '차단한 사용자' }).locator('.activity-menu-count')).toHaveText('1');
  });

  test('신고한 내역으로 들어가면 사유·대상이 보이고, 뒤로 가면 메뉴로 돌아온다', async ({ page }) => {
    await openActivityTab(page);

    await page.click('.activity-menu-item:has-text("신고한 내역")');
    await expect(page.locator('#activityDetail')).toBeVisible();
    await expect(page.locator('#activityMenu')).toBeHidden();
    await expect(page.locator('#activityDetailTitle')).toHaveText('신고한 내역');

    const items = page.locator('#activityDetailBody .activity-report-item');
    await expect(items).toHaveCount(2);
    await expect(items.first()).toContainText('스팸');
    await expect(items.first()).toContainText('파리 카페');          // 아직 남아 있는 글이면 제목을 보여준다
    await expect(items.nth(1)).toContainText('삭제되었거나');         // 지워진 글은 그렇게 표시

    await page.click('.activity-back-btn');
    await expect(page.locator('#activityMenu')).toBeVisible();
    await expect(page.locator('#activityDetail')).toBeHidden();
  });

  test('차단한 사용자 목록에 이름과 차단 해제 버튼이 있다', async ({ page }) => {
    await openActivityTab(page);

    await page.click('.activity-menu-item:has-text("차단한 사용자")');
    const row = page.locator('#activityDetailBody .activity-blocked-item');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Mallory');
    await expect(row).toContainText('Example University');
    await expect(row.locator('.activity-unblock-btn')).toBeVisible();
  });

  test('차단 해제를 누르면 목록에서 빠진다', async ({ page }) => {
    await openActivityTab(page);
    await page.evaluate(() => {
      // 실제 Firestore 쓰기 대신, 차단 목록만 비우는 스텁으로 흐름을 확인한다.
      window.__unblockUser = async (uid) => {
        window.__myBlockedUids = (window.__myBlockedUids || []).filter((u) => u !== uid);
      };
    });

    await page.click('.activity-menu-item:has-text("차단한 사용자")');
    await page.click('.activity-unblock-btn');

    await expect(page.locator('#activityDetailBody .activity-blocked-item')).toHaveCount(0);
    await expect(page.locator('#activityDetailBody')).toContainText('차단한 사용자가 없어요');
  });

  test('작성한 게시글 항목은 글이 없을 때 빈 상태 문구를 보여준다', async ({ page }) => {
    await openActivityTab(page);

    await page.click('.activity-menu-item:has-text("작성한 게시글")');
    await expect(page.locator('#activityDetailBody')).toContainText('아직 작성한 게시글이 없어요');
  });

  test('저장한 글이 활동 메뉴 안에서 열리고 저장한 글 목록을 보여준다', async ({ page }) => {
    await openActivityTab(page);
    // 게시글 하나를 저장해둔 상태를 만든다 (저장 목록은 localStorage 기반).
    await page.evaluate(async () => {
      await CommunityService.savePost('p1', true);
      switchMyPageTab('activity');
    });

    await expect(page.locator('.activity-menu-item', { hasText: '저장한 글' }).locator('.activity-menu-count')).toHaveText('1');
    await page.click('.activity-menu-item:has-text("저장한 글")');
    await expect(page.locator('#activityDetailTitle')).toHaveText('저장한 글');
    await expect(page.locator('#activityDetailBody')).toContainText('파리 카페');
  });
});
