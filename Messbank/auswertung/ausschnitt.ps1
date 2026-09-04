# Schneidet einen Bildausschnitt aus und vergroessert ihn (fuer praezise Eck-Annotation).
# Aufruf: ausschnitt.ps1 -Datei <jpg> -X0 .. -Y0 .. -X1 .. -Y1 .. -Ziel <png> [-Faktor 2]
param(
  [Parameter(Mandatory)][string]$Datei,
  [Parameter(Mandatory)][int]$X0,
  [Parameter(Mandatory)][int]$Y0,
  [Parameter(Mandatory)][int]$X1,
  [Parameter(Mandatory)][int]$Y1,
  [Parameter(Mandatory)][string]$Ziel,
  [double]$Faktor = 2
)
Add-Type -AssemblyName System.Drawing
$bild = [System.Drawing.Image]::FromFile($Datei)
$b = $X1 - $X0; $h = $Y1 - $Y0
$neu = New-Object System.Drawing.Bitmap ([int]($b * $Faktor)), ([int]($h * $Faktor))
$g = [System.Drawing.Graphics]::FromImage($neu)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$quell = New-Object System.Drawing.Rectangle $X0, $Y0, $b, $h
$zielR = New-Object System.Drawing.Rectangle 0, 0, ([int]($b * $Faktor)), ([int]($h * $Faktor))
$g.DrawImage($bild, $zielR, $quell, [System.Drawing.GraphicsUnit]::Pixel)
$neu.Save($Ziel, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $neu.Dispose(); $bild.Dispose()
Write-Output "Ausschnitt ($X0,$Y0)-($X1,$Y1) x$Faktor -> $Ziel"
