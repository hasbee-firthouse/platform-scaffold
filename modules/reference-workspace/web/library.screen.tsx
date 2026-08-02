/**
 * The Reader-side LIBRARY screen (Step 5): a cross-org feed of notes published by
 * any Writer org (the shared plane, §9.x). Each note expands to show engagement —
 * a like toggle and comments — driven by the injectable {@link WorkspaceClient}.
 * Liking/commenting act in the caller's Reader org (`orgId`), so the API enforces
 * the Reader (may like) vs Commenter (may also comment) roles.
 *
 * Prop-driven and standalone like the other module screens; module nouns render
 * through {@link useTerm} and styling is token-only (no literal colors).
 */
import { useState, type FormEvent, type ReactElement } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Input } from '@platform/ui';
import { useTerm } from './terminology.js';
import { workspaceClient, type WorkspaceClient } from './workspace-client.js';
import type { PublishedNoteResponse } from '../shared/index.js';

export interface LibraryScreenProps {
  /** The caller's active (Reader) org — engagement is attributed to it. */
  orgId: string;
  client?: WorkspaceClient;
}

/** The library feed: every published note, each expandable to engage. */
export function LibraryScreen({ orgId, client = workspaceClient }: LibraryScreenProps): ReactElement {
  const termPlural = useTerm('task', { plural: true, capital: true });
  const [openId, setOpenId] = useState<string | null>(null);

  const feed = useQuery({
    queryKey: ['library'],
    queryFn: () => client.listLibrary(),
  });
  const notes = feed.data ?? [];

  return (
    <section className="page-stack">
      <header className="page-header">
        <h1 className="text-lg font-semibold">Library</h1>
      </header>

      {feed.isLoading ? <p role="status">Loading…</p> : null}
      {!feed.isLoading && notes.length === 0 ? (
        <p role="status">No published {termPlural.toLowerCase()} yet.</p>
      ) : null}

      <ul className="flex flex-col gap-4">
        {notes.map((note) => (
          <LibraryCard
            key={note.id}
            orgId={orgId}
            note={note}
            client={client}
            open={openId === note.id}
            onToggle={() => setOpenId(openId === note.id ? null : note.id)}
          />
        ))}
      </ul>
    </section>
  );
}

interface LibraryCardProps {
  orgId: string;
  note: PublishedNoteResponse;
  client: WorkspaceClient;
  open: boolean;
  onToggle: () => void;
}

function LibraryCard({ orgId, note, client, open, onToggle }: LibraryCardProps): ReactElement {
  return (
    <li className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-background)] p-4">
      <h2 className="text-base font-semibold">{note.title}</h2>
      <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--color-foreground)]">{note.body}</p>
      <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">by {note.authorId}</p>
      <Button variant="ghost" size="sm" onClick={onToggle} aria-expanded={open}>
        {open ? 'Close' : 'Open'} {note.title}
      </Button>
      {open ? <NoteEngagement orgId={orgId} noteId={note.id} title={note.title} client={client} /> : null}
    </li>
  );
}

interface NoteEngagementProps {
  orgId: string;
  noteId: string;
  title: string;
  client: WorkspaceClient;
}

/** The like toggle + comments for one opened note. */
function NoteEngagement({ orgId, noteId, title, client }: NoteEngagementProps): ReactElement {
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: ['library', noteId, 'detail'],
    queryFn: () => client.getLibraryNote(noteId),
  });
  const comments = useQuery({
    queryKey: ['library', noteId, 'comments'],
    queryFn: () => client.listComments(noteId),
  });

  const liked = detail.data?.likedByMe ?? false;
  const likeCount = detail.data?.likeCount ?? 0;

  const toggleLike = useMutation({
    mutationFn: () => (liked ? client.unlikeNote(orgId, noteId) : client.likeNote(orgId, noteId)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['library', noteId, 'detail'] }),
  });
  const postComment = useMutation({
    mutationFn: (body: string) => client.addComment(orgId, noteId, body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['library', noteId, 'comments'] }).then(() => undefined),
  });

  const engagementError = toggleLike.error ?? postComment.error;

  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-[var(--color-border)] pt-3">
      {engagementError ? (
        <p role="alert" className="text-sm text-[var(--color-destructive)]">
          {(engagementError as Error).message}
        </p>
      ) : null}

      <Button
        variant="ghost"
        size="sm"
        onClick={() => toggleLike.mutate()}
        disabled={toggleLike.isPending}
      >
        {liked ? 'Unlike' : 'Like'} {title} ({likeCount})
      </Button>

      <CommentList comments={comments.data ?? []} />
      <CommentForm pending={postComment.isPending} onSubmit={(body) => postComment.mutate(body)} />
    </div>
  );
}

interface CommentListProps {
  comments: { id: string; userId: string; body: string }[];
}

function CommentList({ comments }: CommentListProps): ReactElement {
  if (comments.length === 0) {
    return <p className="text-xs text-[var(--color-muted-foreground)]">No comments yet.</p>;
  }
  return (
    <ul aria-label="Comments" className="flex flex-col gap-2">
      {comments.map((comment) => (
        <li key={comment.id} className="text-sm">
          <span className="text-[var(--color-muted-foreground)]">{comment.userId}:</span> {comment.body}
        </li>
      ))}
    </ul>
  );
}

interface CommentFormProps {
  pending: boolean;
  onSubmit: (body: string) => void;
}

function CommentForm({ pending, onSubmit }: CommentFormProps): ReactElement {
  const [body, setBody] = useState('');

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmed = body.trim();
    if (trimmed.length === 0) {
      return;
    }
    onSubmit(trimmed);
    setBody('');
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2" aria-label="Add comment">
      <Input
        aria-label="New comment"
        placeholder="Add a comment"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        required
      />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Posting…' : 'Comment'}
      </Button>
    </form>
  );
}
