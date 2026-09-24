const { test, expect, gotoApp } = require('./fixtures');
const fs = require('fs');
const path = require('path');

// "연결된 국가" 통계와 목록 모달은 등록된 대학 목록(top_1200_universities.json)에 있는
// 나라 전체를 빠짐없이 담아야 한다 — 숫자를 마크업에 박아두면 목록과 어긋난다.
const uniCountries = new Set(
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'top_1200_universities.json'), 'utf8'))
    .map((u) => u.country_code)
);

test.describe('연결된 국가', () => {
  test('히어로 통계 숫자가 국가 목록 길이와 같다', async ({ page }) => {
    await gotoApp(page);
    const result = await page.evaluate(() => ({
      stat: document.getElementById('statCountryNum').textContent.trim(),
      total: COUNTRY_DIRECTORY.length,
      codes: COUNTRY_DIRECTORY.map((c) => c.code),
    }));

    expect(result.total).toBe(37);
    expect(result.stat).toBe('37');
    // 중복 없음
    expect(new Set(result.codes).size).toBe(result.codes.length);
  });

  test('등록된 대학이 있는 나라가 모두 들어 있다', async ({ page }) => {
    await gotoApp(page);
    const codes = await page.evaluate(() => COUNTRY_DIRECTORY.map((c) => c.code));
    const missing = [...uniCountries].filter((code) => !codes.includes(code));
    expect(missing, `목록에서 빠진 국가: ${missing.join(', ')}`).toHaveLength(0);
  });

  test('모달을 열면 37개국이 모두 그려지고 검색이 동작한다', async ({ page }) => {
    await gotoApp(page);
    await page.click('#countryHoverTrigger');

    await expect(page.locator('#countryDirectoryGrid .country-card')).toHaveCount(37);
    await expect(page.locator('#countryDirectoryCount')).toContainText('37');

    await page.fill('#countryDirectorySearch', '아일');
    await expect(page.locator('#countryDirectoryGrid .country-card')).toHaveCount(1);
    await expect(page.locator('#countryDirectoryGrid .country-card')).toContainText('아일랜드');
  });

  test('모든 국가 이름이 7개 언어로 정의돼 있다', async ({ page }) => {
    await gotoApp(page);
    const incomplete = await page.evaluate(() => {
      const langs = ['ko', 'en', 'fr', 'es', 'de', 'ja', 'zh-CN'];
      return COUNTRY_DIRECTORY
        .filter((c) => langs.some((l) => !c.names[l]))
        .map((c) => c.code);
    });
    expect(incomplete, `번역이 빠진 국가: ${incomplete.join(', ')}`).toHaveLength(0);
  });
});
