"use client";

import React, { useRef, useEffect } from 'react';

interface WheelSpeeds {
  fl: number;
  fr: number;
  rl: number;
  rr: number;
}

interface WaveformCanvasProps {
  wheelSpeeds: WheelSpeeds;
  wheelEnabled: {
    fl: boolean;
    fr: boolean;
    rl: boolean;
    rr: boolean;
  };
  isConnected: boolean;
}

export default function WaveformCanvas({ wheelSpeeds, wheelEnabled, isConnected }: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Adjust canvas for high DPI displays
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const width = rect.width;
    const height = rect.height;

    // Define colors for each wheel
    const wheelColors = {
      fl: '#ef4444', // red-500
      fr: '#3b82f6', // blue-500
      rl: '#10b981', // emerald-500
      rr: '#f59e0b'  // amber-500
    };

    // Animation function
    let startTime: number;
    const draw = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsedTime = timestamp - startTime;

      // Clear canvas
      ctx.clearRect(0, 0, width, height);

      // Draw background grid
      ctx.strokeStyle = '#f1f5f9';
      ctx.lineWidth = 1;
      ctx.beginPath();
      
      // Horizontal lines for each wheel channel
      for (let i = 1; i < 4; i++) {
        const y = (height / 4) * i;
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      
      // Vertical time grid lines
      for (let i = 1; i < 10; i++) {
        const x = (width / 10) * i;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      ctx.stroke();

      // Draw labels for each wheel
      ctx.fillStyle = '#64748b';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('FL', 5, 20);
      ctx.fillText('FR', 5, height/4 + 20);
      ctx.fillText('RL', 5, height/2 + 20);
      ctx.fillText('RR', 5, 3*height/4 + 20);

      // Check if any wheel has signal
      const hasAnySignal = Object.values(wheelSpeeds).some(speed => speed > 0) && 
                          Object.values(wheelEnabled).some(enabled => enabled);

      if (!isConnected || !hasAnySignal) {
        // Draw flat lines when disconnected or no signal
        ctx.strokeStyle = isConnected ? '#9ca3af' : '#d1d5db';
        ctx.lineWidth = 2;
        
        Object.keys(wheelSpeeds).forEach((wheel, index) => {
          const yCenter = (height / 4) * index + (height / 8);
          ctx.beginPath();
          ctx.moveTo(30, yCenter);
          ctx.lineTo(width, yCenter);
          ctx.stroke();
        });
        return;
      }

      // Draw waveforms for each wheel
      Object.entries(wheelSpeeds).forEach(([wheel, speed], index) => {
        const isEnabled = wheelEnabled[wheel as keyof WheelSpeeds];
        const wheelKey = wheel as keyof typeof wheelColors;
        
        if (!isEnabled || speed === 0) {
          // Draw flat line for disabled or zero speed wheels
          ctx.strokeStyle = '#d1d5db';
          ctx.lineWidth = 1;
          const yCenter = (height / 4) * index + (height / 8);
          ctx.beginPath();
          ctx.moveTo(30, yCenter);
          ctx.lineTo(width, yCenter);
          ctx.stroke();
          return;
        }

        // Calculate wave properties
        const period = 1000 / speed;
        const amplitude = height / 12;
        const yCenter = (height / 4) * index + (height / 8);
        
        ctx.strokeStyle = wheelColors[wheelKey];
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(30, yCenter);

        // Draw square wave
        const pixelsPerPeriod = Math.max(20, (width - 30) / 8);
        const halfPeriodPixels = pixelsPerPeriod / 2;
        const timeOffset = (elapsedTime % period) / period * pixelsPerPeriod;

        for (let x = 30 - timeOffset; x < width; ) {
          // High part
          ctx.lineTo(x, yCenter - amplitude);
          x += halfPeriodPixels;
          ctx.lineTo(x, yCenter - amplitude);
          // Low part
          ctx.lineTo(x, yCenter + amplitude);
          x += halfPeriodPixels;
          ctx.lineTo(x, yCenter + amplitude);
        }
        ctx.stroke();

        // Draw frequency label
        ctx.fillStyle = wheelColors[wheelKey];
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`${speed}Hz`, width - 5, (height / 4) * index + 15);
      });

      // Continue animation if connected and any wheel has signal
      if (isConnected && hasAnySignal) {
        animationRef.current = requestAnimationFrame(draw);
      }
    };

    // Start animation
    const hasAnySignal = Object.values(wheelSpeeds).some(speed => speed > 0) && 
                        Object.values(wheelEnabled).some(enabled => enabled);
    
    if (isConnected && hasAnySignal) {
      animationRef.current = requestAnimationFrame(draw);
    } else {
      draw(0);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [wheelSpeeds, wheelEnabled, isConnected]);

  return (
    <div className="w-full h-48 bg-gray-100 dark:bg-gray-700 rounded-xl mb-6 overflow-hidden shadow-inner transition-colors">
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}
