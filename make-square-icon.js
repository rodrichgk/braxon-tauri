const fs = require('fs');
const { exec } = require('child_process');

// Simple PowerShell script to resize image to square using .NET
const psScript = `
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile("${__dirname}\\icon.png")
$size = [Math]::Max($img.Width, $img.Height)
$square = New-Object System.Drawing.Bitmap($size, $size)
$graphics = [System.Drawing.Graphics]::FromImage($square)
$graphics.Clear([System.Drawing.Color]::Transparent)
$x = ($size - $img.Width) / 2
$y = ($size - $img.Height) / 2
$graphics.DrawImage($img, $x, $y, $img.Width, $img.Height)
$img.Dispose()
$square.Save("${__dirname}\\app-icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
$square.Dispose()
$graphics.Dispose()
Write-Host "Square icon created: app-icon.png"
`;

fs.writeFileSync('resize-icon.ps1', psScript);
console.log('PowerShell script created. Run: powershell -ExecutionPolicy Bypass -File resize-icon.ps1');
