import { test, expect } from '@playwright/test';

// API 전체를 가짜 저장소로 교체한다. 운영 DB/인증 테스트 설정을 사용하지 않는다.
for (const field of ['selection', 'like', 'comment'] as const) {
  test(`느린 이전 저장이 마지막 ${field} 입력을 덮지 않는다`, async ({ page }) => {
    const id = 'qa-save-order';
    let selected = false, liked = false, comment = '', completed = 0, requests = 0;
    const pixel = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
    const state = () => ({ id, name: '저장 순서 테스트', shootType: 'wedding', target: 1, photoCount: 1, uploaded: true, realtimeKey: '',
      photos: [{ id: 'p1', projectId: id, orderIndex: 0, url: pixel, previewUrl: pixel, originalFilename: 'A001.jpg' }],
      selectedIds: selected ? ['p1'] : [], photoStates: { p1: { color: liked ? ['red'] : [], comment } }, participantOpinions: {},
      participantDone: { red: false }, participantNicknames: { red: '소유자' }, shareToken: '', shareEnabled: true, exported: false,
      deliveryCount: 0, lastDeliveredAt: null, onlineParticipants: [], participantViews: {} });
    await page.route('**/api/**', async route => {
      const url = route.request().url();
      if (url.endsWith('/selections')) {
        const body = route.request().postDataJSON();
        if (++requests === 1) await new Promise(resolve => setTimeout(resolve, 700));
        if ('is_selected' in body) selected = body.is_selected;
        if (body.color_op) liked = body.color_op.add;
        if ('comment' in body) comment = body.comment;
        completed++;
        return route.fulfill({ json: { ok: true } });
      }
      if (url.endsWith('/sync')) return route.fulfill({ json: state() });
      if (url.endsWith(`/${id}`)) return route.fulfill({ json: { isOwner: true, project: state() } });
      return route.fulfill({ json: { ok: true } });
    });
    await page.goto(`/select/${id}/select`);
    const card = page.locator('[data-photo-id="p1"]');
    await expect(card).toBeVisible();
    if (field === 'selection') {
      await card.locator('.gl-check-box').click();
      await card.locator('.gl-check-box').click();
    } else if (field === 'like') {
      await card.hover();
      await card.getByRole('button', { name: '찜하기', exact: true }).click();
      await card.getByRole('button', { name: /^찜 해제/ }).click();
    } else {
      await card.click();
      const memo = page.getByRole('textbox', { name: '작가 전달 메모' });
      await memo.fill('첫 메모'); await memo.blur();
      await memo.fill('최종 메모'); await memo.blur();
    }
    await expect.poll(() => completed).toBe(2);
    expect(selected).toBe(false); expect(liked).toBe(false);
    if (field === 'comment') expect(comment).toBe('최종 메모');
    await page.reload();
    await expect(card).toBeVisible();
    if (field === 'comment') {
      await card.click();
      await expect(page.getByRole('textbox', { name: '작가 전달 메모' })).toHaveValue('최종 메모');
    } else if (field === 'like') {
      await card.hover();
      await expect(card.getByRole('button', { name: '찜하기', exact: true })).toBeVisible();
    } else {
      await expect(card).not.toHaveClass(/gl-selected/);
    }
  });
}
