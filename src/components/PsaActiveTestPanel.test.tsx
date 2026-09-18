import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderWithProviders, cleanup, screen, act, fireEvent } from '@/test/render';
import PsaActiveTestPanel from '@/components/PsaActiveTestPanel';

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

describe('PsaActiveTestPanel', () => {
  it('shows the offline notice and disables the confirmed button when not connected', () => {
    renderWithProviders(<PsaActiveTestPanel isConnected={false} sendMessage={vi.fn()} />, opts);
    expect(screen.getByTestId('psa-test-offline')).toBeInTheDocument();
    expect(screen.getByTestId('psa-test-confirmed')).toBeDisabled();
  });

  it('sends a diagnostic session-open probe to the BSI when Activate 0xC5 is clicked', async () => {
    vi.useFakeTimers();
    const sendMessage = vi.fn().mockResolvedValue(true);
    renderWithProviders(<PsaActiveTestPanel isConnected sendMessage={sendMessage} />, opts);

    await act(async () => { fireEvent.click(screen.getByTestId('psa-test-confirmed')); });

    expect(sendMessage).toHaveBeenCalled();
    // StartDiagnosticSession, manufacturer subfunction 0xC0 — the exact probe
    // the real BSI accepted in the capture (session.md, `10 C0` -> `50 C0`).
    expect(sendMessage.mock.calls[0][0]).toMatch(/^CANTx : 752 02 10 C0/);
  });

  it('sanitizes the candidate local-id input to at most 2 hex characters', () => {
    renderWithProviders(<PsaActiveTestPanel isConnected sendMessage={vi.fn()} />, opts);
    const input = screen.getByLabelText('Try local ID') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'zz12gg' } });
    expect(input.value).toBe('12');
  });

  it('does not attempt anything when the candidate field is not valid hex', () => {
    const sendMessage = vi.fn().mockResolvedValue(true);
    renderWithProviders(<PsaActiveTestPanel isConnected sendMessage={sendMessage} />, opts);
    const input = screen.getByLabelText('Try local ID') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Try' })).toBeDisabled();
  });
});
