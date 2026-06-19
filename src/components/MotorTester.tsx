
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import { motion, AnimatePresence } from 'framer-motion';
import { useClientSerialConnection } from '@/hooks/useClientSerialConnection';
import PowerIndicators from '@/components/PowerIndicators';
import {
  PlayIcon, StopIcon, PlusIcon, TrashIcon,
  CheckCircleIcon, XCircleIcon, ClockIcon,
  DocumentArrowDownIcon, ArrowPathIcon,
} from '@heroicons/react/24/outline';
import jsPDF from 'jspdf';

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface MotorTestData {
  timestamp: number; // ms since test start
  voltage: number;
  current: number;
  power: number;
}

interface RefPoint { time: number; current: number; } // time in seconds

interface ExcludeZone {
  id: string;
  name: string;
  margin: number;           // ±A tolerance around reference curve
  referenceTestId: string;
  referenceData: RefPoint[]; // downsampled to ~200 pts
}

interface DeviationResult {
  passed: boolean;
  maxDeviation: number;   // A above margin
  maxDeviationTime: number; // s
  avgDeviation: number;   // mean excess deviation (0 if all inside)
  violationCount: number;
  totalPoints: number;
}

interface MotorTestResult {
  id: string;
  motorType: string;
  jobNumber: string;
  report: string;
  testData: MotorTestData[];
  excludeZones: ExcludeZone[];
  testResult: 'pass' | 'fail' | 'pending';
  testDuration: number;
  deviation?: DeviationResult;
  category?: 'good' | 'bad';
  createdAt: Date;
}

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Linear interpolation of reference curve at time t (seconds). */
function interpolateRef(data: RefPoint[], t: number): number | null {
  if (!data.length) return null;
  if (t <= data[0].time) return data[0].current;
  if (t >= data[data.length - 1].time) return data[data.length - 1].current;
  for (let i = 0; i < data.length - 1; i++) {
    if (t >= data[i].time && t <= data[i + 1].time) {
      const frac = (t - data[i].time) / (data[i + 1].time - data[i].time);
      return data[i].current + frac * (data[i + 1].current - data[i].current);
    }
  }
  return null;
}

/** Downsample an array to at most maxPts evenly-spaced points. */
function downsample<T>(arr: T[], maxPts: number): T[] {
  if (arr.length <= maxPts) return arr;
  const step = arr.length / maxPts;
  return Array.from({ length: maxPts }, (_, i) => arr[Math.round(i * step)]);
}

/** Evaluate pass/fail for a test run against all defined zones. */
function evaluateTest(testData: MotorTestData[], zones: ExcludeZone[]): DeviationResult {
  if (!zones.length || !testData.length) {
    return { passed: true, maxDeviation: 0, maxDeviationTime: 0, avgDeviation: 0, violationCount: 0, totalPoints: testData.length };
  }

  let maxDev = 0, maxDevTime = 0, totalExcess = 0, violations = 0;

  for (const pt of testData) {
    const t = pt.timestamp / 1000;
    for (const zone of zones) {
      const ref = interpolateRef(zone.referenceData, t);
      if (ref === null) continue;
      const excess = Math.abs(pt.current - ref) - zone.margin;
      if (excess > 0) {
        violations++;
        totalExcess += excess;
        if (excess > maxDev) { maxDev = excess; maxDevTime = t; }
      }
    }
  }

  return {
    passed: violations === 0,
    maxDeviation: maxDev,
    maxDeviationTime: maxDevTime,
    avgDeviation: violations > 0 ? totalExcess / violations : 0,
    violationCount: violations,
    totalPoints: testData.length,
  };
}

