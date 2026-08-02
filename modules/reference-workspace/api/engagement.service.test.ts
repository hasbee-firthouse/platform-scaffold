import { describe, expect, it } from 'vitest';
import { addComment, deleteOwnComment, likeNote, unlikeNote } from './engagement.service.js';
import { makeEngagementRepo, makeShelfRepo } from './test-support.js';
import type { PublishedNoteRecord } from './shelf-repository.js';

const NOTE_ID = '11111111-1111-1111-1111-111111111111';
const reader = { userId: 'reader-1', readerOrgId: 'org-reader' };

function publishedNote(): PublishedNoteRecord {
  return {
    id: NOTE_ID,
    writerOrgId: 'org-writer',
    spaceId: '22222222-2222-2222-2222-222222222222',
    title: 'Hi',
    body: 'body',
    authorId: 'author',
    publishedAt: new Date('2026-07-16T00:00:00.000Z'),
  };
}

function makeDeps(published = true) {
  const engagement = makeEngagementRepo();
  const shelf = makeShelfRepo(published ? [publishedNote()] : []);
  return { engagement, shelf, deps: { engagement, shelf } };
}

describe('engagement service — likes (§9.x)', () => {
  it('likes a published note and is idempotent', async () => {
    const { engagement, deps } = makeDeps();
    await likeNote(deps, NOTE_ID, reader);
    await likeNote(deps, NOTE_ID, reader);
    expect(engagement.likes).toHaveLength(1);
    expect(await engagement.countLikes(NOTE_ID)).toBe(1);
  });

  it('unlikes a note', async () => {
    const { engagement, deps } = makeDeps();
    await likeNote(deps, NOTE_ID, reader);
    await unlikeNote(deps, NOTE_ID, reader.userId);
    expect(engagement.likes).toHaveLength(0);
  });

  it('404s liking a note that is not published', async () => {
    const { deps } = makeDeps(false);
    await expect(likeNote(deps, NOTE_ID, reader)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('engagement service — comments (§9.x)', () => {
  it('adds a comment to a published note', async () => {
    const { engagement, deps } = makeDeps();
    const comment = await addComment(deps, NOTE_ID, reader, 'Nice write-up');
    expect(comment.body).toBe('Nice write-up');
    expect(comment.readerOrgId).toBe('org-reader');
    expect(engagement.comments).toHaveLength(1);
  });

  it('404s commenting on an unpublished note', async () => {
    const { deps } = makeDeps(false);
    await expect(addComment(deps, NOTE_ID, reader, 'x')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('lets the author delete their own comment', async () => {
    const { engagement, deps } = makeDeps();
    const comment = await addComment(deps, NOTE_ID, reader, 'Mine');
    await deleteOwnComment(deps, comment.id, reader.userId);
    expect(engagement.comments).toHaveLength(0);
  });

  it("403s deleting someone else's comment (self-scoped)", async () => {
    const { deps } = makeDeps();
    const comment = await addComment(deps, NOTE_ID, reader, 'Mine');
    await expect(deleteOwnComment(deps, comment.id, 'intruder')).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('404s deleting a missing comment', async () => {
    const { deps } = makeDeps();
    await expect(deleteOwnComment(deps, 'missing', reader.userId)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
