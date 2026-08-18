const { test, expect, gotoApp, loginAs } = require('./fixtures');

// 회귀 테스트: 학생/프로젝트 카드의 버튼들이 한때 이름·프로젝트명 같은 자유 텍스트를
// onclick="..." 안에 직접 문자열로 끼워넣었다. escapeHTML()로 감싸도 소용없었던 이유는,
// 브라우저가 onclick attribute 값을 읽을 때 HTML 엔티티(&#39; 등)를 원래 문자로 디코딩한
// "뒤에" 그 문자열을 JS로 컴파일하기 때문 — 그래서 이름에 작은따옴표나 큰따옴표가 하나만
// 있어도 클릭할 때 SyntaxError가 나며 버튼이 완전히 죽었다(실제로 두 번 이런 식으로
// 배포됐다가 발견됨). 지금은 onclick에 uid만 넘기고, 이름/제목은 핸들러 함수 안에서
// window.__REAL_STUDENTS를 조회해서 얻는 방식으로 고쳐져 있다 — 이 테스트는 그 수정이
// 유지되는지 지킨다.
test.describe('onclick 속성 텍스트 삽입 회귀 테스트', () => {
  test('작은따옴표·큰따옴표가 섞인 이름/프로젝트명이어도 카드 버튼 클릭이 안 깨진다', async ({ page }) => {
    await gotoApp(page);
    await loginAs(page);

    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    const result = await page.evaluate(() => {
      const realStudent = {
        id: 'real-abc123', uid: 'abc123', isReal: true, isAiGenerated: false,
        name: "O'Brien Kim", country: '한국', flag: '🇰🇷',
        university: "St. Mary's University", uniShort: 'SMU', major: 'AI',
        tags: [], bio: '', badgeGradient: '',
        project: { title: 'Sarah\'s "AI" Startup', recruiting: true, deadlineDays: 5, spotsLeft: 2 },
        dreamExchangeCountries: [],
      };
      window.__REAL_STUDENTS = [realStudent];

      const html = studentCardHTML(realStudent, {});
      const container = document.createElement('div');
      container.id = 'onclick-injection-test-container';
      container.innerHTML = html;
      document.body.appendChild(container);

      // DOM 순서상 .project-recruit-box(프로젝트 참여하기)가 .card-bottom(Connect)보다 먼저
      // 나오므로, 스코프 없는 '.btn-connect'는 참여하기 버튼과 매칭된다 — 헷갈리지 않도록
      // 둘 다 명시적으로 스코프를 준다.
      const connectBtn = container.querySelector('.card-bottom .btn-connect');
      const joinBtn = container.querySelector('.project-recruit-box .btn-connect');
      return {
        hasConnectBtn: !!connectBtn,
        hasJoinBtn: !!joinBtn,
        connectOnclick: connectBtn ? connectBtn.getAttribute('onclick') : null,
        joinOnclick: joinBtn ? joinBtn.getAttribute('onclick') : null,
      };
    });

    expect(result.hasConnectBtn, 'Connect 버튼이 렌더링돼야 함').toBe(true);
    expect(result.hasJoinBtn, '프로젝트 참여하기 버튼이 렌더링돼야 함').toBe(true);
    // onclick 안에 원문 텍스트(따옴표를 포함한 이름/제목)가 그대로 들어있으면 안 된다 —
    // uid만 들어있어야 안전하다.
    expect(result.joinOnclick).not.toContain("O'Brien");
    expect(result.joinOnclick).not.toContain('Sarah');

    await page.click('#onclick-injection-test-container .card-bottom .btn-connect');
    await page.click('#onclick-injection-test-container .project-recruit-box .btn-connect');
    await page.waitForTimeout(200);

    expect(pageErrors, `버튼 클릭 시 JS 에러가 발생하면 안 됨: ${pageErrors.join('; ')}`).toHaveLength(0);
  });
});
