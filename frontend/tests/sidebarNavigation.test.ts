import assert from 'node:assert/strict';
import test from 'node:test';

test('email marketing exposes only campaigns and templates in the sidebar', async () => {
  const { sidebarSections } = await import(
    '../src/navigation/sidebarNavigation.ts'
  );

  const emailMarketing = sidebarSections.find(
    (section) => section.title === 'Email Marketing',
  );

  assert.deepEqual(emailMarketing?.items, [
    { text: 'Email campaigns', icon: 'email', path: '/email-sender' },
    { text: 'Templates', icon: 'templates', path: '/templates' },
  ]);
});
