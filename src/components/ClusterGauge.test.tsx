import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ClusterGauge from '@/components/ClusterGauge';

const readout = (c: HTMLElement) => c.querySelector('text[y="140"]')?.textContent ?? '';

describe('<ClusterGauge>', () => {
  it('shows the value, unit and label', () => {
    const { container } = render(<ClusterGauge label="Fuel" value={42} min={0} max={100} unit="%" />);
    expect(readout(container)).toBe('42%');
    expect(screen.getByText('Fuel')).toBeInTheDocument();
  });

  it('clamps the reading to [min, max]', () => {
    const { container, rerender } = render(<ClusterGauge label="Fuel" value={999} min={0} max={100} />);
    expect(readout(container)).toBe('100');
    rerender(<ClusterGauge label="Fuel" value={-50} min={0} max={100} />);
    expect(readout(container)).toBe('0');
  });

  it('shows one decimal on a narrow-range gauge', () => {
    const { container } = render(<ClusterGauge label="Trim" value={2.4} min={0} max={10} />);
    expect(readout(container)).toBe('2.4');
  });

  it('renders no slider when onChange is not provided (read-only display)', () => {
    render(<ClusterGauge label="RPM" value={1000} min={0} max={8000} />);
    expect(screen.queryByRole('slider')).toBeNull();
  });

  it('reports the new value via onChange when the slider moves', () => {
    const onChange = vi.fn();
    render(<ClusterGauge label="RPM" value={1000} min={0} max={8000} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('RPM'), { target: { value: '4000' } });
    expect(onChange).toHaveBeenCalledWith(4000);
  });

  it('disables the slider when disabled is set', () => {
    render(<ClusterGauge label="RPM" value={1000} min={0} max={8000} onChange={vi.fn()} disabled />);
    expect(screen.getByLabelText('RPM')).toBeDisabled();
  });
});