// â”€â”€â”€ Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const MotorTester: React.FC = () => {
  const { isConnected: serialConnected, sendCommand } = useClientSerialConnection();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  const sendMsg = (msg: string) => sendCommand(msg);

  // â”€â”€ Test state
  const [isRunning, setIsRunning]     = useState(false);
  const [startTime, setStartTime]     = useState<number | null>(null);
  const [duration, setDuration]       = useState(0);
  const [testData, setTestData]       = useState<MotorTestData[]>([]);
  const [liveData, setLiveData]       = useState({ voltage: 0, current: 0, power: 0 });
  const [verdict, setVerdict]         = useState<'pass' | 'fail' | 'pending'>('pending');
  const [deviationInfo, setDeviation] = useState<DeviationResult | null>(null);

  // â”€â”€ Motor meta (persisted in localStorage)
  const [motorType,  setMotorType]  = useState(() => localStorage.getItem('motorType')  || '');
  const [jobNumber,  setJobNumber]  = useState(() => localStorage.getItem('jobNumber')  || '');
  const [reportName, setReportName] = useState(() => localStorage.getItem('reportName') || '');

  useEffect(() => { localStorage.setItem('motorType',  motorType);  }, [motorType]);
  useEffect(() => { localStorage.setItem('jobNumber',  jobNumber);  }, [jobNumber]);
  useEffect(() => { localStorage.setItem('reportName', reportName); }, [reportName]);
  useEffect(() => {
    if (motorType && jobNumber) {
      const ts = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      setReportName(`RPT-${motorType.replace(/\s+/g, '_')}-${jobNumber}-${ts}`);
    }
  }, [motorType, jobNumber]);

  // â”€â”€ Zones & reference
  const [zones,               setZones]           = useState<ExcludeZone[]>([]);
  const [addingZone,          setAddingZone]       = useState(false);
  const [refTestId,           setRefTestId]        = useState<string>('');
  const [zoneName,            setZoneName]         = useState('');
  const [zoneMargin,          setZoneMargin]       = useState(2);
  const [selectedRefForPlot,  setSelectedRefPlot]  = useState<string>(''); // show reference curve on plot

  // â”€â”€ History
  const [results,       setResults]       = useState<MotorTestResult[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);
  const [maxCurrentScale, setMaxCurrentScale] = useState(5);
  const TEST_DURATION = 10; // seconds
  const MAX_TIME = 15;      // seconds (with 5s post-recording)

  // â”€â”€ Load results
  const loadResults = useCallback(async () => {
    setLoadingResults(true);
    try {
      const raw = await invoke<any[]>('get_motor_tests');
      setResults(raw.map(r => ({
        ...r,
        createdAt: new Date(r.createdAt),
        testData: typeof r.testData === 'string' ? JSON.parse(r.testData) : (r.testData ?? []),
        excludeZones: typeof r.excludeZones === 'string' ? JSON.parse(r.excludeZones) : (r.excludeZones ?? []),
      })));
    } catch (e) { console.error(e); }
    finally { setLoadingResults(false); }
  }, []);

  useEffect(() => { loadResults(); }, [loadResults]);

  // â”€â”€ Serial sensor data (expects JSON lines: {"voltage":12.1,"current":3.4})
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    listen<string>('serial-data', e => {
      try {
        const d = JSON.parse(e.payload);
        if (d.voltage === undefined || d.current === undefined) return;
        const voltage = parseFloat(d.voltage) || 0;
        const current = parseFloat(d.current) || 0;
        setLiveData({ voltage, current, power: voltage * current });
        setStartTime(t => {
          if (t) {
            const ts = Date.now() - t;
            if (ts <= MAX_TIME * 1000) {
              setTestData(prev => [...prev, { timestamp: ts, voltage, current, power: voltage * current }]);
            }
          }
          return t;
        });
      } catch {}
    }).then(fn => { if (cancelled) fn(); else unlisten = fn; });
    return () => { cancelled = true; unlisten?.(); };
  }, []);

  // â”€â”€ Auto-ranging
  useEffect(() => {
    const maxA = testData.length ? Math.max(...testData.map(d => d.current)) : 0;
    const scale = Math.max(5, Math.ceil(Math.max(maxA, liveData.current) * 1.2));
    if (scale !== maxCurrentScale) setMaxCurrentScale(scale);
  }, [testData, liveData]);

  // â”€â”€ Timer & auto-stop
  useEffect(() => {
    if (!isRunning || !startTime) return;
    const id = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      setDuration(elapsed);
      if (elapsed >= TEST_DURATION) stopTest();
    }, 100);
    return () => clearInterval(id);
  }, [isRunning, startTime]);

  // â”€â”€ Canvas render
  const refForPlot = results.find(r => r.id === selectedRefForPlot);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width  = rect.width  * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      const W = rect.width, H = rect.height;
      const mL = 42, mR = 12, mT = 10, mB = 28;
      const pW = W - mL - mR, pH = H - mT - mB;

      const tx = (t: number) => mL + (t / MAX_TIME) * pW;
      const ty = (a: number) => mT + pH - (a / maxCurrentScale) * pH;

      // Background
      ctx.fillStyle = '#111113';
      ctx.fillRect(0, 0, W, H);

      // Grid
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 5; i++) {
        const x = mL + (i / 5) * pW;
        const y = mT + (i / 5) * pH;
        ctx.beginPath(); ctx.moveTo(x, mT);    ctx.lineTo(x, mT + pH); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(mL, y); ctx.lineTo(mL + pW, y); ctx.stroke();
      }

      // Axes
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(mL, mT); ctx.lineTo(mL, mT + pH + 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mL - 2, mT + pH); ctx.lineTo(mL + pW, mT + pH); ctx.stroke();

      // Labels
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = '10px Inter, system-ui, sans-serif';
      ctx.textAlign = 'right';
      for (let i = 0; i <= 5; i++) {
        const a = (i / 5) * maxCurrentScale;
        ctx.fillText(`${a.toFixed(0)}A`, mL - 4, ty(a) + 3);
      }
      ctx.textAlign = 'center';
      for (let i = 0; i <= 5; i++) {
        const t = (i / 5) * MAX_TIME;
        ctx.fillText(`${t.toFixed(0)}s`, tx(t), mT + pH + 16);
      }

      // â”€â”€ Reference curve + band zones â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      for (const zone of zones) {
        if (!zone.referenceData.length) continue;
        const ref = zone.referenceData;

        // Band fill
        ctx.fillStyle = 'rgba(255,214,10,0.08)';
        ctx.beginPath();
        ref.forEach((pt, i) => {
          const x = tx(pt.time), y = ty(pt.current + zone.margin);
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        [...ref].reverse().forEach(pt => {
          ctx.lineTo(tx(pt.time), ty(Math.max(0, pt.current - zone.margin)));
        });
        ctx.closePath(); ctx.fill();

        // Band edges
        ctx.strokeStyle = 'rgba(255,214,10,0.3)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ref.forEach((pt, i) => {
          const x = tx(pt.time), y = ty(pt.current + zone.margin);
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.beginPath();
        ref.forEach((pt, i) => {
          const x = tx(pt.time), y = ty(Math.max(0, pt.current - zone.margin));
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.setLineDash([]);

        // Reference curve
        ctx.strokeStyle = 'rgba(255,214,10,0.6)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ref.forEach((pt, i) => {
          const x = tx(pt.time), y = ty(pt.current);
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.stroke();
      }

      // â”€â”€ Selected reference for plot â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      if (refForPlot && refForPlot.testData.length) {
        ctx.strokeStyle = 'rgba(255,214,10,0.4)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        refForPlot.testData.forEach((pt, i) => {
          const x = tx(pt.timestamp / 1000), y = ty(pt.current);
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // â”€â”€ Test data curve â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      if (testData.length > 1) {
        for (let i = 1; i < testData.length; i++) {
          const prev = testData[i - 1], curr = testData[i];
          const t = curr.timestamp / 1000;
          // Check violation
          const violated = zones.some(z => {
            const ref = interpolateRef(z.referenceData, t);
            return ref !== null && Math.abs(curr.current - ref) > z.margin;
          });
          ctx.strokeStyle = violated ? '#ff453a' : '#0a84ff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(tx(prev.timestamp / 1000), ty(prev.current));
          ctx.lineTo(tx(t), ty(curr.current));
          ctx.stroke();
        }
      }

      // â”€â”€ Live point â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      if (isRunning && startTime && liveData.current > 0) {
        const t = (Date.now() - startTime) / 1000;
        const x = tx(Math.min(t, MAX_TIME)), y = ty(liveData.current);
        const violated = zones.some(z => {
          const ref = interpolateRef(z.referenceData, t);
          return ref !== null && Math.abs(liveData.current - ref) > z.margin;
        });
        ctx.fillStyle = violated ? '#ff453a' : '#30d158';
        ctx.beginPath(); ctx.arc(x, y, 5, 0, 2 * Math.PI); ctx.fill();
        ctx.strokeStyle = violated ? '#ff453a' : '#30d158';
        ctx.lineWidth = 2; ctx.globalAlpha = 0.4;
        ctx.beginPath(); ctx.arc(x, y, 10, 0, 2 * Math.PI); ctx.stroke();
        ctx.globalAlpha = 1;
      }

      animationRef.current = requestAnimationFrame(render);
    };

    render();
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [testData, liveData, zones, isRunning, startTime, maxCurrentScale, refForPlot]);

  // â”€â”€â”€ Handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const startTest = async () => {
    if (!motorType || !jobNumber) return;
    try {
      await sendMsg(JSON.stringify({ type: 15, id: Date.now(), state: true, timestamp: Date.now() }));
      await new Promise(r => setTimeout(r, 100));
    } catch {}
    setStartTime(Date.now()); setIsRunning(true);
    setDuration(0); setTestData([]); setVerdict('pending'); setDeviation(null);
  };

  const stopTest = useCallback(async () => {
    setIsRunning(false);
    try {
      await sendMsg(JSON.stringify({ type: 15, id: Date.now(), state: false, timestamp: Date.now() }));
    } catch {}
    setTestData(prev => {
      const dev = evaluateTest(prev, zones);
      setVerdict(dev.passed ? 'pass' : 'fail');
      setDeviation(dev);
      return prev;
    });
  }, [zones]);

  const addZoneFromReference = () => {
    const ref = results.find(r => r.id === refTestId);
    if (!ref || !ref.testData.length) return;
    const sampled = downsample(ref.testData, 200).map(pt => ({
      time: pt.timestamp / 1000,
      current: pt.current,
    }));
    setZones(prev => [...prev, {
      id: Date.now().toString(),
      name: zoneName || `${ref.motorType} ±${zoneMargin}A`,
      margin: zoneMargin,
      referenceTestId: refTestId,
      referenceData: sampled,
    }]);
    setAddingZone(false); setZoneName(''); setRefTestId(''); setZoneMargin(2);
  };

  const saveResult = async (result: MotorTestResult, category: 'good' | 'bad') => {
    try {
      await invoke('save_motor_test', {
        test: {
          ...result,
          category,
          testData: JSON.stringify(result.testData),
          excludeZones: JSON.stringify(result.excludeZones),
        }
      });
      generatePDF(result);
      await loadResults();
    } catch (e) { console.error(e); }
  };

  // â”€â”€â”€ PDF â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const generatePDF = (result: MotorTestResult) => {
    const pdf = new jsPDF();
    const W = pdf.internal.pageSize.getWidth();
    const H = pdf.internal.pageSize.getHeight();
    const M = 20;
    const accent = result.testResult === 'pass' ? [48, 209, 88] : [255, 69, 58];

    // â”€â”€ Page 1 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Top bar
    pdf.setFillColor(15, 15, 17);
    pdf.rect(0, 0, W, 18, 'F');
    pdf.setFontSize(9); pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(245, 245, 247);
    pdf.text('BRAXON', M, 11);
    pdf.setFont('helvetica', 'normal');
    pdf.text('ABS Hydraulic Diagnostics', M + 22, 11);
    pdf.setTextColor(142, 142, 147);
    pdf.text(new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }), W - M, 11, { align: 'right' });

    // Title
    let y = 34;
    pdf.setFontSize(22); pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(28, 28, 30);
    pdf.text('Motor Test Report', M, y);

    // Verdict pill
    pdf.setFillColor(accent[0], accent[1], accent[2]);
    pdf.roundedRect(W - M - 30, y - 10, 30, 12, 2, 2, 'F');
    pdf.setFontSize(9); pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(255, 255, 255);
    pdf.text(result.testResult === 'pass' ? 'PASSED' : 'FAILED', W - M - 15, y - 1, { align: 'center' });

    // Divider
    y += 6;
    pdf.setDrawColor(209, 209, 214);
    pdf.setLineWidth(0.5);
    pdf.line(M, y, W - M, y);
    y += 10;

    // Info grid
    const infoRows = [
      ['Motor Type', result.motorType],
      ['Job Number', result.jobNumber],
      ['Report ID',  result.report],
      ['Test Date',  result.createdAt.toLocaleString('en-GB')],
      ['Duration',   `${result.testDuration.toFixed(1)} s`],
    ];
    pdf.setFontSize(10);
    infoRows.forEach(([label, value]) => {
      pdf.setFont('helvetica', 'bold'); pdf.setTextColor(110, 110, 115);
      pdf.text(label, M, y);
      pdf.setFont('helvetica', 'normal'); pdf.setTextColor(28, 28, 30);
      pdf.text(value, M + 36, y);
      y += 8;
    });

    // Stats block
    if (result.testData.length) {
      y += 4;
      pdf.setDrawColor(209, 209, 214); pdf.line(M, y, W - M, y); y += 8;
      pdf.setFontSize(11); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(28, 28, 30);
      pdf.text('Electrical Summary', M, y); y += 8;

      const pts = result.testData;
      const avgA = pts.reduce((s, d) => s + d.current, 0) / pts.length;
      const maxA = Math.max(...pts.map(d => d.current));
      const avgV = pts.reduce((s, d) => s + d.voltage, 0) / pts.length;
      const avgW = pts.reduce((s, d) => s + d.power, 0) / pts.length;

      const stats = [
        ['Avg current', `${avgA.toFixed(2)} A`],
        ['Peak current', `${maxA.toFixed(2)} A`],
        ['Avg voltage', `${avgV.toFixed(2)} V`],
        ['Avg power',   `${avgW.toFixed(2)} W`],
        ['Energy',      `${(avgW * result.testDuration).toFixed(1)} J`],
        ['Samples',     `${pts.length}`],
      ];
      const colW = (W - 2 * M) / 3;
      stats.forEach(([lbl, val], i) => {
        const col = i % 3, row = Math.floor(i / 3);
        const sx = M + col * colW, sy = y + row * 14;
        pdf.setFontSize(8); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(110, 110, 115);
        pdf.text(lbl, sx, sy);
        pdf.setFontSize(11); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(28, 28, 30);
        pdf.text(val, sx, sy + 6);
      });
      y += Math.ceil(stats.length / 3) * 14 + 6;
    }

    // Deviation block
    const dev = result.deviation;
    if (dev) {
      pdf.setDrawColor(209, 209, 214); pdf.line(M, y, W - M, y); y += 8;
      pdf.setFontSize(11); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(28, 28, 30);
      pdf.text('Deviation Analysis', M, y); y += 8;

      const devStats: [string, string][] = [
        ['Verdict', dev.passed ? 'WITHIN TOLERANCE' : 'EXCEEDED TOLERANCE'],
        ['Max excess deviation', `${dev.maxDeviation.toFixed(2)} A at t=${dev.maxDeviationTime.toFixed(1)}s`],
        ['Avg excess deviation', `${dev.avgDeviation.toFixed(2)} A`],
        ['Violation points',     `${dev.violationCount} / ${dev.totalPoints}`],
      ];
      devStats.forEach(([lbl, val]) => {
        pdf.setFontSize(9); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(110, 110, 115);
        pdf.text(lbl, M, y);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(dev.passed || lbl === 'Verdict' ? (dev.passed ? accent[0] : accent[0]) : 28, 28, 30);
        pdf.setTextColor(28, 28, 30);
        pdf.text(val, M + 52, y);
        y += 7;
      });
    }

    // Zones block
    if (result.excludeZones.length) {
      y += 4; pdf.setDrawColor(209, 209, 214); pdf.line(M, y, W - M, y); y += 8;
      pdf.setFontSize(11); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(28, 28, 30);
      pdf.text('Reference Zones', M, y); y += 8;
      result.excludeZones.forEach(z => {
        pdf.setFontSize(9); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(60, 60, 60);
        pdf.text(`â€¢ ${z.name}  â€”  margin ±${z.margin} A`, M + 4, y);
        y += 6;
      });
    }

    // Footer
    pdf.setFontSize(8); pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(174, 174, 178);
    pdf.text(result.report, W / 2, H - 8, { align: 'center' });

    pdf.save(`${result.report}.pdf`);
  };

  // â”€â”€â”€ Derived state for current test â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const currentResult: MotorTestResult = {
    id: Date.now().toString(),
    motorType, jobNumber, report: reportName,
    testData, excludeZones: zones,
    testResult: verdict,
    testDuration: duration,
    deviation: deviationInfo ?? undefined,
    createdAt: new Date(),
  };

  // â”€â”€â”€ JSX â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return (
    <div className="space-y-5 px-4 py-6">

      {/* â”€â”€ Motor Info â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="card">
        <h2 className="card-header">Motor Info</h2>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Motor Type', value: motorType, set: setMotorType, ph: 'e.g., Bosch 12V' },
            { label: 'Job Number', value: jobNumber, set: setJobNumber, ph: 'e.g., JOB-001' },
            { label: 'Report ID',  value: reportName, set: setReportName, ph: 'auto-generated' },
          ].map(({ label, value, set, ph }) => (
            <div key={label}>
              <label className="input-label">{label}</label>
              <input className="input-field" value={value}
                onChange={e => set(e.target.value)} placeholder={ph} />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* â”€â”€ Power â”€â”€ */}
        <PowerIndicators sendMessage={sendMsg} />

        {/* â”€â”€ Test Control â”€â”€ */}
        <div className="card">
          <h2 className="card-header">Test Control</h2>
          <div className="space-y-4">
            {/* Progress */}
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className={['w-2 h-2 rounded-full', isRunning ? 'bg-success animate-pulse-slow' : 'bg-text-tertiary'].join(' ')} />
                <span className="text-text-secondary">{isRunning ? 'Running' : 'Idle'}</span>
              </div>
              <span className="text-text-tertiary font-mono">{duration.toFixed(1)}s / {TEST_DURATION}.0s</span>
            </div>

            <div className="h-1.5 bg-elevated rounded-full overflow-hidden">
              <div className="h-full bg-accent rounded-full transition-all duration-200"
                style={{ width: `${Math.min((duration / TEST_DURATION) * 100, 100)}%` }} />
            </div>

            <button
              onClick={isRunning ? stopTest : startTest}
              disabled={!serialConnected || !motorType || !jobNumber}
              className={['w-full py-2.5 flex items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed',
                isRunning ? 'bg-danger/15 text-danger hover:bg-danger/25' : 'bg-accent/15 text-accent hover:bg-accent/25'].join(' ')}
            >
              {isRunning ? <><StopIcon className="w-4 h-4" /> Stop Test</>
                         : <><PlayIcon className="w-4 h-4" /> Start {TEST_DURATION}s Test</>}
            </button>

            {/* Live readings */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Voltage', value: `${liveData.voltage.toFixed(2)} V` },
                { label: 'Current', value: `${liveData.current.toFixed(2)} A` },
                { label: 'Power',   value: `${liveData.power.toFixed(2)} W` },
              ].map(({ label, value }) => (
                <div key={label} className="bg-elevated rounded-lg px-3 py-2 text-center">
                  <p className="text-[10px] text-text-tertiary mb-0.5">{label}</p>
                  <p className="text-sm font-semibold text-text-primary font-mono">{value}</p>
                </div>
              ))}
            </div>

            {/* Verdict */}
            <AnimatePresence>
              {verdict !== 'pending' && deviationInfo && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className={['rounded-xl p-4 border',
                    verdict === 'pass'
                      ? 'bg-success/8 border-success/20'
                      : 'bg-danger/8  border-danger/20'].join(' ')}
                >
                  <div className="flex items-center gap-2 mb-2">
                    {verdict === 'pass'
                      ? <CheckCircleIcon className="w-5 h-5 text-success" />
                      : <XCircleIcon    className="w-5 h-5 text-danger" />}
                    <span className={['font-semibold text-sm',
                      verdict === 'pass' ? 'text-success' : 'text-danger'].join(' ')}>
                      Motor {verdict === 'pass' ? 'OK' : 'NOT OK'}
                    </span>
                  </div>
                  {zones.length > 0 ? (
                    <p className="text-xs text-text-secondary">
                      {verdict === 'pass'
                        ? `All ${deviationInfo.totalPoints} points within reference ±${zones[0]?.margin}A tolerance`
                        : `Exceeded tolerance â€” max deviation +${deviationInfo.maxDeviation.toFixed(2)}A at t=${deviationInfo.maxDeviationTime.toFixed(1)}s (${deviationInfo.violationCount} points)`}
                    </p>
                  ) : (
                    <p className="text-xs text-text-tertiary">No reference zone defined â€” no comparison possible</p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* â”€â”€ Plot â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="card-header mb-0">Current vs Time</h2>
          <div className="flex items-center gap-4 text-xs text-text-tertiary">
            <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-accent inline-block" /> Live</span>
            {zones.length > 0 && <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-warning inline-block" /> Reference ±margin</span>}
            {/* Reference selector */}
            {results.length > 0 && (
              <select
                value={selectedRefForPlot}
                onChange={e => setSelectedRefPlot(e.target.value)}
                className="bg-elevated border border-border rounded-lg px-2 py-1 text-xs text-text-primary focus:outline-none ml-2"
              >
                <option value="">— overlay reference —</option>
                {results.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.motorType} · {r.jobNumber}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
        <canvas ref={canvasRef} className="w-full h-72 rounded-lg" />
      </div>

      {/* â”€â”€ Zones â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="card-header mb-0">Reference Zones</h2>
            <p className="text-xs text-text-tertiary mt-0.5">Tolerance band â€” test must stay within reference ± margin</p>
          </div>
          <button onClick={() => setAddingZone(true)} className="btn-primary text-sm">
            <PlusIcon className="w-4 h-4" /> Add Zone
          </button>
        </div>

        {zones.length === 0 ? (
          <p className="text-sm text-text-tertiary text-center py-8">No zones defined â€” test result will always pass</p>
        ) : (
          <div className="space-y-2">
            {zones.map(z => (
              <div key={z.id} className="flex items-center justify-between bg-elevated rounded-xl px-4 py-3 border border-border">
                <div>
                  <p className="text-sm font-medium text-text-primary">{z.name}</p>
                  <p className="text-xs text-text-tertiary mt-0.5">±{z.margin} A from reference · {z.referenceData.length} pts</p>
                </div>
                <button onClick={() => setZones(p => p.filter(x => x.id !== z.id))}
                  className="p-1.5 text-text-tertiary hover:text-danger transition-colors rounded-lg">
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add zone modal */}
        <AnimatePresence>
          {addingZone && (
            <>
              <motion.div key="bd" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-40"
                onClick={() => setAddingZone(false)} />
              <motion.div key="md"
                initial={{ opacity: 0, scale: 0.95, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none"
              >
                <div className="card max-w-md w-full mx-4 pointer-events-auto shadow-2xl space-y-4">
                  <h3 className="card-header">Add Reference Zone</h3>

                  <div>
                    <label className="input-label">Reference test (good motor)</label>
                    <select value={refTestId} onChange={e => setRefTestId(e.target.value)}
                      className="input-field">
                      <option value="">— select a saved test —</option>
                      {results.map(r => (
                        <option key={r.id} value={r.id}>
                          {r.motorType} · {r.jobNumber} · {r.createdAt.toLocaleDateString()}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="input-label">Tolerance margin (±A)</label>
                    <input type="number" min="0.1" step="0.1" value={zoneMargin}
                      onChange={e => setZoneMargin(parseFloat(e.target.value) || 0)}
                      className="input-field" />
                    <p className="text-xs text-text-tertiary mt-1">
                      Test current must stay within ±{zoneMargin}A of the reference curve
                    </p>
                  </div>

                  <div>
                    <label className="input-label">Zone name (optional)</label>
                    <input type="text" value={zoneName} onChange={e => setZoneName(e.target.value)}
                      className="input-field" placeholder="auto-generated if empty" />
                  </div>

                  <div className="flex gap-3 pt-1">
                    <button onClick={() => setAddingZone(false)} className="btn-secondary flex-1">Cancel</button>
                    <button onClick={addZoneFromReference} disabled={!refTestId} className="btn-primary flex-1">
                      Create Zone
                    </button>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* â”€â”€ Test History â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="card-header mb-0">Test History</h2>
            <p className="text-xs text-text-tertiary mt-0.5">{results.length} saved</p>
          </div>
          <button onClick={loadResults} disabled={loadingResults} className="btn-secondary text-sm">
            <ArrowPathIcon className={['w-4 h-4', loadingResults ? 'animate-spin' : ''].join(' ')} />
            Refresh
          </button>
        </div>

        {results.length === 0 ? (
          <p className="text-sm text-text-tertiary text-center py-10">No saved tests</p>
        ) : (
          <div className="space-y-2">
            {results.map((r, i) => (
              <motion.div key={r.id}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-center gap-4 bg-elevated rounded-xl px-4 py-3 border border-border group"
              >
                {/* Status dot */}
                <span className={['w-2 h-2 rounded-full shrink-0',
                  r.testResult === 'pass' ? 'bg-success' : 'bg-danger'].join(' ')} />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-text-primary">{r.motorType}</span>
                    <span className="text-text-tertiary text-xs">·</span>
                    <span className="text-xs text-text-secondary">{r.jobNumber}</span>
                    <span className={['text-[10px] font-semibold px-1.5 py-0.5 rounded-md',
                      r.testResult === 'pass' ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'].join(' ')}>
                      {r.testResult.toUpperCase()}
                    </span>
                    {r.category && (
                      <span className="text-[10px] text-text-tertiary bg-elevated border border-border px-1.5 py-0.5 rounded-md">
                        {r.category}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-text-tertiary">
                    <span>{r.createdAt.toLocaleString('en-GB')}</span>
                    <span>{r.testDuration.toFixed(1)}s</span>
                    {r.deviation && r.deviation.violationCount > 0 && (
                      <span className="text-danger">
                        +{r.deviation.maxDeviation.toFixed(2)}A excess at t={r.deviation.maxDeviationTime.toFixed(1)}s
                      </span>
                    )}
                    {r.deviation && r.deviation.violationCount === 0 && r.deviation.totalPoints > 0 && (
                      <span className="text-success">within tolerance</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => generatePDF(r)}
                    className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-card transition-colors"
                    title="Download PDF">
                    <DocumentArrowDownIcon className="w-4 h-4" />
                  </button>
                  <button onClick={() => saveResult(r, 'good')}
                    className="px-2.5 py-1 text-xs font-medium bg-success/10 text-success hover:bg-success/20 rounded-lg transition-colors">
                    âœ“ Good
                  </button>
                  <button onClick={() => saveResult(r, 'bad')}
                    className="px-2.5 py-1 text-xs font-medium bg-danger/10 text-danger hover:bg-danger/20 rounded-lg transition-colors">
                    âœ— Bad
                  </button>
                  <button onClick={() => setResults(p => p.filter(x => x.id !== r.id))}
                    className="p-1.5 rounded-lg text-text-tertiary hover:text-danger hover:bg-card transition-colors">
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
