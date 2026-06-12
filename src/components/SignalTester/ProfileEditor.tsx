"use client";

import React, { useRef, useEffect } from 'react';
import { ProfilePoint, ServerProfile } from '@/hooks/useProfileManagement';

interface ProfileEditorProps {
  profiles: ServerProfile[];
  activeProfile: ProfilePoint[];
  selectedProfileId: string | null;
  isLoadingProfiles: boolean;
  editingPoint: number | null;
  maxFrequency: number;
  onLoadProfile: (id: string) => void;
  onSaveProfile: () => void;
  onAddPoint: () => void;
  onRemovePoint: () => void;
  onCanvasClick: (e: React.MouseEvent<HTMLCanvasElement>) => void;
}

export default function ProfileEditor({
  profiles, activeProfile, selectedProfileId, isLoadingProfiles,
  editingPoint, maxFrequency,
  onLoadProfile, onSaveProfile, onAddPoint, onRemovePoint, onCanvasClick,
}: ProfileEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = rect.width  * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const W = rect.width, H = rect.height;

    // Theme-aware colors
    const dark = document.documentElement.classList.contains('dark');
    const bgColor     = dark ? '#1c1c1e' : '#ffffff';
    const gridColor   = dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
    const axisColor   = dark ? 'rgba(255,255,255,0.2)'  : 'rgba(0,0,0,0.25)';
    const labelColor  = dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.4)';
    const lineColor   = '#0a84ff';
    const pointColor  = '#0a84ff';
    const selectColor = '#ff453a';

    const mL = 32, mR = 12, mT = 12, mB = 26;
    const pW = W - mL - mR, pH = H - mT - mB;
    const tx = (t: number) => mL + (t / 15) * pW;
    const ty = (f: number) => mT + pH - (f / maxFrequency) * pH;

    // Background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      ctx.beginPath(); ctx.moveTo(tx(i * 3), mT); ctx.lineTo(tx(i * 3), mT + pH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mL, ty(i * maxFrequency / 5)); ctx.lineTo(mL + pW, ty(i * maxFrequency / 5)); ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = axisColor; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(mL, mT); ctx.lineTo(mL, mT + pH + 1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(mL - 1, mT + pH); ctx.lineTo(mL + pW, mT + pH); ctx.stroke();

    // Labels
    ctx.fillStyle = labelColor;
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i <= 5; i++) {
      ctx.fillText(`${i * 3}s`, tx(i * 3), mT + pH + 16);
    }
    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
      ctx.fillText(`${Math.round(i * maxFrequency / 5)}`, mL - 5, ty(i * maxFrequency / 5) + 3);
    }

    // Profile line
    if (activeProfile.length > 0) {
      const sorted = [...activeProfile].sort((a, b) => a.time - b.time);
      ctx.strokeStyle = lineColor; ctx.lineWidth = 2;
      ctx.beginPath();
      sorted.forEach((pt, i) => {
        i === 0 ? ctx.moveTo(tx(pt.time), ty(pt.frequency)) : ctx.lineTo(tx(pt.time), ty(pt.frequency));
      });
      ctx.stroke();

      // Points
      sorted.forEach((pt, i) => {
        const x = tx(pt.time), y = ty(pt.frequency);
        const isSelected = i === editingPoint;
        ctx.fillStyle = isSelected ? selectColor : pointColor;
        ctx.beginPath(); ctx.arc(x, y, isSelected ? 6 : 4, 0, 2 * Math.PI); ctx.fill();
        if (isSelected) {
          ctx.fillStyle = labelColor;
          ctx.font = 'bold 9px Inter, system-ui, sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(`${pt.time.toFixed(1)}s, ${pt.frequency}Hz`, x + 9, y - 6);
        }
      });
    }
  }, [activeProfile, editingPoint, maxFrequency]);

  return (
    <div className="mt-6 pt-6 border-t border-border">
      <h3 className="text-sm font-semibold text-text-primary mb-4">Test Profile Editor</h3>

      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <select
            value={selectedProfileId || ''}
            onChange={e => onLoadProfile(e.target.value)}
            disabled={isLoadingProfiles}
            className="input-field text-xs py-1.5 w-auto"
          >
            {isLoadingProfiles ? <option>Loading…</option>
              : profiles.length === 0 ? <option>No profiles</option>
              : profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button onClick={onSaveProfile} className="btn-success text-xs py-1.5 px-3">Save</button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onAddPoint} className="btn-primary text-xs py-1.5 px-3">Add Point</button>
          <button onClick={onRemovePoint} disabled={editingPoint === null || activeProfile.length <= 2}
            className="btn-danger text-xs py-1.5 px-3 disabled:opacity-40">Remove</button>
        </div>
      </div>

      <div className="relative w-full h-56 border border-border bg-card rounded-xl overflow-hidden">
        <canvas ref={canvasRef} className="w-full h-full cursor-crosshair" onClick={onCanvasClick} />
      </div>

      <p className="text-[10px] text-text-tertiary mt-2">
        Click a point to select it, then click elsewhere to move it. Click empty space to add a point. X: time (0–15s) · Y: frequency (0–{maxFrequency}Hz)
      </p>
    </div>
  );
}
