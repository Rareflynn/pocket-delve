# Restart Pocket Delve without losing progress: waits for the game's next autosave (every 15s),
# stops it right after, then relaunches. Starts the game if it isn't running.
# Finds every running copy (double-clicked PocketDelve.pyw, or `python app.py` from a terminal).
$save = Join-Path $env:APPDATA 'PocketDelve\save.json'
$games = Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^pythonw?\.exe$' -and $_.CommandLine -match 'pocketdelve\\(app\.py|PocketDelve\.pyw)' -and $_.CommandLine -notmatch 'POCKETDELVE_TITLE' }
if ($games) {
    $t0 = if (Test-Path $save) { (Get-Item $save).LastWriteTime } else { $null }
    for ($i = 0; $i -lt 40; $i++) {
        Start-Sleep -Milliseconds 500
        if ((Test-Path $save) -and (Get-Item $save).LastWriteTime -ne $t0) { break }
    }
    Start-Sleep -Milliseconds 300  # let the write finish
    $games | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep 2
    "Saved at $((Get-Item $save).LastWriteTime) and stopped $(@($games).Count) running cop$(if (@($games).Count -eq 1) { 'y' } else { 'ies' })."
}
Start-Process (Join-Path $PSScriptRoot 'PocketDelve.pyw')
Start-Sleep 3
$p = Get-Process pythonw -ErrorAction SilentlyContinue | Select-Object -First 1
"Started (pid $($p.Id))."
