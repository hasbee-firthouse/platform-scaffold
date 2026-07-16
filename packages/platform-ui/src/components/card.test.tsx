// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from './card.js';

afterEach(cleanup);

describe('Card', () => {
  it('renders a titled surface with header, body, and footer content', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardBody>Three people belong to this organization.</CardBody>
        <CardFooter>Updated moments ago</CardFooter>
      </Card>,
    );

    expect(screen.getByRole('heading', { name: 'Members' })).toBeInTheDocument();
    expect(screen.getByText('Three people belong to this organization.')).toBeInTheDocument();
    expect(screen.getByText('Updated moments ago')).toBeInTheDocument();
  });

  it('draws its surface from theme tokens rather than literal colors', () => {
    render(<Card data-testid="surface">Panel</Card>);

    expect(screen.getByTestId('surface').className).toContain('bg-[var(--color-background)]');
  });
});
