param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments = @())
& "$PSScriptRoot/../db/invoke-bash.ps1" -ScriptPath (Join-Path $PSScriptRoot "ntfy-setup.sh") -Arguments $Arguments
exit $LASTEXITCODE
