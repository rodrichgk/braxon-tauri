import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderWithProviders, cleanup, screen, act, fireEvent, waitFor } from '@/test/render';
import ClusterBenchDashboard from '@/components/ClusterBenchDashboard';

const opts = {
  user: { id: 'u1', name: 'Tech', role: 'technicien' as const },
  tauri: {
    get_serial_ports: () => [],
    get_pico_port: () => null,
  },
  language: 'en' as const,
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('ClusterBenchDashboard', () => {
  it('shows the offline notice and disables Start when not connected', () => {
    renderWithProviders(<ClusterBenchDashboard isConnected={false} sendMessage={vi.fn()} />, opts);
    expect(screen.getByTestId('cluster-bench-offline')).toBeInTheDocument();
    expect(screen.getByTestId('cluster-bench-toggle')).toBeDisabled();
  });

  it('renders the demo profile frames by id', () => {
    renderWithProviders(<ClusterBenchDashboard isConnected sendMessage={vi.fn()} />, opts);
    expect(screen.getByText(/ID 0x520/)).toBeInTheDocument();
    expect(screen.getByText(/ID 0x521/)).toBeInTheDocument();
  });

  it('transmits the periodic frames as soon as Start is clicked', async () => {
    vi.useFakeTimers();
    const sendMessage = vi.fn().mockResolvedValue(true);
    renderWithProviders(<ClusterBenchDashboard isConnected sendMessage={sendMessage} />, opts);

    await act(async () => { fireEvent.click(screen.getByTestId('cluster-bench-toggle')); });
    await act(async () => { await vi.advanceTimersByTimeAsync(60); }); // past one 50ms tick

    expect(sendMessage).toHaveBeenCalled();
    expect(sendMessage.mock.calls[0][0]).toMatch(/^CANTx : 520 /);
    expect(sendMessage.mock.calls.some(c => String(c[0]).startsWith('CANTx : 521 '))).toBe(true);
  });

  it('stops transmitting once Stop is clicked', async () => {
    vi.useFakeTimers();
    const sendMessage = vi.fn().mockResolvedValue(true);
    renderWithProviders(<ClusterBenchDashboard isConnected sendMessage={sendMessage} />, opts);

    await act(async () => { fireEvent.click(screen.getByTestId('cluster-bench-toggle')); }); // start
    await act(async () => { await vi.advanceTimersByTimeAsync(60); });
    await act(async () => { fireEvent.click(screen.getByTestId('cluster-bench-toggle')); }); // stop
    sendMessage.mockClear();

    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('sends immediately when a gauge value changes while running', async () => {
    vi.useFakeTimers();
    const sendMessage = vi.fn().mockResolvedValue(true);
    renderWithProviders(<ClusterBenchDashboard isConnected sendMessage={sendMessage} />, opts);

    await act(async () => { fireEvent.click(screen.getByTestId('cluster-bench-toggle')); });
    await act(async () => { await vi.advanceTimersByTimeAsync(60); }); // drain the initial burst
    sendMessage.mockClear();

    const fuelSlider = screen.getByLabelText('Fuel');
    await act(async () => { fireEvent.change(fuelSlider, { target: { value: '50' } }); });

    expect(sendMessage.mock.calls.some(c => String(c[0]).startsWith('CANTx : 520 '))).toBe(true);
  });

  it('does nothing when a gauge value changes while stopped', () => {
    const sendMessage = vi.fn().mockResolvedValue(true);
    renderWithProviders(<ClusterBenchDashboard isConnected sendMessage={sendMessage} />, opts);
    const fuelSlider = screen.getByLabelText('Fuel');
    fireEvent.change(fuelSlider, { target: { value: '50' } });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('hides a signal from the main view once unchecked in Customize, and restores it when re-checked', () => {
    renderWithProviders(<ClusterBenchDashboard isConnected sendMessage={vi.fn()} />, opts);
    expect(screen.getByLabelText('Fuel')).toBeInTheDocument();

    // The gauges frame (0x520) is the first "Customize" button on the page.
    fireEvent.click(screen.getAllByRole('button', { name: /customize/i })[0]);
    const fuelCheckbox = screen.getByRole('checkbox', { name: 'Fuel' });
    expect(fuelCheckbox).toBeChecked();
    fireEvent.click(fuelCheckbox);

    fireEvent.click(screen.getByRole('button', { name: /done/i }));
    expect(screen.queryByLabelText('Fuel')).toBeNull();
    // The other three gauges in the same frame stay visible.
    expect(screen.getByLabelText('RPM')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /customize/i })[0]);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Fuel' }));
    fireEvent.click(screen.getByRole('button', { name: /done/i }));
    expect(screen.getByLabelText('Fuel')).toBeInTheDocument();
  });

  it('fetches the Postgres-backed signal catalog on mount', async () => {
    const { tauriCalls } = renderWithProviders(<ClusterBenchDashboard isConnected sendMessage={vi.fn()} />, {
      ...opts,
      tauri: { ...opts.tauri, get_cluster_bench_catalog: () => [] },
    });
    await waitFor(() => {
      expect(tauriCalls.some(c => c.cmd === 'get_cluster_bench_catalog')).toBe(true);
    });
  });

  it('prefers the DB-provided unit over the hardcoded fallback once the catalog loads', async () => {
    const { container } = renderWithProviders(<ClusterBenchDashboard isConnected sendMessage={vi.fn()} />, {
      ...opts,
      tauri: {
        ...opts.tauri,
        get_cluster_bench_catalog: () => [
          { name: 'fuel_pct', kind: 'gauge', category: 'gauge', unit: 'L', iconKey: null, sortOrder: 0 },
        ],
      },
    });
    await waitFor(() => {
      expect(container.querySelector('tspan')?.textContent).toBe('L');
    });
  });

  it('shows a placeholder once every signal in a frame is hidden', () => {
    renderWithProviders(<ClusterBenchDashboard isConnected sendMessage={vi.fn()} />, opts);
    fireEvent.click(screen.getAllByRole('button', { name: /customize/i })[0]);
    for (const name of ['Fuel', 'Coolant', 'RPM', 'Speed']) {
      fireEvent.click(screen.getByRole('checkbox', { name }));
    }
    fireEvent.click(screen.getByRole('button', { name: /done/i }));
    expect(screen.getByText(/nothing enabled for this test/i)).toBeInTheDocument();
  });
});
