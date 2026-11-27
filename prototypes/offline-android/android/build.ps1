param(
    [Parameter(Mandatory)][string]$Platform,
    [Parameter(Mandatory)][string]$BuildTools,
    [Parameter(Mandatory)][string]$Jdk,
    [Parameter(Mandatory)][string]$BuildDir,
    [Parameter(Mandatory)][string]$OutputApk
)

$ErrorActionPreference = 'Stop'
function Invoke-Checked($Executable, $Arguments) {
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Executable failed with exit code $LASTEXITCODE" }
}

$classes = Join-Path $BuildDir 'classes'
$dex = Join-Path $BuildDir 'dex'
New-Item -ItemType Directory -Force -Path $classes, $dex | Out-Null
$manifest = Join-Path $PSScriptRoot 'AndroidManifest.xml'
$androidJar = Join-Path $Platform 'android.jar'
$java = Join-Path $Jdk 'bin/java.exe'
$unsigned = Join-Path $BuildDir 'unsigned.apk'
$aligned = Join-Path $BuildDir 'aligned.apk'
$keystore = Join-Path $BuildDir 'pilot-signing.p12'

Invoke-Checked (Join-Path $Jdk 'bin/javac.exe') @('--release', '11', '-encoding', 'UTF-8', '-classpath', $androidJar, '-d', $classes, (Join-Path $PSScriptRoot 'src/MainActivity.java'))
$compiled = @(Get-ChildItem -LiteralPath $classes -Filter '*.class' -Recurse -File | ForEach-Object FullName)
Invoke-Checked $java (@('-cp', (Join-Path $BuildTools 'lib/d8.jar'), 'com.android.tools.r8.D8', '--lib', $androidJar, '--min-api', '33', '--output', $dex) + $compiled)
Invoke-Checked (Join-Path $BuildTools 'aapt2.exe') @('link', '-o', $unsigned, '-I', $androidJar, '--manifest', $manifest)
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::Open($unsigned, [IO.Compression.ZipArchiveMode]::Update)
try {
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, (Join-Path $dex 'classes.dex'), 'classes.dex') | Out-Null
} finally {
    $archive.Dispose()
}
Invoke-Checked (Join-Path $BuildTools 'zipalign.exe') @('-f', '4', $unsigned, $aligned)
if (!(Test-Path -LiteralPath $keystore)) {
    Invoke-Checked (Join-Path $Jdk 'bin/keytool.exe') @('-genkeypair', '-storetype', 'PKCS12', '-keystore', $keystore, '-storepass', 'android', '-alias', 'pilot', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '3650', '-dname', 'CN=Phone Assistant Local Pilot')
}
$signer = Join-Path $BuildTools 'lib/apksigner.jar'
Invoke-Checked $java @('-jar', $signer, 'sign', '--ks', $keystore, '--ks-pass', 'pass:android', '--out', $OutputApk, $aligned)
Invoke-Checked $java @('-jar', $signer, 'verify', '--verbose', $OutputApk)
