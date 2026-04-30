"use client";

import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { motion, AnimatePresence } from 'framer-motion';
import { useWebSocketContext } from '@/contexts/WebSocketContext';
import { WebSocketMessage } from '@/hooks/useWebSocketConnection';
import PowerIndicators, { PowerIndicatorsRef } from '@/components/PowerIndicators';
import { 
  PlayIcon, 
  StopIcon, 
  PlusIcon, 
  MinusIcon,
  TrashIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  DocumentArrowDownIcon
} from '@heroicons/react/24/outline';
import clsx from 'clsx';
import jsPDF from 'jspdf';

interface MotorTestData {
  timestamp: number;
  voltage: number;
  current: number;
  power: number;
}

interface ExcludeZone {
  id: string;
  name: string;
  minVoltage: number;
  maxVoltage: number;
  minCurrent: number;
  maxCurrent: number;
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
  createdAt: Date;
}

export const MotorTester: React.FC = () => {
  const { socket, isConnected, sendMessage: wsSendMessage, devices, selectedDeviceId } = useWebSocketContext();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const powerIndicatorsRef = useRef<PowerIndicatorsRef>(null);
  
  // Test state
  const [isTestRunning, setIsTestRunning] = useState(false);
  const [testStartTime, setTestStartTime] = useState<number | null>(null);
  const [testDuration, setTestDuration] = useState(0);
  const [testData, setTestData] = useState<MotorTestData[]>([]);
  const [currentTestResult, setCurrentTestResult] = useState<'pass' | 'fail' | 'pending'>('pending');
  
  // Power status tracking
  const [isPowerOn, setIsPowerOn] = useState(false);
  const [isIgnitionOn, setIsIgnitionOn] = useState(false);
  
  // Motor info with localStorage persistence
  const [motorType, setMotorType] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('motorType') || '';
    }
    return '';
  });
  const [jobNumber, setJobNumber] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('jobNumber') || '';
    }
    return '';
  });
  const [report, setReport] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('report') || '';
    }
    return '';
  });
  
  // Check if ESP32 device is actually connected and selected
  const isESP32Connected = Boolean(isConnected && selectedDeviceId && devices.some(device => 
    device.id === selectedDeviceId && device.type === 'esp32'
  ));

  // Create the same kind of adapter function here
  const sendMessageAdapter = async (message: string) => {
    if (isESP32Connected && wsSendMessage) {
      return wsSendMessage({
        type: 'raw_message',
        data: message,
        timestamp: Date.now()
      });
    }
    return false;
  };

  // Save motor info to localStorage
  useEffect(() => {
    localStorage.setItem('motorType', motorType);
  }, [motorType]);

  useEffect(() => {
    localStorage.setItem('jobNumber', jobNumber);
  }, [jobNumber]);

  useEffect(() => {
    localStorage.setItem('report', report);
  }, [report]);


  // Auto-generate report name when motor type or job number changes
  useEffect(() => {
    if (motorType && jobNumber) {
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
      const newReport = `RPT-${motorType.replace(/\s+/g, '_')}-${jobNumber}-${timestamp}`;
      setReport(newReport);
    }
  }, [motorType, jobNumber]);
  
  // Exclude zones
  const [excludeZones, setExcludeZones] = useState<ExcludeZone[]>([]);
  const [isAddingZone, setIsAddingZone] = useState(false);
  const [selectedReferenceTest, setSelectedReferenceTest] = useState<string | null>(null);
  const [zoneMargin, setZoneMargin] = useState(2); // Default ±2A margin
  const [newZone, setNewZone] = useState({
    name: '',
    minVoltage: 0,
    maxVoltage: 12,
    minCurrent: 0,
    maxCurrent: 5
  });
  
  // Current sensor data
  const [currentData, setCurrentData] = useState({
    voltage: 0,
    current: 0,
    power: 0
  });
  
  // Test results history - now loaded from server
  const [testResults, setTestResults] = useState<MotorTestResult[]>([]);
  const [isLoadingResults, setIsLoadingResults] = useState(false);

  // Load motor test results from server
  const loadTestResults = async () => {
    setIsLoadingResults(true);
    try {
      const serverResults = await invoke<any[]>('get_motor_tests');
      const formattedResults = serverResults.map((result: any) => ({
        ...result,
        createdAt: new Date(result.createdAt),
        testData: typeof result.testData === 'string' ? JSON.parse(result.testData) : (result.testData || []),
        excludeZones: typeof result.excludeZones === 'string' ? JSON.parse(result.excludeZones) : (result.excludeZones || [])
      }));
      setTestResults(formattedResults);
    } catch (error) {
      console.error('Error loading test results:', error);
    } finally {
      setIsLoadingResults(false);
    }
  };

  // Load results on component mount
  useEffect(() => {
    loadTestResults();
  }, []);

  // Auto-ranging scales for the plot
  const [maxCurrentScale, setMaxCurrentScale] = useState(5); // Default to a smaller 5A range
  const maxTimeScale = 15; // Fixed 15-second test duration

  // Listen for WebSocket sensor data
  useEffect(() => {
    if (!socket) return;

    const handleWebSocketMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.voltage !== undefined && data.current !== undefined) {
          const voltage = parseFloat(data.voltage) || 0;
          const current = parseFloat(data.current) || 0;
          const power = voltage * current;
          
          setCurrentData({ voltage, current, power });
          
          // Record data during test and for 5 seconds after test stops
          if (testStartTime) {
            const timestamp = Date.now() - testStartTime;
            // Record data during test (0-10s) and 5 seconds after (10-15s)
            if (timestamp <= 15000) { // 15 seconds total
              setTestData(prev => [...prev, { timestamp, voltage, current, power }]);
            }
          }
        }
      } catch (error) {
        // Ignore non-JSON messages
      }
    };

    socket.addEventListener('message', handleWebSocketMessage);
    return () => socket.removeEventListener('message', handleWebSocketMessage);
  }, [socket, isTestRunning, testStartTime]);

  // Test timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isTestRunning && testStartTime) {
      interval = setInterval(() => {
        const elapsed = (Date.now() - testStartTime) / 1000;
        setTestDuration(elapsed);
        
        // Auto-stop after 10 seconds
        if (elapsed >= 10) {
          handleStopTest();
        }
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isTestRunning, testStartTime]);

  // Auto-ranging logic for current scale
  useEffect(() => {
    // Find the maximum current from the collected test data
    const maxAFromData = testData.length > 0 ? Math.max(...testData.map(d => d.current)) : 0;
    
    // Consider the current real-time point as well
    const overallMaxA = Math.max(maxAFromData, currentData.current);
    
    // Calculate new scale with a 20% buffer, but don't go below the default of 5
    const newCurrentScale = Math.max(5, Math.ceil(overallMaxA * 1.2));
    
    // Update the state if the scale has changed
    if (newCurrentScale !== maxCurrentScale) {
      setMaxCurrentScale(newCurrentScale);
    }
  }, [testData, currentData]); // This effect runs whenever data changes

  // Real-time plot rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Set canvas size
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      
      const width = rect.width;
      const height = rect.height;
      
      // Draw grid
      ctx.strokeStyle = '#374151';
      ctx.lineWidth = 0.5;
      for (let i = 0; i <= 10; i++) {
        const x = (i / 10) * width;
        const y = (i / 10) * height;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      
      // Draw exclude zones (red areas) - now based on time ranges and current
      excludeZones.forEach(zone => {
        // Convert voltage range to time range (assuming voltage was 0-24V, now 0-10s)
        const timeStart = (zone.minVoltage / 24) * maxTimeScale;
        const timeEnd = (zone.maxVoltage / 24) * maxTimeScale;
        
        const x1 = (timeStart / maxTimeScale) * width;
        const x2 = (timeEnd / maxTimeScale) * width;
        const y1 = height - (zone.maxCurrent / maxCurrentScale) * height;
        const y2 = height - (zone.minCurrent / maxCurrentScale) * height;
        
        ctx.fillStyle = 'rgba(239, 68, 68, 0.3)';
        ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
        
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
        
        ctx.fillStyle = '#ef4444';
        ctx.font = '12px sans-serif';
        ctx.fillText(zone.name, x1 + 5, y1 + 15);
      });
      
      // Draw test data points
      if (testData.length > 1) {
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        testData.forEach((point, index) => {
          // Use time-based x-axis
          const timeInSeconds = point.timestamp / 1000; // Convert ms to seconds
          const x = (timeInSeconds / maxTimeScale) * width;
          const y = height - (point.current / maxCurrentScale) * height;
          
          if (index === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        });
        ctx.stroke();
      }
      
      // Draw current point
      if (currentData.current > 0 && isTestRunning && testStartTime) {
        // Use time-based x-axis
        const currentTimeInSeconds = (Date.now() - testStartTime) / 1000;
        const x = (currentTimeInSeconds / maxTimeScale) * width;
        const y = height - (currentData.current / maxCurrentScale) * height;
        
        // Check if in exclude zone (convert time back to voltage equivalent for zone checking)
        const equivalentVoltage = (currentTimeInSeconds / maxTimeScale) * 24;
        const inExcludeZone = excludeZones.some(zone => 
          equivalentVoltage >= zone.minVoltage && 
          equivalentVoltage <= zone.maxVoltage &&
          currentData.current >= zone.minCurrent && 
          currentData.current <= zone.maxCurrent
        );
        
        ctx.fillStyle = inExcludeZone ? '#ef4444' : '#10b981';
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, 2 * Math.PI);
        ctx.fill();
        
        // Pulse effect during test
        if (isTestRunning) {
          ctx.strokeStyle = inExcludeZone ? '#ef4444' : '#10b981';
          ctx.lineWidth = 3;
          ctx.globalAlpha = 0.6;
          ctx.beginPath();
          ctx.arc(x, y, 12, 0, 2 * Math.PI);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
      
      // Draw axes labels and scale
      ctx.fillStyle = '#6b7280';
      ctx.font = '12px sans-serif';
      
      // X-axis labels (time)
      for (let i = 0; i <= 5; i++) {
        const timeSeconds = (i / 5) * maxTimeScale;
        const x = (i / 5) * width;
        ctx.fillText(`${timeSeconds.toFixed(1)}s`, x - 10, height - 5);
      }
      
      // Y-axis labels (current)
      for (let i = 0; i <= 5; i++) {
        const current = (i / 5) * maxCurrentScale;
        const y = height - ((i / 5) * height);
        // Avoid drawing the '0A' label over the corner time label
        if (i > 0) {
            ctx.fillText(`${current.toFixed(1)}A`, 5, y + 4);
        }
      }
      
      // Axis titles
      ctx.fillText(`Time (s) - Duration: ${maxTimeScale}s`, width / 2 - 50, height - 5);
      ctx.save();
      ctx.translate(15, height / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(`Current (A) - Max: ${maxCurrentScale}A`, -height / 2 + 50, 0);
      ctx.restore();
      
      animationRef.current = requestAnimationFrame(render);
    };

    render();
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [testData, currentData, excludeZones, isTestRunning, maxCurrentScale, testStartTime]);

  const handleStartTest = async () => {
    if (!isESP32Connected || !motorType || !jobNumber) return;
    
    // Check if ABS power is enabled, if not, enable it
    if (!isPowerOn) {
      console.log('ABS Power not enabled, enabling now...');
      try {
        const absPowerOnMessage = JSON.stringify({
          type: 15, // MSG_SET_ABS_POWER
          id: Date.now(),
          state: true, // Turn ON
          timestamp: Date.now()
        });
        await sendMessageAdapter(absPowerOnMessage);
        // Brief delay for power stabilization but start data collection immediately
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error('Failed to enable ABS power:', error);
        alert('Failed to enable ABS power. Please check connection.');
        return;
      }
    }
    
    // Start data collection immediately to capture initial ramp-up
    const startTime = Date.now();
    setTestStartTime(startTime);
    setIsTestRunning(true);
    setTestDuration(0);
    setTestData([]);
    setCurrentTestResult('pending');
  };

  const handleStopTest = async () => {
    setIsTestRunning(false);
    
    // Automatically turn off ABS power after test
    try {
      const absPowerOffMessage = JSON.stringify({
        type: 15, // MSG_SET_ABS_POWER
        id: Date.now(),
        state: false, // Turn OFF
        timestamp: Date.now()
      });
      await sendMessageAdapter(absPowerOffMessage);
      console.log('ABS Power turned off after test completion');
    } catch (error) {
      console.error('Failed to turn off ABS power:', error);
    }
    
    // Analyze test results
    const inExcludeZone = testData.some(point => 
      excludeZones.some(zone => 
        point.voltage >= zone.minVoltage && 
        point.voltage <= zone.maxVoltage &&
        point.current >= zone.minCurrent && 
        point.current <= zone.maxCurrent
      )
    );
    
    const result: 'pass' | 'fail' = inExcludeZone ? 'fail' : 'pass';
    setCurrentTestResult(result);
    
    // Create test result
    const testResult: MotorTestResult = {
      id: Date.now().toString(),
      motorType,
      jobNumber,
      report,
      testData: [...testData],
      excludeZones: [...excludeZones],
      testResult: result,
      testDuration,
      createdAt: new Date()
    };
    
    // Add to local state for immediate display
    setTestResults(prev => [testResult, ...prev]);
  };

  const createZoneFromReference = () => {
    if (!selectedReferenceTest) return;
    
    const referenceTest = testResults.find(test => test.id === selectedReferenceTest);
    if (!referenceTest || !referenceTest.testData.length) return;

    // Calculate zone based on reference test data with margin
    const testData = referenceTest.testData;
    const minCurrent = Math.max(0, Math.min(...testData.map(d => d.current)) - zoneMargin);
    const maxCurrent = Math.max(...testData.map(d => d.current)) + zoneMargin;
    const minTime = Math.min(...testData.map(d => d.timestamp)) / 1000;
    const maxTime = Math.max(...testData.map(d => d.timestamp)) / 1000;
    
    // Convert time to voltage equivalent for zone storage (legacy compatibility)
    const minVoltage = (minTime / maxTimeScale) * 24;
    const maxVoltage = (maxTime / maxTimeScale) * 24;

    const zone: ExcludeZone = {
      id: Date.now().toString(),
      name: newZone.name || `Zone around ${referenceTest.motorType}`,
      minVoltage,
      maxVoltage,
      minCurrent,
      maxCurrent
    };
    
    setExcludeZones(prev => [...prev, zone]);
    setNewZone({ name: '', minVoltage: 0, maxVoltage: 12, minCurrent: 0, maxCurrent: 5 });
    setSelectedReferenceTest(null);
    setIsAddingZone(false);
  };

  const handleAddExcludeZone = () => {
    if (selectedReferenceTest) {
      createZoneFromReference();
    } else {
      // Manual zone creation
      const zone: ExcludeZone = {
        id: Date.now().toString(),
        ...newZone
      };
      setExcludeZones(prev => [...prev, zone]);
      setNewZone({
        name: '',
        minVoltage: 0,
        maxVoltage: 12,
        minCurrent: 0,
        maxCurrent: 5
      });
      setIsAddingZone(false);
    }
  };

  const handleDeleteZone = (id: string) => {
    setExcludeZones(prev => prev.filter(z => z.id !== id));
  };

  const generatePDF = (result: MotorTestResult) => {
    const pdf = new jsPDF();
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const pdfMargin = 20;
    
    // ==================== PAGE 1: COVER PAGE ====================
    // Header with gradient effect (simulated with multiple rectangles)
    for (let i = 0; i < 50; i++) {
      const alpha = 255 - (i * 3);
      pdf.setFillColor(41, 98, Math.min(255, 200 + i));
      pdf.rect(0, i * 0.8, pageWidth, 0.8, 'F');
    }
    
    // University/Company Logo Area
    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(pageWidth / 2 - 30, 50, 60, 20, 3, 3, 'F');
    pdf.setFontSize(16);
    pdf.setTextColor(41, 98, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.text('REMAN LAB', pageWidth / 2, 63, { align: 'center' });
    
    // Main Title
    pdf.setFontSize(28);
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.text('MOTOR PERFORMANCE', pageWidth / 2, 90, { align: 'center' });
    pdf.text('TEST REPORT', pageWidth / 2, 102, { align: 'center' });
    
    // Decorative line
    pdf.setDrawColor(255, 255, 255);
    pdf.setLineWidth(2);
    pdf.line(pdfMargin + 20, 110, pageWidth - pdfMargin - 20, 110);
    
    // Test Result Badge - Large and Prominent
    const coverResultText = result.testResult === 'pass' ? 'PASSED' : 'FAILED';
    const coverResultColor = result.testResult === 'pass' ? [34, 197, 94] : [239, 68, 68];
    pdf.setFillColor(coverResultColor[0], coverResultColor[1], coverResultColor[2]);
    pdf.roundedRect(pageWidth / 2 - 40, 120, 80, 25, 5, 5, 'F');
    pdf.setFontSize(22);
    pdf.setTextColor(255, 255, 255);
    pdf.text(coverResultText, pageWidth / 2, 137, { align: 'center' });
    
    // Test Information Box
    pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(200, 200, 200);
    pdf.roundedRect(pdfMargin, 160, pageWidth - 2 * pdfMargin, 60, 5, 5, 'FD');
    
    pdf.setFontSize(12);
    pdf.setTextColor(60, 60, 60);
    pdf.setFont('helvetica', 'bold');
    let yPos = 172;
    pdf.text('Motor Type:', pdfMargin + 10, yPos);
    pdf.setFont('helvetica', 'normal');
    pdf.text(result.motorType, pdfMargin + 50, yPos);
    
    yPos += 10;
    pdf.setFont('helvetica', 'bold');
    pdf.text('Job Number:', pdfMargin + 10, yPos);
    pdf.setFont('helvetica', 'normal');
    pdf.text(result.jobNumber, pdfMargin + 50, yPos);
    
    yPos += 10;
    pdf.setFont('helvetica', 'bold');
    pdf.text('Report ID:', pdfMargin + 10, yPos);
    pdf.setFont('helvetica', 'normal');
    pdf.text(result.report, pdfMargin + 50, yPos);
    
    yPos += 10;
    pdf.setFont('helvetica', 'bold');
    pdf.text('Test Date:', pdfMargin + 10, yPos);
    pdf.setFont('helvetica', 'normal');
    pdf.text(result.createdAt.toLocaleString('en-US', { 
      dateStyle: 'long', 
      timeStyle: 'medium' 
    }), pdfMargin + 50, yPos);
    
    yPos += 10;
    pdf.setFont('helvetica', 'bold');
    pdf.text('Duration:', pdfMargin + 10, yPos);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`${result.testDuration.toFixed(2)} seconds`, pdfMargin + 50, yPos);
    
    // Footer
    pdf.setFontSize(10);
    pdf.setTextColor(150, 150, 150);
    pdf.setFont('helvetica', 'italic');
    pdf.text('Confidential - For Internal Use Only', pageWidth / 2, pageHeight - 15, { align: 'center' });
    pdf.text(`Generated: ${new Date().toLocaleString()}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
    
    // ==================== PAGE 2: EXECUTIVE SUMMARY ====================
    pdf.addPage();
    pdf.setTextColor(0, 0, 0);
    
    yPos = pdfMargin;
    
    // Page Header
    pdf.setFillColor(41, 98, 255);
    pdf.rect(0, 0, pageWidth, 15, 'F');
    pdf.setFontSize(10);
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.text('MOTOR PERFORMANCE TEST REPORT', pdfMargin, 10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Page 2 of 4`, pageWidth - pdfMargin, 10, { align: 'right' });
    
    pdf.setTextColor(0, 0, 0);
    yPos = 25;
    
    // Section: Executive Summary
    pdf.setFontSize(18);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(41, 98, 255);
    pdf.text('1. EXECUTIVE SUMMARY', pdfMargin, yPos);
    yPos += 10;
    
    // Test Result Badge
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    const summaryResultText = result.testResult === 'pass' ? 'RÉUSSI ✓' : 'ÉCHOUÉ ✗';
    const summaryResultColor = result.testResult === 'pass' ? [0, 150, 0] : [200, 0, 0];
    pdf.setTextColor(summaryResultColor[0], summaryResultColor[1], summaryResultColor[2]);
    pdf.text(`Résultat: ${summaryResultText}`, pageWidth / 2, yPos, { align: 'center' });
    pdf.setTextColor(0, 0, 0);
    
    yPos += 12;
    
    // Executive Summary Text
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(60, 60, 60);
    
    const summaryText = result.testResult === 'pass' 
      ? `This report presents the results of a comprehensive 10-second motor performance test conducted on ${result.motorType}. The motor successfully passed all performance criteria, demonstrating stable operation within acceptable parameters throughout the entire test duration. No critical deviations or exclude zone violations were detected.`
      : `This report presents the results of a comprehensive 10-second motor performance test conducted on ${result.motorType}. The motor FAILED the performance test due to operation within one or more exclude zones. Critical deviations from acceptable parameters were detected, requiring immediate attention and corrective action.`;
    
    const summaryLines = pdf.splitTextToSize(summaryText, pageWidth - 2 * pdfMargin);
    pdf.text(summaryLines, pdfMargin, yPos);
    yPos += summaryLines.length * 6 + 10;
    
    // Key Findings Box
    pdf.setFillColor(245, 245, 245);
    pdf.roundedRect(pdfMargin, yPos, pageWidth - 2 * pdfMargin, 45, 3, 3, 'F');
    pdf.setDrawColor(200, 200, 200);
    pdf.roundedRect(pdfMargin, yPos, pageWidth - 2 * pdfMargin, 45, 3, 3, 'S');
    
    yPos += 8;
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(41, 98, 255);
    pdf.text('Key Findings:', pdfMargin + 5, yPos);
    
    yPos += 8;
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(60, 60, 60);
    
    if (result.testData.length > 0) {
      const avgCurrent = result.testData.reduce((sum, d) => sum + d.current, 0) / result.testData.length;
      const maxCurrent = Math.max(...result.testData.map(d => d.current));
      const avgPower = result.testData.reduce((sum, d) => sum + d.power, 0) / result.testData.length;
      
      pdf.text(`• Average Current Draw: ${avgCurrent.toFixed(2)}A`, pdfMargin + 10, yPos);
      yPos += 6;
      pdf.text(`• Peak Current: ${maxCurrent.toFixed(2)}A`, pdfMargin + 10, yPos);
      yPos += 6;
      pdf.text(`• Average Power Consumption: ${avgPower.toFixed(2)}W`, pdfMargin + 10, yPos);
      yPos += 6;
      pdf.text(`• Test Duration: ${result.testDuration.toFixed(2)} seconds`, pdfMargin + 10, yPos);
      yPos += 6;
      pdf.text(`• Data Points Collected: ${result.testData.length}`, pdfMargin + 10, yPos);
    }
    
    yPos += 15;
    
    // Voltage-Current Plot
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Graphique Tension-Courant', 20, yPos);
    yPos += 5;
    
    // Draw the V-I plot
    const plotX = 20;
    const plotY = yPos;
    const plotWidth = pageWidth - 40;
    const plotHeight = 100;
    
    // Plot background
    pdf.setFillColor(250, 250, 250);
    pdf.rect(plotX, plotY, plotWidth, plotHeight, 'F');
    
    // Plot border
    pdf.setDrawColor(100, 100, 100);
    pdf.setLineWidth(0.5);
    pdf.rect(plotX, plotY, plotWidth, plotHeight, 'S');
    
    // Define plot margins
    const plotMargins = { left: 35, right: 10, top: 10, bottom: 25 };
    const graphX = plotX + plotMargins.left;
    const graphY = plotY + plotMargins.top;
    const graphWidth = plotWidth - plotMargins.left - plotMargins.right;
    const graphHeight = plotHeight - plotMargins.top - plotMargins.bottom;
    
    // Draw axes
    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(1);
    pdf.line(graphX, graphY + graphHeight, graphX + graphWidth, graphY + graphHeight); // X-axis
    pdf.line(graphX, graphY, graphX, graphY + graphHeight); // Y-axis
    
    // Axis labels
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Tension (V)', graphX + graphWidth / 2, plotY + plotHeight - 5, { align: 'center' });
    // Y-axis label (rotated text simulation with vertical positioning)
    pdf.text('Courant (A)', plotX + 5, graphY + graphHeight / 2, { align: 'center', angle: 90 });
    
    // Scale values
    const maxVoltage = 24;
    const maxCurrent = 30;
    
    // Draw grid
    pdf.setDrawColor(200, 200, 200);
    pdf.setLineWidth(0.3);
    for (let i = 0; i <= 4; i++) {
      const x = graphX + (i / 4) * graphWidth;
      pdf.line(x, graphY, x, graphY + graphHeight);
      
      // X-axis tick labels
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`${(i * 6)}`, x, graphY + graphHeight + 5, { align: 'center' });
    }
    for (let i = 0; i <= 5; i++) {
      const y = graphY + graphHeight - (i / 5) * graphHeight;
      pdf.line(graphX, y, graphX + graphWidth, y);
      
      // Y-axis tick labels
      pdf.setFontSize(8);
      pdf.text(`${(i * 6)}`, graphX - 5, y + 2, { align: 'right' });
    }
    
    // Draw exclude zones
    result.excludeZones.forEach(zone => {
      const x1 = graphX + (zone.minVoltage / maxVoltage) * graphWidth;
      const x2 = graphX + (zone.maxVoltage / maxVoltage) * graphWidth;
      const y1 = graphY + graphHeight - (zone.maxCurrent / maxCurrent) * graphHeight;
      const y2 = graphY + graphHeight - (zone.minCurrent / maxCurrent) * graphHeight;
      
      // Red zone with lighter fill color to simulate transparency
      pdf.setFillColor(255, 200, 200);
      pdf.rect(x1, y1, x2 - x1, y2 - y1, 'F');
      
      // Zone border
      pdf.setDrawColor(200, 0, 0);
      pdf.setLineWidth(1);
      pdf.rect(x1, y1, x2 - x1, y2 - y1, 'S');
      
      // Zone label
      pdf.setFontSize(7);
      pdf.setTextColor(200, 0, 0);
      pdf.text(zone.name, x1 + 2, y1 + 5);
      pdf.setTextColor(0, 0, 0);
    });
    
    // Plot test data
    if (result.testData.length > 1) {
      pdf.setDrawColor(41, 98, 255);
      pdf.setLineWidth(1.5);
      
      for (let i = 1; i < result.testData.length; i++) {
        const prev = result.testData[i - 1];
        const curr = result.testData[i];
        
        const x1 = graphX + (prev.voltage / maxVoltage) * graphWidth;
        const y1 = graphY + graphHeight - (prev.current / maxCurrent) * graphHeight;
        const x2 = graphX + (curr.voltage / maxVoltage) * graphWidth;
        const y2 = graphY + graphHeight - (curr.current / maxCurrent) * graphHeight;
        
        // Check if point is in exclude zone
        const inZone = result.excludeZones.some(zone =>
          curr.voltage >= zone.minVoltage && curr.voltage <= zone.maxVoltage &&
          curr.current >= zone.minCurrent && curr.current <= zone.maxCurrent
        );
        
        pdf.setDrawColor(inZone ? 200 : 41, inZone ? 0 : 98, inZone ? 0 : 255);
        pdf.line(x1, y1, x2, y2);
      }
      
      // Draw start and end points
      const firstPoint = result.testData[0];
      const lastPoint = result.testData[result.testData.length - 1];
      
      // Start point (green)
      const startX = graphX + (firstPoint.voltage / maxVoltage) * graphWidth;
      const startY = graphY + graphHeight - (firstPoint.current / maxCurrent) * graphHeight;
      pdf.setFillColor(0, 200, 0);
      pdf.circle(startX, startY, 2, 'F');
      
      // End point (red)
      const endX = graphX + (lastPoint.voltage / maxVoltage) * graphWidth;
      const endY = graphY + graphHeight - (lastPoint.current / maxCurrent) * graphHeight;
      pdf.setFillColor(200, 0, 0);
      pdf.circle(endX, endY, 2, 'F');
    }
    
    yPos += plotHeight + 10;
    
    // Footer for page 2
    pdf.setFontSize(8);
    pdf.setTextColor(150, 150, 150);
    pdf.text(`${result.report}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
    
    // ==================== PAGE 3: DETAILED ANALYSIS ====================
    pdf.addPage();
    
    // Page Header
    pdf.setFillColor(41, 98, 255);
    pdf.rect(0, 0, pageWidth, 15, 'F');
    pdf.setFontSize(10);
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.text('MOTOR PERFORMANCE TEST REPORT', pdfMargin, 10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Page 3 of 4`, pageWidth - pdfMargin, 10, { align: 'right' });
    
    pdf.setTextColor(0, 0, 0);
    yPos = 25;
    
    // Section 2: Test Methodology
    pdf.setFontSize(18);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(41, 98, 255);
    pdf.text('2. TEST METHODOLOGY', pdfMargin, yPos);
    yPos += 10;
    
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(60, 60, 60);
    
    const methodologyText = `The motor performance test was conducted using a standardized 10-second automated testing protocol. The test measures real-time voltage, current, and power consumption at high frequency (approximately ${result.testData.length / result.testDuration} samples per second). The motor is energized and monitored continuously throughout the test duration, with data collection extending 5 seconds beyond the active test period to capture deceleration characteristics.`;
    const methodLines = pdf.splitTextToSize(methodologyText, pageWidth - 2 * pdfMargin);
    pdf.text(methodLines, pdfMargin, yPos);
    yPos += methodLines.length * 6 + 8;
    
    // Test Parameters
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(41, 98, 255);
    pdf.text('Test Parameters:', pdfMargin, yPos);
    yPos += 8;
    
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(60, 60, 60);
    pdf.text(`• Test Duration: 10.0 seconds (active) + 5.0 seconds (monitoring)`, pdfMargin + 5, yPos);
    yPos += 6;
    pdf.text(`• Sampling Rate: ~${Math.round(result.testData.length / result.testDuration)} Hz`, pdfMargin + 5, yPos);
    yPos += 6;
    pdf.text(`• Voltage Range: 0-24V DC`, pdfMargin + 5, yPos);
    yPos += 6;
    pdf.text(`• Current Range: 0-30A`, pdfMargin + 5, yPos);
    yPos += 6;
    pdf.text(`• Exclude Zones Defined: ${result.excludeZones.length}`, pdfMargin + 5, yPos);
    yPos += 12;
    
    // Section 3: Detailed Statistics
    pdf.setFontSize(18);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(41, 98, 255);
    pdf.text('3. DETAILED STATISTICAL ANALYSIS', pdfMargin, yPos);
    yPos += 10;
    
    if (result.testData.length > 0) {
      const avgV = result.testData.reduce((sum, d) => sum + d.voltage, 0) / result.testData.length;
      const avgA = result.testData.reduce((sum, d) => sum + d.current, 0) / result.testData.length;
      const avgW = result.testData.reduce((sum, d) => sum + d.power, 0) / result.testData.length;
      const maxV = Math.max(...result.testData.map(d => d.voltage));
      const maxA = Math.max(...result.testData.map(d => d.current));
      const maxW = Math.max(...result.testData.map(d => d.power));
      const minV = Math.min(...result.testData.map(d => d.voltage));
      const minA = Math.min(...result.testData.map(d => d.current));
      const minW = Math.min(...result.testData.map(d => d.power));
      
      // Calculate standard deviations
      const stdDevA = Math.sqrt(result.testData.reduce((sum, d) => sum + Math.pow(d.current - avgA, 2), 0) / result.testData.length);
      const stdDevV = Math.sqrt(result.testData.reduce((sum, d) => sum + Math.pow(d.voltage - avgV, 2), 0) / result.testData.length);
      
      // Statistics Table
      pdf.setFillColor(245, 245, 245);
      pdf.roundedRect(pdfMargin, yPos, pageWidth - 2 * pdfMargin, 70, 3, 3, 'F');
      pdf.setDrawColor(200, 200, 200);
      pdf.roundedRect(pdfMargin, yPos, pageWidth - 2 * pdfMargin, 70, 3, 3, 'S');
      
      yPos += 8;
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(60, 60, 60);
      
      // Headers
      pdf.text('Parameter', pdfMargin + 5, yPos);
      pdf.text('Average', pdfMargin + 60, yPos);
      pdf.text('Minimum', pdfMargin + 100, yPos);
      pdf.text('Maximum', pdfMargin + 140, yPos);
      yPos += 2;
      
      // Separator line
      pdf.setDrawColor(200, 200, 200);
      pdf.line(pdfMargin + 5, yPos, pageWidth - pdfMargin - 5, yPos);
      yPos += 6;
      
      pdf.setFont('helvetica', 'normal');
      
      // Voltage row
      pdf.text('Voltage (V)', pdfMargin + 5, yPos);
      pdf.text(avgV.toFixed(2), pdfMargin + 60, yPos);
      pdf.text(minV.toFixed(2), pdfMargin + 100, yPos);
      pdf.text(maxV.toFixed(2), pdfMargin + 140, yPos);
      yPos += 8;
      
      // Current row
      pdf.text('Current (A)', pdfMargin + 5, yPos);
      pdf.text(avgA.toFixed(2), pdfMargin + 60, yPos);
      pdf.text(minA.toFixed(2), pdfMargin + 100, yPos);
      pdf.text(maxA.toFixed(2), pdfMargin + 140, yPos);
      yPos += 8;
      
      // Power row
      pdf.text('Power (W)', pdfMargin + 5, yPos);
      pdf.text(avgW.toFixed(2), pdfMargin + 60, yPos);
      pdf.text(minW.toFixed(2), pdfMargin + 100, yPos);
      pdf.text(maxW.toFixed(2), pdfMargin + 140, yPos);
      yPos += 8;
      
      // Additional metrics
      pdf.setFont('helvetica', 'bold');
      pdf.text('Additional Metrics:', pdfMargin + 5, yPos);
      yPos += 8;
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Current Std Dev: ${stdDevA.toFixed(3)}A`, pdfMargin + 5, yPos);
      pdf.text(`Voltage Std Dev: ${stdDevV.toFixed(3)}V`, pdfMargin + 100, yPos);
      yPos += 6;
      pdf.text(`Data Points: ${result.testData.length}`, pdfMargin + 5, yPos);
      pdf.text(`Total Energy: ${(avgW * result.testDuration).toFixed(2)}J`, pdfMargin + 100, yPos);
      
      yPos += 15;
      
      // Current vs Time Graph (simplified bar chart)
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(41, 98, 255);
      pdf.text('Current Distribution Over Time:', pdfMargin, yPos);
      yPos += 8;
      
      // Draw simplified current timeline
      const timelineWidth = pageWidth - 2 * pdfMargin;
      const timelineHeight = 30;
      const timelineX = pdfMargin;
      const timelineY = yPos;
      
      pdf.setFillColor(250, 250, 250);
      pdf.rect(timelineX, timelineY, timelineWidth, timelineHeight, 'F');
      pdf.setDrawColor(200, 200, 200);
      pdf.rect(timelineX, timelineY, timelineWidth, timelineHeight, 'S');
      
      // Sample every N points to create bars
      const sampleCount = 50;
      const step = Math.max(1, Math.floor(result.testData.length / sampleCount));
      const barWidth = timelineWidth / sampleCount;
      
      for (let i = 0; i < result.testData.length; i += step) {
        const point = result.testData[i];
        const barHeight = (point.current / maxA) * timelineHeight;
        const x = timelineX + (i / result.testData.length) * timelineWidth;
        
        pdf.setFillColor(41, 98, 255);
        pdf.rect(x, timelineY + timelineHeight - barHeight, barWidth * 0.8, barHeight, 'F');
      }
      
      yPos += timelineHeight + 10;
    }
    
    // Exclude Zones Section
    if (result.excludeZones.length > 0) {
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(41, 98, 255);
      pdf.text('Exclude Zones Configuration:', pdfMargin, yPos);
      yPos += 8;
      
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(60, 60, 60);
      
      result.excludeZones.forEach((zone, index) => {
        pdf.text(`${index + 1}. ${zone.name}`, pdfMargin + 5, yPos);
        yPos += 6;
        pdf.text(`   Time Range: ${(zone.minVoltage / 24 * 15).toFixed(1)}s - ${(zone.maxVoltage / 24 * 15).toFixed(1)}s`, pdfMargin + 10, yPos);
        yPos += 5;
        pdf.text(`   Current Range: ${zone.minCurrent.toFixed(2)}A - ${zone.maxCurrent.toFixed(2)}A`, pdfMargin + 10, yPos);
        yPos += 8;
      });
    }
    
    // Footer
    pdf.setFontSize(8);
    pdf.setTextColor(150, 150, 150);
    pdf.text(`${result.report}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
    
    // ==================== PAGE 4: CONCLUSIONS & RECOMMENDATIONS ====================
    pdf.addPage();
    
    // Page Header
    pdf.setFillColor(41, 98, 255);
    pdf.rect(0, 0, pageWidth, 15, 'F');
    pdf.setFontSize(10);
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.text('MOTOR PERFORMANCE TEST REPORT', pdfMargin, 10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Page 4 of 4`, pageWidth - pdfMargin, 10, { align: 'right' });
    
    pdf.setTextColor(0, 0, 0);
    yPos = 25;
    
    // Section 4: Conclusions
    pdf.setFontSize(18);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(41, 98, 255);
    pdf.text('4. CONCLUSIONS', pdfMargin, yPos);
    yPos += 10;
    
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(60, 60, 60);
    
    const conclusionText = result.testResult === 'pass'
      ? `Based on the comprehensive analysis of the test data, the ${result.motorType} (Job #${result.jobNumber}) has successfully passed all performance criteria. The motor demonstrated stable electrical characteristics throughout the test duration, with no violations of defined exclude zones. Current draw remained within acceptable limits, and no anomalous behavior was detected. The motor is deemed suitable for its intended application and meets all quality standards.`
      : `Based on the comprehensive analysis of the test data, the ${result.motorType} (Job #${result.jobNumber}) has FAILED the performance test. Critical violations of exclude zone parameters were detected during the test period. The motor exhibited electrical characteristics outside acceptable operating ranges, indicating potential defects or performance issues. Immediate corrective action is required before this motor can be approved for use.`;
    
    const conclusionLines = pdf.splitTextToSize(conclusionText, pageWidth - 2 * pdfMargin);
    pdf.text(conclusionLines, pdfMargin, yPos);
    yPos += conclusionLines.length * 6 + 12;
    
    // Section 5: Recommendations
    pdf.setFontSize(18);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(41, 98, 255);
    pdf.text('5. RECOMMENDATIONS', pdfMargin, yPos);
    yPos += 10;
    
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(60, 60, 60);
    
    if (result.testResult === 'pass') {
      const recommendations = [
        '• Motor approved for production use',
        '• Maintain current quality control procedures',
        '• Archive test data for future reference and trend analysis',
        '• Schedule periodic re-testing as per maintenance schedule',
        '• Document motor serial number and test results in quality database'
      ];
      
      recommendations.forEach(rec => {
        pdf.text(rec, pdfMargin, yPos);
        yPos += 7;
      });
    } else {
      const recommendations = [
        '• DO NOT approve motor for production use',
        '• Conduct detailed failure analysis to identify root cause',
        '• Inspect motor windings, bearings, and electrical connections',
        '• Verify motor specifications match design requirements',
        '• Re-test motor after corrective actions are implemented',
        '• Document failure mode and corrective actions taken',
        '• Consider batch testing if multiple units from same lot'
      ];
      
      recommendations.forEach(rec => {
        pdf.text(rec, pdfMargin, yPos);
        yPos += 7;
      });
    }
    
    yPos += 15;
    
    // Approval Section
    pdf.setFillColor(245, 245, 245);
    pdf.roundedRect(pdfMargin, yPos, pageWidth - 2 * pdfMargin, 50, 3, 3, 'F');
    pdf.setDrawColor(200, 200, 200);
    pdf.roundedRect(pdfMargin, yPos, pageWidth - 2 * pdfMargin, 50, 3, 3, 'S');
    
    yPos += 10;
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(60, 60, 60);
    pdf.text('APPROVAL SIGNATURES', pdfMargin + 5, yPos);
    yPos += 12;
    
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    
    // Signature lines
    pdf.text('Tested By: _________________________', pdfMargin + 10, yPos);
    pdf.text('Date: __________', pdfMargin + 120, yPos);
    yPos += 12;
    pdf.text('Reviewed By: _______________________', pdfMargin + 10, yPos);
    pdf.text('Date: __________', pdfMargin + 120, yPos);
    yPos += 12;
    pdf.text('Approved By: _______________________', pdfMargin + 10, yPos);
    pdf.text('Date: __________', pdfMargin + 120, yPos);
    
    yPos += 20;
    
    // Final Notes
    pdf.setFontSize(9);
    pdf.setTextColor(100, 100, 100);
    pdf.setFont('helvetica', 'italic');
    const notesText = 'This report is generated automatically by the REMAN LAB Motor Testing System. All measurements are traceable to calibrated instruments. For questions or clarifications, please contact the Quality Assurance department.';
    const notesLines = pdf.splitTextToSize(notesText, pageWidth - 2 * pdfMargin);
    pdf.text(notesLines, pdfMargin, yPos);
    
    // Final Footer
    pdf.setFontSize(8);
    pdf.setTextColor(150, 150, 150);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Report ID: ${result.report}`, pageWidth / 2, pageHeight - 15, { align: 'center' });
    pdf.text(`Generated: ${new Date().toLocaleString()}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
    
    // Save PDF
    pdf.save(`${result.report}.pdf`);
  };

  const handleDeleteResult = (resultId: string) => {
    setTestResults(prev => prev.filter(result => result.id !== resultId));
  };

  const handleSaveToDatabase = async (result: MotorTestResult, category: 'good' | 'bad') => {
    try {
      await invoke('save_motor_test', {
        test: {
          ...result,
          category,
          testData: JSON.stringify(result.testData),
          excludeZones: JSON.stringify(result.excludeZones),
        }
      });
      alert(`Motor test saved to ${category} motors database`);
      generatePDF(result);
      await loadTestResults();
    } catch (error) {
      console.error('Error saving test result:', error);
      alert('Failed to save motor test: ' + String(error));
    }
  };

  return (
    <div className="space-y-6">
      {/* Motor Information */}
      <div className="glass-effect rounded-xl p-6">
        <h2 className="card-header">
          Motor Information
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Motor Type
            </label>
            <input
              type="text"
              value={motorType}
              onChange={(e) => setMotorType(e.target.value)}
              className="input-field"
              placeholder="e.g., Bosch 12V DC"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Job Number
            </label>
            <input
              type="text"
              value={jobNumber}
              onChange={(e) => setJobNumber(e.target.value)}
              className="input-field"
              placeholder="e.g., JOB-2024-001"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Report
            </label>
            <input
              type="text"
              value={report}
              onChange={(e) => setReport(e.target.value)}
              className="input-field"
              placeholder="e.g., RPT-2024-001"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Power Control */}
        <div className="space-y-4">
          <PowerIndicators 
            sendMessage={sendMessageAdapter}
            onPowerStatusChange={(powerOn, ignitionOn) => {
              setIsPowerOn(powerOn);
              setIsIgnitionOn(ignitionOn);
            }}
          />
        </div>

        {/* Test Control */}
        <div className="glass-effect rounded-xl p-6">
          <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">
            Test Control
          </h3>
          
          <div className="space-y-4">
            {/* Test Status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={clsx(
                  'w-3 h-3 rounded-full',
                  isTestRunning ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
                )} />
                <span className="text-sm font-medium">
                  {isTestRunning ? 'Test Running' : 'Test Idle'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                <ClockIcon className="h-4 w-4" />
                {testDuration.toFixed(1)}s / 10.0s
              </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
              <div 
                className="bg-primary-500 h-2 rounded-full transition-all duration-200"
                style={{ width: `${Math.min((testDuration / 10) * 100, 100)}%` }}
              />
            </div>

            {/* Test Button */}
            <button
              onClick={handleStartTest}
              disabled={!isESP32Connected || !motorType || !jobNumber || isTestRunning}
              className={clsx(
                'w-full py-3 px-4 flex items-center justify-center gap-2',
                (!isESP32Connected || !motorType || !jobNumber || isTestRunning) ? 'btn-secondary opacity-50 cursor-not-allowed' : 'btn-success'
              )}
            >
              {isTestRunning ? (
                <>
                  <StopIcon className="h-5 w-5" />
                  Stop Test
                </>
              ) : (
                <>
                  <PlayIcon className="h-5 w-5" />
                  Start 10s Test
                </>
              )}
            </button>

            {/* Test Result */}
            {currentTestResult !== 'pending' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className={clsx(
                  'p-4 rounded-lg flex items-center gap-3',
                  currentTestResult === 'pass'
                    ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                    : 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
                )}
              >
                {currentTestResult === 'pass' ? (
                  <CheckCircleIcon className="h-6 w-6" />
                ) : (
                  <XCircleIcon className="h-6 w-6" />
                )}
                <div>
                  <div className="font-semibold">
                    Test {currentTestResult === 'pass' ? 'PASSED' : 'FAILED'}
                  </div>
                  <div className="text-sm">
                    {currentTestResult === 'pass' 
                      ? 'Motor stayed within acceptable parameters'
                      : 'Motor entered exclude zone during test'
                    }
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </div>

      {/* Real-time Plot */}
      <div className="glass-effect rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
            Real-time Motor Performance
          </h3>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-500 rounded-full" />
              <span>Test Data</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded-full" />
              <span>Exclude Zones</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded-full" />
              <span>Current Point</span>
            </div>
          </div>
        </div>
        
        <div className="relative">
          <canvas
            ref={canvasRef}
            className="w-full h-80 bg-slate-50 dark:bg-slate-800 rounded-lg"
          />
          
          {/* Current Values Overlay */}
          <div className="absolute top-4 left-4 bg-white/90 dark:bg-slate-800/90 rounded-lg p-3 space-y-1">
            <div className="text-sm font-medium">Current Values:</div>
            <div className="text-xs space-y-1">
              <div>Voltage: {currentData.voltage.toFixed(2)}V</div>
              <div>Current: {currentData.current.toFixed(2)}A</div>
              <div>Power: {currentData.power.toFixed(2)}W</div>
            </div>
          </div>
        </div>
      </div>

      {/* Exclude Zones Management */}
      <div className="glass-effect rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
              Exclude Zones
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Define forbidden operating ranges for motor testing
            </p>
          </div>
          <button
            onClick={() => setIsAddingZone(true)}
            className="btn-primary flex items-center gap-2 shadow-md hover:shadow-lg transition-all"
          >
            <PlusIcon className="h-5 w-5" />
            Add Zone
          </button>
        </div>

        {excludeZones.length === 0 ? (
          <div className="text-center py-12 bg-slate-50 dark:bg-slate-800/50 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600">
            <div className="text-slate-400 dark:text-slate-500 mb-3">
              <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <p className="text-slate-600 dark:text-slate-400 font-medium">No exclude zones defined</p>
            <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">Click "Add Zone" to create forbidden operating ranges</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {excludeZones.map(zone => (
              <motion.div
                key={zone.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-900/30 border-2 border-red-300 dark:border-red-700 rounded-xl p-4 shadow-md hover:shadow-lg transition-all"
              >
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-red-900 dark:text-red-200 flex items-center gap-2">
                    <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                    {zone.name}
                  </h4>
                  <button
                    onClick={() => handleDeleteZone(zone.id)}
                    className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 transition-colors p-1 hover:bg-red-200 dark:hover:bg-red-800 rounded"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
                <div className="text-sm text-red-800 dark:text-red-300 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Time:</span>
                    <span>{(zone.minVoltage / 24 * 15).toFixed(1)}s - {(zone.maxVoltage / 24 * 15).toFixed(1)}s</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Current:</span>
                    <span>{zone.minCurrent.toFixed(1)}A - {zone.maxCurrent.toFixed(1)}A</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Add Zone Modal */}
        <AnimatePresence>
          {isAddingZone && (
            <>
              <div 
                className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9998]" 
                onClick={() => setIsAddingZone(false)}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="fixed inset-0 flex items-center justify-center z-[9999] pointer-events-none"
              >
                <div className="pointer-events-auto">
                <div className="glass-effect rounded-xl p-6 max-w-lg w-full mx-4">
                  <h2 className="card-header">
                    Add Exclude Zone
                  </h2>
                  <div className="space-y-4">
                    {/* Zone Creation Method */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Creation Method
                      </label>
                      <div className="space-y-2">
                        <label className="flex items-center">
                          <input
                            type="radio"
                            name="zoneMethod"
                            checked={!selectedReferenceTest}
                            onChange={() => setSelectedReferenceTest(null)}
                            className="mr-2"
                          />
                          Manual Zone Definition
                        </label>
                        <label className="flex items-center">
                          <input
                            type="radio"
                            name="zoneMethod"
                            checked={!!selectedReferenceTest}
                            onChange={() => {}}
                            className="mr-2"
                          />
                          Based on Reference Test (with margin)
                        </label>
                      </div>
                    </div>

                    {/* Reference Test Selection */}
                    {selectedReferenceTest !== null && (
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Reference Test (Good Motor)
                        </label>
                        <select
                          value={selectedReferenceTest || ''}
                          onChange={e => setSelectedReferenceTest(e.target.value || null)}
                          className="w-full px-3 py-2 rounded-lg bg-white/50 dark:bg-slate-800/50 
                            border border-slate-200 dark:border-slate-700
                            focus:outline-none focus:ring-2 focus:ring-primary-500"
                        >
                          <option value="">Select a reference test...</option>
                          {testResults.filter(test => test.testResult === 'pass').map(test => (
                            <option key={test.id} value={test.id}>
                              {test.motorType} - {test.jobNumber} ({test.createdAt.toLocaleDateString()})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Margin Input for Reference Method */}
                    {selectedReferenceTest && (
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Current Margin (±A)
                        </label>
                        <input
                          type="number"
                          value={zoneMargin}
                          onChange={e => setZoneMargin(parseFloat(e.target.value) || 0)}
                          step="0.1"
                          min="0"
                          className="w-full px-3 py-2 rounded-lg bg-white/50 dark:bg-slate-800/50 
                            border border-slate-200 dark:border-slate-700
                            focus:outline-none focus:ring-2 focus:ring-primary-500"
                          placeholder="e.g., 2.0"
                        />
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                          Zone will extend ±{zoneMargin}A above and below the reference trace
                        </p>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Zone Name
                      </label>
                      <input
                        type="text"
                        value={newZone.name}
                        onChange={e => setNewZone(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg bg-white/50 dark:bg-slate-800/50 
                          border border-slate-200 dark:border-slate-700
                          focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder={selectedReferenceTest ? "Auto-generated if empty" : "e.g., Danger Zone"}
                      />
                    </div>
                    {/* Manual Zone Parameters - only show if not using reference */}
                    {!selectedReferenceTest && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                            Min Time (s)
                          </label>
                          <input
                            type="number"
                            value={(newZone.minVoltage / 24) * maxTimeScale}
                            onChange={e => {
                              const timeValue = parseFloat(e.target.value) || 0;
                              const voltageValue = (timeValue / maxTimeScale) * 24;
                              setNewZone(prev => ({ ...prev, minVoltage: voltageValue }));
                            }}
                            step="0.1"
                            min="0"
                            max={maxTimeScale}
                            className="w-full px-3 py-2 rounded-lg bg-white/50 dark:bg-slate-800/50 
                              border border-slate-200 dark:border-slate-700
                              focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                            Max Time (s)
                          </label>
                          <input
                            type="number"
                            value={(newZone.maxVoltage / 24) * maxTimeScale}
                            onChange={e => {
                              const timeValue = parseFloat(e.target.value) || 0;
                              const voltageValue = (timeValue / maxTimeScale) * 24;
                              setNewZone(prev => ({ ...prev, maxVoltage: voltageValue }));
                            }}
                            step="0.1"
                            min="0"
                            max={maxTimeScale}
                            className="w-full px-3 py-2 rounded-lg bg-white/50 dark:bg-slate-800/50 
                              border border-slate-200 dark:border-slate-700
                              focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                            Min Current (A)
                          </label>
                          <input
                            type="number"
                            value={newZone.minCurrent}
                            onChange={e => setNewZone(prev => ({ ...prev, minCurrent: parseFloat(e.target.value) || 0 }))}
                            step="0.1"
                            min="0"
                            className="w-full px-3 py-2 rounded-lg bg-white/50 dark:bg-slate-800/50 
                              border border-slate-200 dark:border-slate-700
                              focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                            Max Current (A)
                          </label>
                          <input
                            type="number"
                            value={newZone.maxCurrent}
                            onChange={e => setNewZone(prev => ({ ...prev, maxCurrent: parseFloat(e.target.value) || 0 }))}
                            step="0.1"
                            min="0"
                            className="w-full px-3 py-2 rounded-lg bg-white/50 dark:bg-slate-800/50 
                              border border-slate-200 dark:border-slate-700
                              focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                        </div>
                      </div>
                    )}
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => setIsAddingZone(false)}
                        className="px-4 py-2 rounded-lg font-medium
                          text-slate-600 dark:text-slate-400
                          hover:bg-slate-900/5 dark:hover:bg-slate-50/5
                          transition-all duration-200"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleAddExcludeZone}
                        disabled={selectedReferenceTest ? !selectedReferenceTest : !newZone.name}
                        className="px-4 py-2 rounded-lg font-medium
                          bg-primary-500 hover:bg-primary-600 text-white
                          disabled:opacity-50 disabled:cursor-not-allowed
                          transition-all duration-200"
                      >
                        {selectedReferenceTest ? 'Create Zone from Reference' : 'Add Zone'}
                      </button>
                    </div>
                  </div>
                </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Test Results History */}
      <div className="glass-effect rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
          <div>
            <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
              Test Results History
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              {testResults.length} test{testResults.length !== 1 ? 's' : ''} recorded
            </p>
          </div>
          <button
            onClick={loadTestResults}
            disabled={isLoadingResults}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg
              transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed
              flex items-center gap-2 shadow-md hover:shadow-lg"
          >
            {isLoadingResults ? (
              <>
                <ClockIcon className="h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </>
            )}
          </button>
        </div>
        
        {isLoadingResults ? (
          <div className="flex items-center justify-center py-8">
            <ClockIcon className="h-6 w-6 animate-spin text-slate-400" />
            <span className="ml-2 text-slate-600 dark:text-slate-400">Loading test results...</span>
          </div>
        ) : testResults.length > 0 ? (
          <div className="space-y-3">
            {testResults.map((result, index) => (
              <motion.div
                key={result.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={clsx(
                  'border-2 rounded-xl p-5 transition-all hover:shadow-lg',
                  result.testResult === 'pass'
                    ? 'border-green-200 dark:border-green-800 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20'
                    : 'border-red-200 dark:border-red-800 bg-gradient-to-r from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/20'
                )}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className={clsx(
                      'p-2 rounded-lg',
                      result.testResult === 'pass' ? 'bg-green-100 dark:bg-green-800' : 'bg-red-100 dark:bg-red-800'
                    )}>
                      {result.testResult === 'pass' ? (
                        <CheckCircleIcon className="h-7 w-7 text-green-600 dark:text-green-400" />
                      ) : (
                        <XCircleIcon className="h-7 w-7 text-red-600 dark:text-red-400" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-slate-900 dark:text-white">{result.motorType}</span>
                        <span className="text-slate-400">•</span>
                        <span className="text-slate-700 dark:text-slate-300">{result.jobNumber}</span>
                        <span className={clsx(
                          'px-2 py-0.5 rounded-full text-xs font-medium',
                          result.testResult === 'pass'
                            ? 'bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200'
                            : 'bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200'
                        )}>
                          {result.testResult.toUpperCase()}
                        </span>
                      </div>
                      <div className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
                        <div className="flex items-center gap-2">
                          <ClockIcon className="h-4 w-4" />
                          {result.createdAt.toLocaleString()}
                        </div>
                        <div className="flex items-center gap-4">
                          <span>Duration: {result.testDuration.toFixed(1)}s</span>
                          <span>•</span>
                          <span>Data Points: {result.testData.length}</span>
                          {result.report && (
                            <>
                              <span>•</span>
                              <span className="font-mono text-xs">{result.report}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => generatePDF(result)}
                      className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg
                        transition-all duration-200 flex items-center gap-2 shadow-md hover:shadow-lg"
                    >
                      <DocumentArrowDownIcon className="h-4 w-4" />
                      PDF Report
                    </button>
                    <button
                      onClick={() => handleSaveToDatabase(result, 'good')}
                      className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg
                        transition-all duration-200 shadow-md hover:shadow-lg"
                    >
                      ✓ Good
                    </button>
                    <button
                      onClick={() => handleSaveToDatabase(result, 'bad')}
                      className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg
                        transition-all duration-200 shadow-md hover:shadow-lg"
                    >
                      ✗ Bad
                    </button>
                    <button
                      onClick={() => handleDeleteResult(result.id)}
                      className="px-3 py-2 bg-slate-500 hover:bg-slate-600 text-white text-sm rounded-lg
                        transition-all duration-200 flex items-center gap-1 shadow-md hover:shadow-lg"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 bg-slate-50 dark:bg-slate-800/50 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600">
            <div className="text-slate-400 dark:text-slate-500 mb-4">
              <svg className="w-20 h-20 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-slate-600 dark:text-slate-400 font-medium text-lg">No test results yet</p>
            <p className="text-sm text-slate-500 dark:text-slate-500 mt-2">Complete a motor test to see results here</p>
          </div>
        )}
      </div>
    </div>
  );
};
