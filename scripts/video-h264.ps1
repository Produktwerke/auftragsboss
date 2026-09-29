# Wandelt ein Video in das Format um, das WhatsApp annimmt: MP4 mit H.264-Bild und AAC-Ton.
# Hintergrund (29.09.2026): Das Erklaervideo lag als H.265 (HEVC) vor, Meta lehnt das ab.
# Nutzt die in Windows eingebaute Umwandlung (kein ffmpeg noetig). Das Original bleibt unveraendert.
#
#   powershell -File scripts/video-h264.ps1 -Quelle "marketing/Video ABO final_kompakt.mp4" -Ziel "marketing/auftragsboss-video.mp4"
#
# Voraussetzung fuer H.265-Quellen: Windows-Paket "HEVC-Videoerweiterungen" (ist auf Dirks PCs installiert).
param(
  [Parameter(Mandatory = $true)][string]$Quelle,
  [Parameter(Mandatory = $true)][string]$Ziel,
  [int]$VideoBitrate = 1100000,
  [int]$TonBitrate = 128000,
  [int]$MaxHoehe = 1280
)
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Runtime.WindowsRuntime
[void][Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
[void][Windows.Storage.StorageFolder, Windows.Storage, ContentType = WindowsRuntime]
[void][Windows.Media.Transcoding.MediaTranscoder, Windows.Media.Transcoding, ContentType = WindowsRuntime]
[void][Windows.Media.Transcoding.PrepareTranscodeResult, Windows.Media.Transcoding, ContentType = WindowsRuntime]
[void][Windows.Media.MediaProperties.MediaEncodingProfile, Windows.Media.MediaProperties, ContentType = WindowsRuntime]

$methoden = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 }
$asTaskOp = $methoden | Where-Object { $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
$asTaskAktion = $methoden | Where-Object { $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncActionWithProgress`1' } | Select-Object -First 1

function Warte-Op($op, [Type]$typ) {
  $t = $asTaskOp.MakeGenericMethod($typ).Invoke($null, @($op))
  [void]$t.Wait()
  $t.Result
}
function Warte-Aktion($aktion, [Type]$typ) {
  $t = $asTaskAktion.MakeGenericMethod($typ).Invoke($null, @($aktion))
  [void]$t.Wait()
}

$quelleVoll = (Resolve-Path -LiteralPath $Quelle).Path
$zielOrdner = (Resolve-Path -LiteralPath (Split-Path -Parent $Ziel)).Path
$zielName = Split-Path -Leaf $Ziel

$src = Warte-Op ([Windows.Storage.StorageFile]::GetFileFromPathAsync($quelleVoll)) ([Windows.Storage.StorageFile])
$ordner = Warte-Op ([Windows.Storage.StorageFolder]::GetFolderFromPathAsync($zielOrdner)) ([Windows.Storage.StorageFolder])
$dst = Warte-Op ($ordner.CreateFileAsync($zielName, [Windows.Storage.CreationCollisionOption]::ReplaceExisting)) ([Windows.Storage.StorageFile])
$alt = Warte-Op ([Windows.Media.MediaProperties.MediaEncodingProfile]::CreateFromFileAsync($src)) ([Windows.Media.MediaProperties.MediaEncodingProfile])

"Quelle: {0} x {1}, Bild {2}, {3} kBit/s, {4}/{5} Bilder je Sekunde" -f $alt.Video.Width, $alt.Video.Height, $alt.Video.Subtype, [int]($alt.Video.Bitrate / 1000), $alt.Video.FrameRate.Numerator, $alt.Video.FrameRate.Denominator

# Seitenverhaeltnis behalten, Hoehe begrenzen, gerade Pixelzahlen (H.264 verlangt das).
$b = [double]$alt.Video.Width
$h = [double]$alt.Video.Height
if ($h -gt $MaxHoehe) { $b = $b * $MaxHoehe / $h; $h = $MaxHoehe }
$breite = [uint32]([Math]::Round($b / 2) * 2)
$hoehe = [uint32]([Math]::Round($h / 2) * 2)

$profil = [Windows.Media.MediaProperties.MediaEncodingProfile]::CreateMp4([Windows.Media.MediaProperties.VideoEncodingQuality]::HD720p)
$profil.Video.Width = $breite
$profil.Video.Height = $hoehe
$profil.Video.Bitrate = [uint32]$VideoBitrate
$profil.Video.FrameRate.Numerator = $alt.Video.FrameRate.Numerator
$profil.Video.FrameRate.Denominator = $alt.Video.FrameRate.Denominator
$profil.Audio.Bitrate = [uint32]$TonBitrate

$wandler = New-Object Windows.Media.Transcoding.MediaTranscoder
$wandler.VideoProcessingAlgorithm = [Windows.Media.Transcoding.MediaVideoProcessingAlgorithm]::MrfCrf444
$vorbereitung = Warte-Op ($wandler.PrepareFileTranscodeAsync($src, $dst, $profil)) ([Windows.Media.Transcoding.PrepareTranscodeResult])
if (-not $vorbereitung.CanTranscode) { throw "Umwandlung nicht moeglich: $($vorbereitung.FailureReason)" }

"Wandle um nach {0} x {1}, H.264, {2} kBit/s Bild, {3} kBit/s Ton ..." -f $breite, $hoehe, [int]($VideoBitrate / 1000), [int]($TonBitrate / 1000)
Warte-Aktion ($vorbereitung.TranscodeAsync()) ([double])

$fertig = Get-Item -LiteralPath (Join-Path $zielOrdner $zielName)
$bytes = [IO.File]::ReadAllBytes($fertig.FullName)
$text = [Text.Encoding]::GetEncoding(28591).GetString($bytes)
"Fertig: {0}, {1:N2} MB, H.264: {2}, H.265: {3}, AAC-Ton: {4}" -f $fertig.Name, ($fertig.Length / 1MB), ($text.IndexOf('avc1') -ge 0), (($text.IndexOf('hvc1') -ge 0) -or ($text.IndexOf('hev1') -ge 0)), ($text.IndexOf('mp4a') -ge 0)
if ($fertig.Length -gt 16MB) { Write-Warning "Datei ist groesser als 16 MB, Meta lehnt sie ab. Mit kleinerer -VideoBitrate wiederholen." }
