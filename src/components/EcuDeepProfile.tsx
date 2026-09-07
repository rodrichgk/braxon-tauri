/* ── Deep ECU profile ─────────────────────────────────────────────────────
   Given a known (sendId, recvId), enumerate what the ECU exposes with no prior
   database: sessions, services, raw DTCs, security levels, and (opt-in, slow)
   the 22-DID and 31-03-routine sweeps. Everything here is read-only — see the
   safety note in lib/ecuDiscovery.ts. Meant for reverse-engineering a new ABS
   reference on the bench; the JSON dump is the thing to keep / import later. */
import { useRef, useState } from 'react';
import { MagnifyingGlassIcon, StopIcon, ClipboardDocumentIcon } from '@heroicons/react/24/outline';
import type { SendFn } from '@/lib/isotp';
import { profileEcu, type EcuProfile } from '@/lib/ecuDiscovery';

interface Props {
  isConnected: boolean;
  send: SendFn;
  sendId: number;
  recvId: number;
}

const h4 = (n: number) => n.toString(16).toUpperCase().padStart(4, '0');
const h2 = (n: number) => n.toString(16).toUpperCase().padStart(2, '0');
const bytesHex = (b: number[]) => b.map(h2).join(' ');

export default function EcuDeepProfile({ isConnected, send, sendId, recvId }: Props) {
  const [state, setState] = useState<'idle' | 'running' | 'done'>('idle');
  const [profile, setProfile] = useState<EcuProfile | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0, label: '' });
  const [didSweep, setDidSweep] = useState(false);
  const [routineSweep, setRoutineSweep] = useState(false);
  const [copied, setCopied] = useState(false);
  const cancelRef = useRef(false);
  const sendRef = useRef(send);
  sendRef.current = send;

  const run = async () => {
    cancelRef.current = false;
    setState('running');
    setProfile(null);
    setProgress({ done: 0, total: 0, label: 'sessions' });
    const p = await profileEcu({
      send: (m) => sendRef.current(m),
      sendId,
      recvIds: [recvId],
      isCancelled: () => cancelRef.current,
      onProgress: (done, total, label) => setProgress({ done, total, label }),
      doDidSweep: didSweep,
      doRoutineSweep: routineSweep,
    });
    setProfile(p);
    setState('done');
  };

  const copyJson = () => {
    if (!profile) return;
    navigator.clipboard.writeText(JSON.stringify(profile, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="mt-1.5 border border-border rounded-lg bg-app/60 px-2 py-1.5 text-[10px]">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="font-semibold text-text-secondary">Deep profile</span>
        <span className="font-mono text-text-tertiary">0x{h4(sendId)}→0x{h4(recvId)}</span>

        <label className="flex items-center gap-1 text-text-tertiary ml-1">
          <input type="checkbox" checked={didSweep} onChange={e => setDidSweep(e.target.checked)}
            disabled={state === 'running'} className="accent-accent" />
          22-DID sweep
        </label>
        <label className="flex items-center gap-1 text-text-tertiary">
          <input type="checkbox" checked={routineSweep} onChange={e => setRoutineSweep(e.target.checked)}
            disabled={state === 'running'} className="accent-accent" />
          31-03 routine sweep
        </label>

        {state !== 'running' ? (
          <button onClick={run} disabled={!isConnected}
            className="flex items-center gap-1 font-semibold px-2 py-1 rounded-lg border text-accent hover:bg-accent/10 border-accent/30 disabled:opacity-50 ml-auto">
            <MagnifyingGlassIcon className="w-3 h-3" />
            {state === 'done' ? 'Re-run' : 'Enumerate'}
          </button>
        ) : (
          <button onClick={() => { cancelRef.current = true; }}
            className="flex items-center gap-1 font-semibold px-2 py-1 rounded-lg border text-danger hover:bg-danger/10 border-danger/30 ml-auto">
            <StopIcon className="w-3 h-3" /> Stop
          </button>
        )}
      </div>

      {state === 'running' && (
        <div className="mt-1.5">
          <div className="h-1 bg-border rounded overflow-hidden">
            <div className="h-full bg-accent transition-all"
              style={{ width: progress.total ? `${(progress.done / progress.total) * 100}%` : '15%' }} />
          </div>
          <p className="text-text-tertiary mt-1 font-mono truncate">
            {progress.label} {progress.total ? `(${progress.done}/${progress.total})` : ''}
          </p>
        </div>
      )}

      {state !== 'running' && !isConnected && (
        <p className="text-text-tertiary mt-1">Connect to the ECU first.</p>
      )}

      {profile && (
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-text-secondary">
              protocol <span className="font-mono text-text-primary">{profile.protocol}</span>
            </span>
            {profile.workingSession != null && (
              <span className="text-text-secondary">
                session <span className="font-mono text-text-primary">10 {h2(profile.workingSession)}</span>
              </span>
            )}
            <button onClick={copyJson}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-border text-text-tertiary hover:text-text-secondary ml-auto">
              <ClipboardDocumentIcon className="w-3 h-3" />{copied ? 'Copied' : 'Copy JSON'}
            </button>
          </div>

          <Section title={`Sessions (${profile.sessions.length})`}>
            {profile.sessions.map(s => (
              <span key={s.sub} className={[
                'font-mono px-1 py-0.5 rounded border mr-1 mb-1 inline-block',
                s.open ? 'text-success border-success/30 bg-success/5'
                       : 'text-warning border-warning/30 bg-warning/5',
              ].join(' ')}>
                10 {h2(s.sub)}{s.open ? '' : ` (7F ${h2(s.nrc ?? 0)})`}
                {s.p2Ms ? ` · P2 ${s.p2Ms}ms` : ''}
              </span>
            ))}
          </Section>

          <Section title={`Services (${profile.services.filter(s => s.supported).length} supported)`}>
            {profile.services.filter(s => s.supported).map(s => (
              <span key={s.sid} className="font-mono text-text-secondary mr-2 mb-0.5 inline-block">
                {h2(s.sid)} {s.name}{s.worked ? '' : ` (7F ${h2(s.nrc ?? 0)})`}
              </span>
            ))}
          </Section>

          <Section title={
            profile.dtcRead
              ? `DTCs via ${profile.dtcRead.request} (${profile.dtcRead.dtcs.length})`
              : 'DTCs — no read service answered'
          }>
            {profile.dtcRead?.dtcs.map((d, i) => (
              <div key={i} className="font-mono text-text-secondary">
                {bytesHex(d.bytes)} · <span className="text-text-primary">{d.code}</span> · st {h2(d.status)} · {d.text}
              </div>
            ))}
          </Section>

          {profile.security.length > 0 && (
            <Section title={`Security levels (${profile.security.length})`}>
              {profile.security.map(s => (
                <span key={s.level} className="font-mono text-text-secondary mr-2">
                  27 {h2(s.level)} · seed {s.seed.length}B{s.alreadyUnlocked ? ' (already unlocked / none)' : ''}
                </span>
              ))}
            </Section>
          )}

          {profile.routines.length > 0 && (
            <Section title={`Routines answering 31 03 (${profile.routines.length})`}>
              {profile.routines.map(r => (
                <span key={r.rid} className="font-mono text-text-secondary mr-2 mb-0.5 inline-block">
                  {h4(r.rid)}{r.status != null ? ` (st ${h2(r.status)})` : ' (needs 31 01)'}
                </span>
              ))}
            </Section>
          )}

          {profile.dids.length > 0 && (
            <Section title={`DIDs answering 22 (${profile.dids.length})`}>
              {profile.dids.map(d => (
                <div key={d.did} className="font-mono text-text-secondary truncate">
                  {h4(d.did)}: {d.ascii ? `"${d.ascii}"` : bytesHex(d.bytes.slice(0, 16))}
                  {d.bytes.length > 16 ? ` …(${d.bytes.length}B)` : ''}
                </div>
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-text-tertiary font-semibold mb-0.5">{title}</p>
      <div className="pl-1 leading-relaxed">{children}</div>
    </div>
  );
}
