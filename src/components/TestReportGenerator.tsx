"use client";

import { useState } from 'react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { ABSData } from '@/lib/absData';

interface TestResult {
  testName: string;
  status: 'pass' | 'fail' | 'warning';
  value?: string;
  expectedValue?: string;
}

interface PowerDataPoint {
  time: number;  // Time in milliseconds
  value: number; // Power value
}

interface PowerData {
  actual: PowerDataPoint[];
  minGood: number;
  maxGood: number;
}

interface TestReportGeneratorProps {
  absData: ABSData | null;
  testResults: TestResult[];
  powerData?: PowerData; // Optional power data for the graph
  isPowerOn?: boolean; // Power supply state
  isIgnitionOn?: boolean; // Ignition state
  onGenerateReport: () => void;
}

export default function TestReportGenerator({
  absData,
  testResults = [],
  powerData,
  isPowerOn = false,
  isIgnitionOn = false,
  onGenerateReport
}: TestReportGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  // Generate mock power data for testing if none provided
  const getMockPowerData = (): PowerData => {
    const mockData: PowerData = {
      actual: [],
      minGood: 10,
      maxGood: 15
    };
    
    // Generate 20 data points
    for (let i = 0; i < 20; i++) {
      // Simulate some values inside and outside the good range
      let value: number;
      if (i > 5 && i < 10) {
        // Out of range - too high
        value = mockData.maxGood + 2 + Math.random() * 3;
      } else if (i > 15) {
        // Out of range - too low
        value = mockData.minGood - 2 - Math.random() * 1.5;
      } else {
        // Within good range
        value = mockData.minGood + Math.random() * (mockData.maxGood - mockData.minGood);
      }
      
      mockData.actual.push({
        time: i * 100, // 100ms intervals
        value
      });
    }
    
    return mockData;
  };
  
  // Draw a power graph on the PDF
  const drawPowerGraph = (doc: jsPDF, data: PowerData, x: number, y: number, width: number, height: number) => {
    // Error handling for empty data
    if (!data?.actual || data.actual.length === 0) {
      // Draw placeholder text if no data is available
      doc.setFontSize(12);
      doc.setTextColor(100, 100, 100);
      doc.text('No power data available for graph', x + width/2, y + height/2, { align: 'center' });
      return;
    }
    
    // Error handling for insufficient data points (need at least 2 for a line)
    if (data.actual.length < 2) {
      doc.setFontSize(12);
      doc.setTextColor(100, 100, 100);
      doc.text('Insufficient power data points for graph', x + width/2, y + height/2, { align: 'center' });
      return;
    }
    
    // Define margins
    const margin = { left: 40, right: 10, top: 10, bottom: 30 };
    
    // Calculate the actual drawing area
    const graphX = x + margin.left;
    const graphY = y + margin.top;
    const graphWidth = width - margin.left - margin.right;
    const graphHeight = height - margin.top - margin.bottom;
    
    // Safe access of data values with error handling
    try {
      // Find value range for scaling
      const allValues = data.actual.map(p => p.value || 0); // Handle missing values
      if (allValues.length === 0) throw new Error('No valid data points');
      
      const minValue = Math.min(...allValues, data.minGood) - 1; // Add some padding
      const maxValue = Math.max(...allValues, data.maxGood) + 1; // Add some padding
      const valueRange = maxValue - minValue;
      
      // Time range - with safeguards against undefined
      const firstTime = data.actual[0]?.time || 0;
      const lastTime = data.actual[data.actual.length - 1]?.time || 1; // Default to 1 to avoid division by zero
      const timeRange = Math.max(lastTime - firstTime, 1); // Ensure minimum timeRange of 1 to avoid division by zero
      
      // Draw axes
      doc.setDrawColor(0);
      doc.setLineWidth(0.5);
      doc.line(graphX, graphY, graphX, graphY + graphHeight); // Y-axis
      doc.line(graphX, graphY + graphHeight, graphX + graphWidth, graphY + graphHeight); // X-axis
      
      // Draw good range as light gray overlay
      const goodMinY = graphY + graphHeight - ((data.minGood - minValue) / valueRange * graphHeight);
      const goodMaxY = graphY + graphHeight - ((data.maxGood - minValue) / valueRange * graphHeight);
      doc.setFillColor(220, 220, 220); // Light gray
      doc.rect(graphX, goodMaxY, graphWidth, goodMinY - goodMaxY, 'F');
      
      // Draw "good range" label
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text('Good Range', graphX + 5, (goodMinY + goodMaxY) / 2);
      
      // Draw y-axis labels
      doc.setTextColor(0);
      doc.text(minValue.toFixed(1), graphX - 5, graphY + graphHeight, { align: 'right' });
      doc.text(maxValue.toFixed(1), graphX - 5, graphY, { align: 'right' });
      doc.text('Power', graphX - 25, graphY + graphHeight / 2, { align: 'center', angle: 90 });
      
      // Draw x-axis labels
      doc.text('0', graphX, graphY + graphHeight + 10);
      doc.text(`${(timeRange/1000).toFixed(1)}s`, graphX + graphWidth, graphY + graphHeight + 10, { align: 'right' });
      doc.text('Time (s)', graphX + graphWidth / 2, graphY + graphHeight + 25, { align: 'center' });
      
      // Plot power data points
      for (let i = 1; i < data.actual.length; i++) {
        const prevPoint = data.actual[i-1] || { time: 0, value: 0 };
        const currPoint = data.actual[i] || { time: 0, value: 0 };
        
        // Skip invalid data points
        if (prevPoint.time === undefined || currPoint.time === undefined ||
            prevPoint.value === undefined || currPoint.value === undefined) {
          continue;
        }
        
        // Convert to coordinates
        const x1 = graphX + ((prevPoint.time - firstTime) / timeRange * graphWidth);
        const y1 = graphY + graphHeight - ((prevPoint.value - minValue) / valueRange * graphHeight);
        const x2 = graphX + ((currPoint.time - firstTime) / timeRange * graphWidth);
        const y2 = graphY + graphHeight - ((currPoint.value - minValue) / valueRange * graphHeight);
        
        // Determine color based on the good range
        if (
          (prevPoint.value >= data.minGood && prevPoint.value <= data.maxGood) &&
          (currPoint.value >= data.minGood && currPoint.value <= data.maxGood)
        ) {
          doc.setDrawColor(0, 150, 0); // Green for values in the good range
        } else {
          doc.setDrawColor(200, 0, 0); // Red for values outside the good range
        }
        
        doc.setLineWidth(1.5);
        doc.line(x1, y1, x2, y2);
      }
    } catch (error) {
      console.error('Error drawing power graph:', error);
      // Draw error message in the graph area
      doc.setFontSize(12);
      doc.setTextColor(200, 0, 0); // Red for error
      doc.text('Error generating power graph', x + width/2, y + height/2, { align: 'center' });
    } finally {
      // Always reset colors regardless of success or failure
      doc.setDrawColor(0);
      doc.setTextColor(0);
    }
  };
  
  const generatePDF = () => {
    if (!absData) return;

    setIsGenerating(true);
    
    // Create new PDF document
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    // Header with colored background
    doc.setFillColor(41, 128, 185); // Professional blue
    doc.rect(0, 0, pageWidth, 45, 'F');
    
    // Add title
    doc.setFontSize(22);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text('Rapport de Test ABS', pageWidth / 2, 20, { align: 'center' });
    
    // Add subtitle
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text('Test Hydraulique & Diagnostic Vitesse Roue', pageWidth / 2, 30, { align: 'center' });
    
    // Add timestamp
    const now = new Date();
    doc.setFontSize(9);
    doc.text(`Généré le: ${now.toLocaleDateString('fr-FR')} à ${now.toLocaleTimeString('fr-FR')}`, pageWidth / 2, 38, { align: 'center' });
    
    // Reset text color
    doc.setTextColor(0, 0, 0);
    
    // Draw colored circles for power and ignition states
    const drawStatusCircle = (x: number, y: number, isOn: boolean) => {
      doc.setDrawColor(0);
      doc.setLineWidth(0.5);
      doc.circle(x, y, 2, 'S');
      
      if (isOn) {
        doc.setFillColor(46, 204, 113); // Green
      } else {
        doc.setFillColor(231, 76, 60); // Red
      }
      doc.circle(x, y, 2, 'F');
    };
    
    // Start with initial y position for content
    let yPos = 58;
    
    // Power Status Section with background
    doc.setFillColor(245, 245, 245);
    doc.rect(15, yPos - 5, pageWidth - 30, 25, 'F');
    
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('État de l\'Alimentation', 20, yPos);
    yPos += 8;
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    
    // Power supply status
    doc.text('Alimentation:', 25, yPos);
    drawStatusCircle(65, yPos - 1.5, isPowerOn);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(isPowerOn ? 46 : 231, isPowerOn ? 204 : 76, isPowerOn ? 113 : 60);
    doc.text(isPowerOn ? 'ACTIVÉE' : 'DÉSACTIVÉE', 70, yPos);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    yPos += 7;
    
    // Ignition status
    doc.text('Allumage:', 25, yPos);
    drawStatusCircle(65, yPos - 1.5, isIgnitionOn);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(isIgnitionOn ? 46 : 231, isIgnitionOn ? 204 : 76, isIgnitionOn ? 113 : 60);
    doc.text(isIgnitionOn ? 'ACTIVÉ' : 'DÉSACTIVÉ', 70, yPos);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    yPos += 15;
    
    // Add ABS data section with background
    doc.setFillColor(245, 245, 245);
    doc.rect(15, yPos - 3, pageWidth - 30, 52, 'F');
    
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Informations du Module ABS', 20, yPos);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    yPos += 8;
    
    const absInfo = [
      `Référence: ${absData.reference}`,
      `Fabricant: ${absData.manufacturer}`,
      `Type WSS: ${absData.wssType || 'Inconnu'}`,
      `Adaptateur ABS: ${absData.absAdapter || 'N/A'}`,
      `Connecteur ABS: ${absData.absConnector || 'N/A'}`,
      `Validé: ${absData.testValidated === 'Yes' ? 'Oui' : 'Non'}`
    ];
    absInfo.forEach(info => {
      doc.text(info, 25, yPos);
      yPos += 7;
    });
    
    yPos += 8;
    
    // Add CAN info with background
    doc.setFillColor(245, 245, 245);
    doc.rect(15, yPos - 3, pageWidth - 30, 35, 'F');
    
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Paramètres de Communication CAN', 20, yPos);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    yPos += 8;
    
    const canInfo = [
      `Vitesse CAN: ${absData.canSpeed || '250'} kbps`,
      `Octet CAN: ${absData.canByte || '0'}`,
      `ID Ligne CAN: ${absData.canIdLine || 'N/A'}`,
      `Valeur CAN: ${absData.canValue ? `0x${parseInt(absData.canValue, 10).toString(16).toUpperCase()}` : '0x00'}`
    ];
    
    canInfo.forEach(info => {
      doc.text(info, 25, yPos);
      yPos += 7;
    });
    
    yPos += 8;
    
    // Add test results table
    if (testResults.length > 0) {
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('Résultats des Tests', 20, yPos);
      
      // Table headers with background
      yPos += 8;
      doc.setFillColor(41, 128, 185);
      doc.rect(15, yPos - 5, pageWidth - 30, 8, 'F');
      
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text('Nom du Test', 20, yPos);
      doc.text('Statut', 110, yPos);
      doc.text('Valeur', 145, yPos);
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
      
      // Table content
      yPos += 8;
      testResults.forEach((result, index) => {
        // Check if we need a new page
        if (yPos > 260) {
          doc.addPage();
          yPos = 20;
          
          // Add headers on the new page
          doc.setFillColor(41, 128, 185);
          doc.rect(15, yPos - 5, pageWidth - 30, 8, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(255, 255, 255);
          doc.text('Nom du Test', 20, yPos);
          doc.text('Statut', 110, yPos);
          doc.text('Valeur', 145, yPos);
          doc.setTextColor(0, 0, 0);
          doc.setFont('helvetica', 'normal');
          yPos += 8;
        }
        
        // Alternating row background
        if (index % 2 === 0) {
          doc.setFillColor(250, 250, 250);
          doc.rect(15, yPos - 5, pageWidth - 30, 7, 'F');
        }
        
        doc.setFontSize(10);
        doc.text(result.testName, 20, yPos);
        
        // Set color based on status
        let textColor;
        let statusText;
        switch(result.status) {
          case 'pass':
            textColor = [46, 204, 113]; // Green
            statusText = 'RÉUSSI';
            break;
          case 'fail':
            textColor = [231, 76, 60]; // Red
            statusText = 'ÉCHOUÉ';
            break;
          case 'warning':
            textColor = [243, 156, 18]; // Orange
            statusText = 'ALERTE';
            break;
          default:
            textColor = [0, 0, 0]; // Black
            statusText = String(result.status).toUpperCase();
        }
        
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(textColor[0], textColor[1], textColor[2]);
        doc.text(statusText, 110, yPos);
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'normal');
        
        if (result.value) {
          const valueText = result.expectedValue 
            ? `${result.value} (Attendu: ${result.expectedValue})` 
            : result.value;
          doc.text(valueText, 145, yPos);
        }
        
        yPos += 7;
      });
      
      yPos += 5;
    }
    
    // Add comments
    if (absData.comments) {
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('Commentaires Additionnels', 20, yPos + 5);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      
      // Handle multiline comments
      const splitComments = doc.splitTextToSize(absData.comments, pageWidth - 40);
      yPos += 12;
      
      // Check if we need a new page
      if (yPos + splitComments.length * 6 > 260) {
        doc.addPage();
        yPos = 20;
      }
      
      // Background for comments
      doc.setFillColor(255, 251, 230);
      doc.rect(15, yPos - 3, pageWidth - 30, splitComments.length * 5 + 6, 'F');
      
      doc.text(splitComments, 20, yPos);
      yPos += splitComments.length * 5 + 10;
    }
    
    // Get or generate power data
    const finalPowerData = powerData || getMockPowerData();
    
    // Check if we need to add a new page for the power graph
    // (yPos is the current position after all existing content)
    if (yPos > 180) { // If we're already too far down the page
      doc.addPage();
      yPos = 20;
    }
    
    // Add power graph title
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Graphique de Consommation Électrique', 20, yPos + 5);
    doc.setFont('helvetica', 'normal');
    yPos += 10;
    
    // Draw power graph
    drawPowerGraph(doc, finalPowerData, 20, yPos, pageWidth - 40, 100);
    
    // Footer on last page
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    const footerY = pageHeight - 10;
    doc.text(`Rapport généré automatiquement - ${absData.reference}`, pageWidth / 2, footerY, { align: 'center' });
    doc.text(`Page 1`, pageWidth - 20, footerY, { align: 'right' });
    
    // Save the PDF
    const fileName = `rapport_abs_${absData.reference.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${now.getTime()}.pdf`;
    doc.save(fileName);
    
    setIsGenerating(false);
    onGenerateReport();
  };

  return (
    <div className="card">
      <h3 className="card-header">
        Test Report
      </h3>
      
      <button
        onClick={generatePDF}
        disabled={isGenerating || !absData}
        className={`w-full ${!absData || isGenerating ? 'btn-secondary opacity-50 cursor-not-allowed' : 'btn-primary'}`}
      >
        {isGenerating ? 'Generating...' : 'Generate PDF Report'}
      </button>
      
      {!absData && (
        <p className="status-warning text-sm mt-2">
          Select an ABS component to generate a report.
        </p>
      )}
    </div>
  );
}
