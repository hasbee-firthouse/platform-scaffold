// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table.js';

afterEach(cleanup);

describe('Table', () => {
  it('renders column headers and body rows in a semantic table', () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead>Role</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Priya Raghavan</TableCell>
            <TableCell>owner</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Member' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Priya Raghavan' })).toBeInTheDocument();
  });

  it('draws hairline borders from theme tokens', () => {
    render(
      <Table data-testid="grid">
        <TableBody>
          <TableRow>
            <TableCell>Marcus Bello</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    expect(screen.getByRole('cell', { name: 'Marcus Bello' }).className).toContain(
      'border-[var(--color-border)]',
    );
  });
});
