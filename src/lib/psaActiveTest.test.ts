import { describe, it, expect } from 'vitest';
import {
  buildActiveTestStart,
  buildActiveTestKeepAlive,
  buildActiveTestStop,
  PSA_BSI_SEND_ID,
  CONFIRMED_LOCAL_ID,
} from '@/lib/psaActiveTest';

// Every expected string here is copied verbatim from
// "Peugeot 207 CAN BSI Log_1.txt" (see reference-data/peugeot-207-bsi-commodo-can.md)
// — real bus traffic, not a guess. In particular the DLC is never padded to
// 8, unlike isotp.ts's buildFrame/buildSingleFrame.

describe('buildActiveTestStart', () => {
  it('matches the capture exactly (line 255, t=88.086s: n=0x09)', () => {
    expect(buildActiveTestStart(0xc5, 0x09)).toBe('CANTx : 752 06 30 C5 00 09 06 01\n');
  });

  it('matches a later activation with a different n (line 397, t=111.05s: n=0x08)', () => {
    expect(buildActiveTestStart(0xc5, 0x08)).toBe('CANTx : 752 06 30 C5 00 08 06 01\n');
  });

  it('defaults n when not given', () => {
    expect(buildActiveTestStart(0xc5)).toBe('CANTx : 752 06 30 C5 00 0A 06 01\n');
  });
});

describe('buildActiveTestKeepAlive', () => {
  it('matches the capture exactly (line 257, t=88.399s)', () => {
    expect(buildActiveTestKeepAlive(0xc5)).toBe('CANTx : 752 03 30 C5 01\n');
  });
});

describe('buildActiveTestStop', () => {
  it('matches the capture exactly (line 490, t=120.774s)', () => {
    expect(buildActiveTestStop(0xc5)).toBe('CANTx : 752 03 30 C5 11\n');
  });
});

describe('constants', () => {
  it('sends to the BSI request id, and the confirmed local id is 0xC5', () => {
    expect(PSA_BSI_SEND_ID).toBe(0x752);
    expect(CONFIRMED_LOCAL_ID).toBe(0xc5);
  });
});

describe('an untested candidate local id', () => {
  it('builds the same shape frame for any local id, not just the confirmed one', () => {
    expect(buildActiveTestStart(0xc6, 0x0a)).toBe('CANTx : 752 06 30 C6 00 0A 06 01\n');
    expect(buildActiveTestStop(0xc6)).toBe('CANTx : 752 03 30 C6 11\n');
  });
});
