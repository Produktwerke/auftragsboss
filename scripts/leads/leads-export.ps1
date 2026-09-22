# Exportiert die Blätter der drei Lead-Arbeitsmappen als UTF-8-CSV in marketing/Leads/csv (nur lesend auf die xlsx).
$quelle = "C:\dev\dag\auftragsboss\marketing\Leads"
$ziel = "$quelle\csv"
New-Item -ItemType Directory -Force $ziel | Out-Null
$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false
$xl.DisplayAlerts = $false
# Blätter per Nummer (Blattnamen mit Sonderzeichen scheitern an der Skript-Kodierung).
$plan = @(
  @{ datei = "BW - Maler_2026-09-11_Original.xlsx"; blaetter = @(@{ nr = 1; ziel = "original.csv" }) },
  @{ datei = "BW - Maler_2026-09-11_Claude.xlsx"; blaetter = @(
      @{ nr = 1; ziel = "claude-priorisiert.csv" },
      @{ nr = 2; ziel = "claude-A.csv" },
      @{ nr = 3; ziel = "claude-B.csv" },
      @{ nr = 4; ziel = "claude-C.csv" },
      @{ nr = 5; ziel = "claude-D.csv" },
      @{ nr = 6; ziel = "claude-methodik.csv" }) },
  @{ datei = "BW - Maler_2026-09-11_ChatGPT.xlsx"; blaetter = @(
      @{ nr = 1; ziel = "chatgpt-priorisiert.csv" },
      @{ nr = 2; ziel = "chatgpt-scoring.csv" }) }
)
try {
  foreach ($p in $plan) {
    $wb = $xl.Workbooks.Open("$quelle\$($p.datei)", 0, $true)
    foreach ($b in $p.blaetter) {
      $ws = $wb.Worksheets.Item($b.nr)
      $ws.Copy()  # eigene Arbeitsmappe nur mit diesem Blatt
      $neu = $xl.ActiveWorkbook
      $neu.SaveAs("$ziel\$($b.ziel)", 62)  # 62 = CSV UTF-8
      $neu.Close($false)
      "OK: $($p.datei) / Blatt $($b.nr) -> $($b.ziel)"
    }
    $wb.Close($false)
  }
} finally {
  $xl.Quit()
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($xl)
}
Get-ChildItem $ziel | Select-Object Name, Length | Format-Table -AutoSize
