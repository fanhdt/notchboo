param(
    [string]$Name = "notchboo",
    [int]$Seconds = 60,
    [int]$StartDelay = 5,
    [string]$Label = "tes"
)

$root = Get-Process -Name $Name -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $root) {
    Write-Error "Proses '$Name' tidak ditemukan. Jalankan aplikasinya dulu."
    exit 1
}

# Mengumpulkan ID proses utama beserta seluruh turunannya (termasuk msedgewebview2.exe).
function Get-TreeIds([int]$RootId) {
    $procs = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId
    $ids = [System.Collections.Generic.HashSet[int]]::new()
    [void]$ids.Add($RootId)
    $grew = $true
    while ($grew) {
        $grew = $false
        foreach ($p in $procs) {
            if ($ids.Contains([int]$p.ParentProcessId) -and $ids.Add([int]$p.ProcessId)) {
                $grew = $true
            }
        }
    }
    return $ids
}

# Satu pengambilan data: total waktu CPU dan memori seluruh pohon proses.
function Get-Snapshot([int]$RootId) {
    $cpu = [TimeSpan]::Zero
    $workingSet = 0L
    $private = 0L
    $names = @()
    foreach ($id in (Get-TreeIds $RootId)) {
        try {
            $p = Get-Process -Id $id -ErrorAction Stop
            $cpu += $p.TotalProcessorTime
            $workingSet += $p.WorkingSet64
            $private += $p.PrivateMemorySize64
            $names += $p.ProcessName
        } catch { }
    }
    [pscustomobject]@{ Cpu = $cpu; WorkingSet = $workingSet; Private = $private; Names = $names }
}

Write-Host "[$Label] mulai dalam $StartDelay detik. Posisikan kursor dan tab sesuai skenario..."
Start-Sleep -Seconds $StartDelay

$cores = [Environment]::ProcessorCount
$start = Get-Snapshot $root.Id
$startedAt = Get-Date
$samples = @()

for ($i = 0; $i -lt $Seconds; $i++) {
    Start-Sleep -Seconds 1
    $samples += (Get-Snapshot $root.Id)
}

$end = $samples[-1]
$elapsed = ((Get-Date) - $startedAt).TotalSeconds
$cpuPercent = (($end.Cpu - $start.Cpu).TotalSeconds / ($elapsed * $cores)) * 100
$avgWorkingSet = ($samples | Measure-Object WorkingSet -Average).Average / 1MB
$avgPrivate = ($samples | Measure-Object Private -Average).Average / 1MB

Write-Host ""
Write-Host ("[{0}] CPU: {1:N2}% (dari total {2} core)" -f $Label, $cpuPercent, $cores)
Write-Host ("[{0}] Memori private: {1:N1} MB | working set: {2:N1} MB" -f $Label, $avgPrivate, $avgWorkingSet)
Write-Host ("[{0}] Proses yang dihitung: {1}" -f $Label, (($end.Names | Group-Object | ForEach-Object { "$($_.Name) x$($_.Count)" }) -join ", "))