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
import { Button, Input, Pill } from '@platform/ui';
import { useTerm } from './terminology.js';
import { workspaceClient, type WorkspaceClient } from './workspace-client.js';
import type { PublishedNoteResponse } from '../shared/index.js';

export interface LibraryScreenProps {
  /** The caller's active (Reader) org — engagement is attributed to it. */
  orgId: string;
  client?: WorkspaceClient;
}

/** Two-letter initials for an avatar, from a display name. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) {
    return '?';
  }
  const last = parts.length > 1 ? parts[parts.length - 1] : undefined;
  return `${first[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();
}

/** A readable published date; empty string if the timestamp is unparseable. */
function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(
        date,
      );
}

/** A round, token-styled initials avatar (decorative — labelled context is nearby). */
function Avatar({ label }: { label: string }): ReactElement {
  return (
    <span
      aria-hidden="true"
      className="grid h-9 w-9 flex-none place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-secondary)] font-mono text-xs font-semibold text-[var(--color-secondary-foreground)]"
    >
      {label}
    </span>
  );
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
    <section className="page-stack max-w-3xl">
      <header className="page-header">
        <div>
          <h1 className="text-lg font-semibold">Library</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Published {termPlural.toLowerCase()} from every writer, across the platform.
          </p>
        </div>
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
  const published = formatDate(note.publishedAt);
  return (
    <li className="rounded-[calc(var(--radius)+2px)] border border-[var(--color-border)] bg-[var(--color-card)] p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <Avatar label={initials(note.authorName)} />
        <p className="text-sm text-[var(--color-muted-foreground)]">by {note.authorName}</p>
        {published ? (
          <time className="ml-auto font-mono text-xs text-[var(--color-muted-foreground)]">
            {published}
          </time>
        ) : null}
      </div>

      <h2 className="mt-3 text-base font-semibold">{note.title}</h2>
      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-muted-foreground)]">
        {note.body}
      </p>

      <div className="mt-4 flex items-center gap-3 border-t border-[var(--color-border)] pt-3.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={`${open ? 'Close' : 'Open'} ${note.title}`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--color-primary)] hover:underline"
        >
          {open ? 'Hide discussion' : 'Read & discuss'}
        </button>
        <Pill variant="ok" dot={false} className="ml-auto">
          Published
        </Pill>
      </div>

      {open ? (
        <NoteEngagement orgId={orgId} noteId={note.id} title={note.title} client={client} />
      ) : null}
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
    <div className="mt-4 flex flex-col gap-4 border-t border-[var(--color-border)] pt-4">
      {engagementError ? (
        <p role="alert" className="text-sm text-[var(--color-destructive)]">
          {(engagementError as Error).message}
        </p>
      ) : null}

      <div>
        <button
          type="button"
          onClick={() => toggleLike.mutate()}
          disabled={toggleLike.isPending}
          aria-pressed={liked}
          aria-label={`${liked ? 'Unlike' : 'Like'} ${title}`}
          className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors disabled:opacity-50 ${
            liked
              ? 'border-[color-mix(in_srgb,var(--color-destructive)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-destructive)_12%,transparent)] text-[var(--color-destructive)]'
              : 'border-[var(--color-border)] bg-[var(--color-muted)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]'
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            fill={liked ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
            className="h-4 w-4"
          >
            <path d="M12 20s-7-4.35-9.5-8.5C.8 8.6 2.3 5.5 5.4 5.5c1.9 0 3.1 1 2.6 1 .6 0 1.7-1 3.6-1 3.1 0 4.6 3.1 2.9 6C19 15.65 12 20 12 20z" />
          </svg>
          <span className="tabular-nums">{likeCount}</span>
        </button>
      </div>

      <CommentList comments={comments.data ?? []} />
      <CommentForm pending={postComment.isPending} onSubmit={(body) => postComment.mutate(body)} />
    </div>
  );
}

interface CommentListProps {
  comments: { id: string; authorName: string; body: string }[];
}

function CommentList({ comments }: CommentListProps): ReactElement {
  if (comments.length === 0) {
    return <p className="text-xs text-[var(--color-muted-foreground)]">No comments yet.</p>;
  }
  return (
    <ul aria-label="Comments" className="flex flex-col gap-3">
      {comments.map((comment) => (
        <li key={comment.id} className="flex gap-3">
          <Avatar label={initials(comment.authorName)} />
          <div className="min-w-0">
            <p className="text-sm font-semibold">{comment.authorName}</p>
            <p className="mt-0.5 text-sm text-[var(--color-muted-foreground)]">{comment.body}</p>
          </div>
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
