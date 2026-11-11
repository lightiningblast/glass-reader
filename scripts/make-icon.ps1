# Draws the app icon (a glassy page on a blue-violet tile) to build/icon.png at 512x512.
Add-Type -AssemblyName System.Drawing
$S = 512
$bmp = New-Object System.Drawing.Bitmap $S, $S
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.Clear([System.Drawing.Color]::Transparent)

function RoundRect($x, $y, $w, $h, $r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $p.AddArc($x, $y, $r*2, $r*2, 180, 90)
  $p.AddArc($x+$w-$r*2, $y, $r*2, $r*2, 270, 90)
  $p.AddArc($x+$w-$r*2, $y+$h-$r*2, $r*2, $r*2, 0, 90)
  $p.AddArc($x, $y+$h-$r*2, $r*2, $r*2, 90, 90)
  $p.CloseFigure(); return $p
}

# Tile
$tile = RoundRect 24 24 464 464 112
$grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush ([System.Drawing.Point]::new(24,24)), ([System.Drawing.Point]::new(488,488)), ([System.Drawing.Color]::FromArgb(255,96,140,255)), ([System.Drawing.Color]::FromArgb(255,176,110,240))
$g.FillPath($grad, $tile)
# Soft colored blobs
$g.SetClip($tile)
$g.FillEllipse((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(150,255,150,200))), 250, 260, 300, 300)
$g.FillEllipse((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(130,110,230,210))), -60, 300, 280, 280)
$g.ResetClip()
# Glass page
$page = RoundRect 150 104 212 290 34
$g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(205,255,255,255))), $page)
$g.DrawPath((New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255,255,255,255)), 5), $page)
# Text lines
$ink = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255,70,90,170))
$soft = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(150,90,110,180))
$g.FillPath($ink, (RoundRect 186 150 110 20 10))
$g.FillPath($soft, (RoundRect 186 196 140 14 7))
$g.FillPath($soft, (RoundRect 186 226 124 14 7))
$g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(200,255,214,10))), (RoundRect 180 250 150 24 8))
$g.FillPath($soft, (RoundRect 186 256 136 14 7))
$g.FillPath($soft, (RoundRect 186 296 100 14 7))
# Top rim highlight
$g.DrawPath((New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(120,255,255,255)), 4), $tile)

New-Item -ItemType Directory -Force (Join-Path $PSScriptRoot '..\build') | Out-Null
$out = Join-Path $PSScriptRoot '..\build\icon.png'
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output "Saved $out"
