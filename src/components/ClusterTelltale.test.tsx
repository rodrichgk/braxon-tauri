import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import ClusterTelltale from '@/components/ClusterTelltale';

describe('<ClusterTelltale>', () => {
  it('renders the label and reflects the active state via aria-pressed', () => {
    render(<ClusterTelltale label="handbrake" active={false} icon={ExclamationTriangleIcon} />);
    const btn = screen.getByRole('button', { name: 'handbrake' });
    expect(btn).toHaveAttribute('aria-pressed', 'false');
  });

  it('toggles on click and calls onToggle', async () => {
    const onToggle = vi.fn();
    render(<ClusterTelltale label="handbrake" active icon={ExclamationTriangleIcon} onToggle={onToggle} />);
    const btn = screen.getByRole('button', { name: 'handbrake' });
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(btn);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('is disabled when disabled is set', () => {
    render(<ClusterTelltale label="handbrake" active={false} disabled icon={ExclamationTriangleIcon} onToggle={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'handbrake' })).toBeDisabled();
  });
});
