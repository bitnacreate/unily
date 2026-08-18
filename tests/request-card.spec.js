const { test, expect, gotoApp, loginAs } = require('./fixtures');

// renderRequestCardHTML(chat, myUid, noMessagesYet)는 순수 렌더 함수라 실제 Firestore 없이도
// 그대로 테스트할 수 있다. Connect/프로젝트 참여 요청 카드가 상태별로 맞는 UI를 보여주는지 확인한다.
test.describe('요청 카드 렌더링', () => {
  test('대기중 + 내가 받은 요청 → 수락/거절 버튼이 보인다', async ({ page }) => {
    await gotoApp(page);
    await loginAs(page, { uid: 'me' });

    const html = await page.evaluate(() => renderRequestCardHTML({
      id: 'chat1', status: 'pending', requestedBy: 'other-uid', requestType: 'connect',
      otherName: 'Sarah', otherUid: 'other-uid', updatedAt: Date.now(),
    }, 'me', true));

    expect(html).toContain('request-card-actions');
    expect(html).toContain("respondToConnectRequest('chat1', 'accepted')");
    expect(html).toContain("respondToConnectRequest('chat1', 'declined')");
  });

  test('대기중 + 내가 보낸 요청 → 버튼 없이 대기 문구만 보인다', async ({ page }) => {
    await gotoApp(page);
    await loginAs(page, { uid: 'me' });

    const html = await page.evaluate(() => renderRequestCardHTML({
      id: 'chat1', status: 'pending', requestedBy: 'me', requestType: 'connect',
      otherName: 'Sarah', otherUid: 'other-uid', updatedAt: Date.now(),
    }, 'me', true));

    expect(html).not.toContain('request-card-actions');
    expect(html).toContain('요청을 보냈습니다');
  });

  test('거절됨 → 액션 버튼 없이 거절 문구만 보인다', async ({ page }) => {
    await gotoApp(page);
    await loginAs(page, { uid: 'me' });

    const html = await page.evaluate(() => renderRequestCardHTML({
      id: 'chat1', status: 'declined', requestedBy: 'other-uid', requestType: 'connect',
      otherName: 'Sarah', otherUid: 'other-uid', updatedAt: Date.now(),
    }, 'me', true));

    expect(html).not.toContain('request-card-actions');
    expect(html).toContain('요청을 거절했습니다');
  });
});
