const { test, expect, gotoApp, loginAs } = require('./fixtures');

// 보안 회귀 테스트: "남이 정한 문자열"이 화면에 들어오는 경로들.
// 이 앱은 거의 모든 화면을 innerHTML 문자열 조립으로 그리므로, 아래 네 경로 중 하나라도
// 이스케이프가 빠지면 그 문구를 보는 모든 유저의 브라우저에서 코드가 실행된다(저장형 XSS).
test.describe('저장형 XSS / 사칭 방어', () => {
  test('번역 캐시에 태그가 섞인 값은 저장되지 않는다', async ({ page }) => {
    await gotoApp(page);

    const result = await page.evaluate(() => {
      const poisoned = rememberTranslations('en', {
        'unily-xss-probe': '<img src=x onerror="window.__pwned=1">',
      });
      const clean = rememberTranslations('en', { 'unily-clean-probe': 'Hello' });
      return {
        poisonedKeys: Object.keys(poisoned),
        cleanKeys: Object.keys(clean),
        safeCheck: isSafeTranslation('<b>x</b>'),
      };
    });

    expect(result.poisonedKeys).toHaveLength(0);   // 오염된 번역은 캐시에 들어가지 않는다
    expect(result.cleanKeys).toEqual(['unily-clean-probe']);
    expect(result.safeCheck).toBe(false);
  });

  test('공개 번역 캐시에는 UI 문구만 올라간다 (개인 메시지는 절대 안 올라감)', async ({ page }) => {
    await gotoApp(page);

    const result = await page.evaluate(() => ({
      uiString: isShareableText('학교 이메일로 가입'),         // 화면에 박힌 UI 문구 → 공유 OK
      privateMessage: isShareableText('내일 3시에 학교 앞에서 만나자'), // 유저가 쓴 문장 → 공유 금지
      filtered: Object.keys(onlyShareable({
        '학교 이메일로 가입': 'Sign up with school email',
        '내일 3시에 학교 앞에서 만나자': "Let's meet at 3",
      })),
    }));

    expect(result.uiString).toBe(true);
    expect(result.privateMessage).toBe(false);
    expect(result.filtered).toEqual(['학교 이메일로 가입']);
  });

  test('게시글 태그에 따옴표를 심어도 onclick 문자열을 빠져나올 수 없다', async ({ page }) => {
    await gotoApp(page);
    await loginAs(page, { uid: 'me' });

    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    const onclick = await page.evaluate(() => {
      const post = {
        id: 'xss-post-1', isReal: true, authorUid: 'attacker', authorName: 'Mallory',
        lang: 'ko', categoryKey: 'general', title: 'hi', body: 'hi',
        tags: ["');window.__pwned=1;//"], likes: 0, views: 0, commentCount: 0, createdAt: Date.now(),
      };
      const container = document.createElement('div');
      container.id = 'xss-post-container';
      container.innerHTML = renderPostCardHTML(post);
      document.body.appendChild(container);
      const tagBtn = container.querySelector('.post-tag');
      tagBtn.click();
      // getAttribute는 엔티티가 이미 풀린 값을 주므로, 원본 마크업도 같이 확인한다.
      return { decoded: tagBtn.getAttribute('onclick'), raw: container.innerHTML };
    });

    await page.waitForTimeout(300);
    // 이스케이프의 핵심: 따옴표를 JS 이스케이프한 "뒤에" HTML 이스케이프한다.
    // 그래서 브라우저가 속성값의 엔티티를 다시 풀어도 백슬래시가 남아 JS 문자열이 끊기지 않는다.
    expect(onclick.decoded).toContain("\\');");
    expect(onclick.decoded).not.toContain("filterByTag('');");
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
    expect(pageErrors, `태그 클릭 시 JS 에러가 나면 안 됨: ${pageErrors.join('; ')}`).toHaveLength(0);
  });

  test('대화 상대가 임의의 리액션 키를 밀어넣어도 그리지 않는다', async ({ page }) => {
    await gotoApp(page);
    await loginAs(page, { uid: 'me' });

    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    const html = await page.evaluate(() => {
      window.__CHATS = [{
        id: 'chat-xss', otherUid: 'attacker', otherName: 'Mallory', status: 'accepted',
        requestedBy: 'attacker', requestType: 'connect', updatedAt: Date.now(), unreadCount: 0,
      }];
      window.__ACTIVE_MESSAGES = [{
        id: 'msg-1', senderUid: 'attacker', text: '안녕', createdAt: Date.now(), lang: 'ko',
        reactions: {
          '❤️': ['attacker'],
          "');window.__pwned=1;//": ['attacker'],
          '<img src=x onerror="window.__pwned=1">': ['attacker'],
        },
      }];
      selectChat('chat-xss');
      return document.getElementById('chatBody').innerHTML;
    });

    await page.waitForTimeout(300);
    expect(html).toContain('chat-reaction-chip');       // 정상 이모지는 그대로 보인다
    expect(html).not.toContain('window.__pwned');        // 알 수 없는 키는 통째로 버려진다
    expect(html).not.toContain('<img src=x');
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
    expect(pageErrors, `채팅 렌더링 중 JS 에러가 나면 안 됨: ${pageErrors.join('; ')}`).toHaveLength(0);
  });

  test('대화 상대 이름은 chats 문서가 아니라 실제 프로필을 따른다 (사칭 차단)', async ({ page }) => {
    await gotoApp(page);
    await loginAs(page, { uid: 'me' });

    const names = await page.evaluate(() => {
      window.__REAL_STUDENTS = [{ uid: 'attacker', name: 'Mallory', onboardingComplete: true, interests: [] }];
      window.__CHATS = [
        { id: 'c1', otherUid: 'attacker', otherName: 'Unily 운영팀', updatedAt: Date.now(), unreadCount: 0 },
        { id: 'c2', otherUid: 'ghost', otherName: '탈퇴한 사용자', updatedAt: Date.now() - 1, unreadCount: 0 },
      ];
      return getAllChatsCombined().map(c => c.otherName);
    });

    expect(names[0]).toBe('Mallory');        // participantInfo에 적어둔 사칭 이름이 아니라 실제 프로필 이름
    expect(names[1]).toBe('탈퇴한 사용자');   // 디렉터리에 없는 상대는 기존 값을 그대로 쓴다
  });
});
