Add-Type -AssemblyName System.Drawing

$inputPath = Join-Path $PSScriptRoot "icon.png"
$outputPath = Join-Path $PSScriptRoot "app-icon.png"

Write-Host "Loading image: $inputPath"
$img = [System.Drawing.Image]::FromFile($inputPath)

Write-Host "Original size: $($img.Width)x$($img.Height)"

# Make it square by using the larger dimension
$size = [Math]::Max($img.Width, $img.Height)
Write-Host "Creating square image: ${size}x${size}"

$square = New-Object System.Drawing.Bitmap($size, $size)
$graphics = [System.Drawing.Graphics]::FromImage($square)

# Fill with transparent background
$graphics.Clear([System.Drawing.Color]::Transparent)

# Center the original image
$x = ($size - $img.Width) / 2
$y = ($size - $img.Height) / 2
$graphics.DrawImage($img, $x, $y, $img.Width, $img.Height)

# Save
$square.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)

# Cleanup
$img.Dispose()
$square.Dispose()
$graphics.Dispose()

Write-Host "Square icon created: $outputPath"
Write-Host "Size: ${size}x${size}"
