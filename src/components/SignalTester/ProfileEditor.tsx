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
  onLoadProfile: (profileId: string) => void;
  onSaveProfile: () => void;
  onAddPoint: () => void;
  onRemovePoint: () => void;
  onCanvasClick: (e: React.MouseEvent<HTMLCanvasElement>) => void;
}

export default function ProfileEditor({
  profiles,
  activeProfile,
  selectedProfileId,
  isLoadingProfiles,
  editingPoint,
  maxFrequency,
  onLoadProfile,
  onSaveProfile,
  onAddPoint,
  onRemovePoint,
  onCanvasClick,
}: ProfileEditorProps) {
  const profileCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = profileCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const width = rect.width;
    const height = rect.height;

    const margin = {
      left: 30,
      right: 20,
      top: 20,
      bottom: 30
    };

    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.beginPath();

    // Vertical grid lines (time)
    for (let i = 0; i <= 15; i += 3) {
      const x = margin.left + (i / 15) * plotWidth;
      ctx.moveTo(x, margin.top);
      ctx.lineTo(x, height - margin.bottom);
    }

    // Horizontal grid lines (frequency)
    for (let i = 0; i <= maxFrequency; i += maxFrequency / 5) {
      const y = margin.top + plotHeight - (i / maxFrequency) * plotHeight;
      ctx.moveTo(margin.left, y);
      ctx.lineTo(width - margin.right, y);
    }
    ctx.stroke();

    // Draw axes
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(margin.left, margin.top);
    ctx.lineTo(margin.left, height - margin.bottom);
    ctx.lineTo(width - margin.right, height - margin.bottom);
    ctx.stroke();

    // Draw axis labels
    ctx.fillStyle = '#374151';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';

    // X-axis labels (time)
    for (let i = 0; i <= 15; i += 3) {
      const x = margin.left + (i / 15) * plotWidth;
      ctx.fillText(`${i}s`, x, height - 10);
    }

    // Y-axis labels (frequency)
    ctx.textAlign = 'right';
    for (let i = 0; i <= maxFrequency; i += maxFrequency / 5) {
      const y = margin.top + plotHeight - (i / maxFrequency) * plotHeight;
      ctx.fillText(`${i}Hz`, margin.left - 5, y + 4);
    }

    // Draw profile line
    if (activeProfile.length > 0) {
      const sortedProfile = [...activeProfile].sort((a, b) => a.time - b.time);

      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.beginPath();

      sortedProfile.forEach((point, index) => {
        const x = margin.left + (point.time / 15) * plotWidth;
        const y = margin.top + plotHeight - (point.frequency / maxFrequency) * plotHeight;

        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();

      // Draw points
      sortedProfile.forEach((point, index) => {
        const x = margin.left + (point.time / 15) * plotWidth;
        const y = margin.top + plotHeight - (point.frequency / maxFrequency) * plotHeight;

        ctx.fillStyle = index === editingPoint ? '#ef4444' : '#3b82f6';
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, 2 * Math.PI);
        ctx.fill();

        // Draw point info
        if (index === editingPoint) {
          ctx.fillStyle = '#374151';
          ctx.font = 'bold 10px sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(`${point.time.toFixed(1)}s, ${point.frequency}Hz`, x + 8, y - 8);
        }
      });
    }
  }, [activeProfile, editingPoint, maxFrequency]);

  return (
    <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
      <h3 className="text-base font-semibold text-slate-800 dark:text-white mb-4">Test Profile Editor</h3>
      <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-3">
        <div className="flex items-center">
          <select
            className="input-field block w-full sm:w-auto text-sm mr-3"
            value={selectedProfileId || ''}
            onChange={(e) => onLoadProfile(e.target.value)}
            disabled={isLoadingProfiles}
          >
            {isLoadingProfiles ? (
              <option>Loading profiles...</option>
            ) : profiles.length === 0 ? (
              <option>No profiles available</option>
            ) : (
              profiles.map(profile => (
                <option key={profile.id} value={profile.id}>{profile.name}</option>
              ))
            )}
          </select>
          <button
            onClick={onSaveProfile}
            className="btn-success text-sm font-medium"
          >
            Save Current
          </button>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={onAddPoint}
            className="btn-primary text-sm font-medium"
          >
            Add Point
          </button>
          <button
            onClick={onRemovePoint}
            className="btn-danger text-sm font-medium disabled:opacity-50"
            disabled={editingPoint === null || activeProfile.length <= 2}
          >
            Remove Point
          </button>
        </div>
      </div>

      <div className="relative w-full h-64 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 rounded-lg overflow-hidden shadow-inner">
        <canvas
          ref={profileCanvasRef}
          className="w-full h-full cursor-crosshair"
          onClick={onCanvasClick}
        />
      </div>
      <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
        <p>Click on points to select, then click elsewhere on the graph to move the selected point. Click empty space to add a new point.</p>
        <p>X-axis: Time (0-15s), Y-axis: Frequency (0-{maxFrequency}Hz).</p>
      </div>
    </div>
  );
}
