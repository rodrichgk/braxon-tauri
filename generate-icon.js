// Simple script to create a basic 1024x1024 PNG icon
const fs = require('fs');
const { createCanvas } = require('canvas');

const canvas = createCanvas(1024, 1024);
const ctx = canvas.getContext('2d');

// Background
ctx.fillStyle = '#2563eb';
ctx.fillRect(0, 0, 1024, 1024);

// White circle
ctx.fillStyle = 'white';
ctx.beginPath();
ctx.arc(512, 512, 300, 0, Math.PI * 2);
ctx.fill();

// Blue text
ctx.fillStyle = '#2563eb';
ctx.font = 'bold 200px Arial';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillText('ABS', 512, 512);

// Save
const buffer = canvas.toBuffer('image/png');
fs.writeFileSync('app-icon.png', buffer);
console.log('Icon created: app-icon.png');
