const { test, expect, gotoApp, loginAs } = require('./fixtures');

// 브랜드 신뢰의 문제: 예시(데모) 데이터가 실제 유저와 한 목록에 섞이면 "이미 학생이 많은
// 서비스"처럼 보인다. 숫자·통계에는 절대 들어가지 않고, 화면에서는 항상 구분돼야 한다.
test.describe('예시 데이터 경계', () => {
  test('탐색 헤드라인 숫자는 실제 학생만 센다', async ({ page }) => {
    await gotoApp(page);
    await loginAs(page, { uid: 'me' });   // 실제 학생 목록은 로그인해야 읽힌다

    // 실제 유저 2명을 주입한다. 예시 학생 16명은 그대로 있다.
    await page.evaluate(() => {
      window.__REAL_STUDENTS = [
        { uid: 'u1', name: 'Sophie Müller', university: 'TU Munich', major: 'CS', country: '독일', interests: [], onboardingComplete: true, profileVisible: true },
        { uid: 'u2', name: 'Lucas Martins', university: 'USP', major: 'Design', country: '브라질', interests: [], onboardingComplete: true, profileVisible: true },
      ];
      render();
    });

    const count = await page.locator('#result-count strong').textContent();
    expect(count).toBe('2');                       // 16명(예시)이 아니라 실제 2명
    await expect(page.locator('#card-grid .demo-divider')).toHaveCount(1);
    await expect(page.locator('#card-grid .demo-divider')).toContainText('예시 프로필');
  });

  test('실제 학생이 없으면 숫자를 부풀리지 않고 0과 안내를 보여준다', async ({ page }) => {
    await gotoApp(page);
    await loginAs(page, { uid: 'me' });
    await page.evaluate(() => { window.__REAL_STUDENTS = []; render(); });

    expect(await page.locator('#result-count strong').textContent()).toBe('0');
    await expect(page.locator('#card-grid .explore-empty')).toContainText('첫 번째 학생이 되어보세요');
    // 예시 카드는 구분선 뒤에 그대로 남아 화면이 비어 보이지는 않게 한다.
    await expect(page.locator('#card-grid .demo-divider')).toHaveCount(1);
  });

  test('비로그인 방문자에게는 "0명" 대신 안내를 보여준다 (목록을 읽을 권한이 없을 뿐이므로)', async ({ page }) => {
    await gotoApp(page);   // 로그인하지 않은 상태

    await expect(page.locator('#result-count')).not.toContainText('0명');
    await expect(page.locator('#result-count')).toContainText('학교 이메일로 가입하면');
    await expect(page.locator('#card-grid .explore-empty')).toContainText('로그인하면');
  });

  test('커뮤니티 피드에서 예시 글은 실제 글 아래에 구분선과 함께 온다', async ({ page }) => {
    await gotoApp(page);
    await loginAs(page, { uid: 'me' });
    await page.evaluate(() => {
      window.__REAL_POSTS = [{
        id: 'real-1', isReal: true, authorUid: 'u1', authorName: 'Sophie Müller',
        lang: 'ko', categoryKey: 'general', title: '실제 글입니다', body: '실제 글 본문',
        tags: ['AI'], likes: 0, views: 0, commentCount: 0, createdAt: Date.now() - 100000,
      }];
      window.__REAL_STUDENTS = [{ uid: 'u1', name: 'Sophie Müller', university: 'TU Munich', major: 'CS', country: '독일', interests: [], onboardingComplete: true, profileVisible: true }];
      showPage('community');
      document.getElementById('postFeed').innerHTML = '';
      renderFeed(true);
    });

    const feed = page.locator('#postFeed');
    await expect(feed.locator('.post-card').first()).toContainText('실제 글입니다');
    await expect(feed.locator('.demo-divider')).toHaveCount(1);
    await expect(feed.locator('.demo-divider')).toContainText('예시 게시글');

    // 구분선은 첫 카드보다 뒤에 있어야 한다(= 실제 글이 위).
    const order = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#postFeed > *')).map((el) => el.className.split(' ')[0]));
    expect(order.indexOf('post-card')).toBeLessThan(order.indexOf('demo-divider'));
  });

  test('트렌딩/인기 학생은 예시 글이 아니라 실제 글에서만 집계한다', async ({ page }) => {
    await gotoApp(page);
    await page.evaluate(() => { window.__REAL_POSTS = []; window.__REAL_POST_COMMENTS = []; });

    const trending = await page.evaluate(() => CommunityService.getTrendingTopics());
    const popular = await page.evaluate(() => CommunityService.getPopularStudents());
    expect(trending).toHaveLength(0);   // 예시 글의 태그로 트렌딩을 만들지 않는다
    expect(popular).toHaveLength(0);
  });

  test('가짜 새 글을 주기적으로 흘려보내지 않는다', async ({ page }) => {
    await gotoApp(page);
    const gone = await page.evaluate(() => ({
      pool: typeof REALTIME_INCOMING_POOL,
      sim: typeof simulateIncomingPost,
    }));
    expect(gone.pool).toBe('undefined');
    expect(gone.sim).toBe('undefined');
  });
});

// 실제 유저가 쓴 글의 작성자가 "Unknown"으로 뜨던 문제 — 서비스에서 가장 중요한
// "이 사람이 누구인가"가 비어 있었다.
test.describe('작성자 신원', () => {
  test('실제 글의 작성자 이름·학교·전공이 보인다', async ({ page }) => {
    await gotoApp(page);
    await loginAs(page, { uid: 'me' });

    const html = await page.evaluate(() => {
      window.__REAL_STUDENTS = [{
        uid: 'u9', name: "O'Brien Kim", university: 'Yonsei University', major: 'Design',
        country: '한국', interests: [], onboardingComplete: true, profileVisible: true,
      }];
      return renderPostCardHTML({
        id: 'p-real', isReal: true, authorUid: 'u9', lang: 'ko', categoryKey: 'general',
        title: '제목', body: '본문', tags: [], likes: 0, views: 0, commentCount: 0, createdAt: Date.now(),
      });
    });

    expect(html).not.toContain('Unknown');
    expect(html).toContain('Yonsei University');
    expect(html).toContain('Design');
    expect(html).toContain('O&#39;Brien Kim');   // 이스케이프는 한 번만 (O&amp;#39; 아님)
    expect(html).not.toContain('O&amp;#39;');
  });
});
