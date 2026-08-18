const { test, expect, gotoApp } = require('./fixtures');

// 회귀 테스트: .notif-dropdown이 자기 자신(종 아이콘, 44px짜리 작은 박스)을 기준으로
// right:0 앵커링돼 있어서, 그 아이콘이 화면 진짜 오른쪽 끝이 아니라 메시지 아이콘·CTA
// 버튼보다 왼쪽에 있는 좁은 화면에서는 패널이 왼쪽으로 화면 밖까지 밀려나 잘려 보이던
// 버그가 있었다(이번 세션에 .nav-right-actions를 기준점으로 옮겨 수정).
test.describe('알림 드롭다운 — 화면 안에 들어와야 함', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('모바일 폭에서 알림 패널이 뷰포트를 벗어나지 않는다', async ({ page }) => {
    await gotoApp(page);
    await page.click('#notifBellBtn');

    const panel = page.locator('#notifPanel');
    await expect(panel).toHaveClass(/active/);

    const box = await panel.boundingBox();
    expect(box, '알림 패널의 bounding box를 읽을 수 있어야 함').not.toBeNull();
    expect(box.x, '패널 왼쪽 끝이 화면 밖(음수)으로 나가면 안 됨').toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, '패널 오른쪽 끝이 뷰포트 폭을 넘으면 안 됨').toBeLessThanOrEqual(390 + 1);
  });
});
