param([string]$Payload,[string]$Root,[switch]$AutoUpdate)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$manifest=Get-Content (Join-Path $Payload 'installer.json') -Raw | ConvertFrom-Json
$install=Join-Path $Root $manifest.version
$form=New-Object Windows.Forms.Form
$form.Text='Easy RT Utility · Installazione';$form.ClientSize=New-Object Drawing.Size(620,390)
$form.StartPosition='CenterScreen';$form.FormBorderStyle='FixedDialog';$form.MaximizeBox=$false
$form.AutoScaleMode='Dpi';$form.BackColor=[Drawing.Color]::FromArgb(241,246,251)
try{$form.Icon=New-Object Drawing.Icon((Join-Path $Payload 'EasyRT_App.ico'))}catch{}
$logo=New-Object Windows.Forms.PictureBox
$logo.Location=New-Object Drawing.Point(28,20);$logo.Size=New-Object Drawing.Size(285,108);$logo.SizeMode='Zoom'
$logo.Image=[Drawing.Image]::FromFile((Join-Path $Payload 'logo.png'));$form.Controls.Add($logo)
$title=New-Object Windows.Forms.Label
$title.Text='Easy RT Utility '+$manifest.version;$title.Font=New-Object Drawing.Font('Segoe UI Semibold',17)
$title.ForeColor=[Drawing.Color]::FromArgb(8,41,89);$title.Location=New-Object Drawing.Point(30,144);$title.Size=New-Object Drawing.Size(550,32);$form.Controls.Add($title)
$description=New-Object Windows.Forms.Label
$description.Text=if($manifest.mode -eq 'online'){'Setup leggero · scarica il motore solo quando necessario.'}else{'Pacchetto completo · installazione anche senza Internet.'}
$description.Font=New-Object Drawing.Font('Segoe UI',10);$description.Location=New-Object Drawing.Point(32,184);$description.Size=New-Object Drawing.Size(550,28);$form.Controls.Add($description)
$status=New-Object Windows.Forms.Label
$status.Text='Configurazione e registro locale vengono conservati.';$status.Location=New-Object Drawing.Point(32,226);$status.Size=New-Object Drawing.Size(550,42);$form.Controls.Add($status)
$bar=New-Object Windows.Forms.ProgressBar
$bar.Location=New-Object Drawing.Point(32,280);$bar.Size=New-Object Drawing.Size(550,10);$form.Controls.Add($bar)
function Add-Button($text,$x,$width,$pink){
 $button=New-Object Windows.Forms.Button;$button.Text=$text;$button.Location=New-Object Drawing.Point($x,314);$button.Size=New-Object Drawing.Size($width,42)
 $button.FlatStyle='Flat';$button.FlatAppearance.BorderSize=0;$button.Font=New-Object Drawing.Font('Segoe UI Semibold',10);$button.ForeColor=[Drawing.Color]::White
 $button.BackColor=if($pink){[Drawing.Color]::FromArgb(229,0,126)}else{[Drawing.Color]::FromArgb(8,41,89)}
 $path=New-Object Drawing.Drawing2D.GraphicsPath;$w=$button.Width;$h=$button.Height;$d=20
 $path.AddArc(0,0,$d,$d,180,90);$path.AddArc(($w-$d),0,$d,$d,270,90);$path.AddArc(($w-$d),($h-$d),$d,$d,0,90);$path.AddArc(0,($h-$d),$d,$d,90,90);$path.CloseFigure()
 $button.Region=New-Object Drawing.Region($path);$path.Dispose();$form.Controls.Add($button);return $button
}
$go=Add-Button '↓ Installa / aggiorna' 32 230 $true
$close=Add-Button 'Chiudi applicazione' 354 228 $false
$close.Add_Click({$form.Close()})
function Install-EasyRT {
 $go.Enabled=$false;$close.Enabled=$false;$bar.Style='Marquee';$status.Text='Preparazione e verifica dei componenti…'
 $script:job=Start-Job -ArgumentList $Payload,$Root,$manifest -ScriptBlock {
  param($payload,$root,$manifest)
  $ErrorActionPreference='Stop';[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  function Verify-File($path,$digest){if((Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash.ToLowerInvariant() -ne $digest){throw 'Checksum non valido: '+[IO.Path]::GetFileName($path)}}
  New-Item -ItemType Directory -Path $root -Force|Out-Null
  $stage=Join-Path $root ('.staging-'+[Guid]::NewGuid().ToString('N'))
  $target=Join-Path $root $manifest.version
  try {
   if(Test-Path (Join-Path $target 'EasyRT.exe')){
    $listing=Get-Content (Join-Path $payload 'app-files.json') -Raw|ConvertFrom-Json
    foreach($entry in $listing){Verify-File (Join-Path $target $entry.path) $entry.sha256}
    $runtimeListing=Get-Content (Join-Path $payload 'runtime-files.json') -Raw|ConvertFrom-Json
    foreach($entry in $runtimeListing){Verify-File (Join-Path $target $entry.path) $entry.sha256}
   } else {
    New-Item -ItemType Directory -Path $stage|Out-Null
    $previous=$null;$pointer=Join-Path $root 'current.json'
    if(Test-Path $pointer){try{
     $old=Get-Content $pointer -Raw|ConvertFrom-Json
     if($old.version -match '^\d+\.\d+\.\d+$' -and $old.runtimeVersion -eq $manifest.runtimeVersion -and $old.distributionSchema -eq 2){
      $candidate=Join-Path $root $old.version
      $marker=Get-Content (Join-Path $candidate 'runtime.json') -Raw|ConvertFrom-Json
      if($marker.sha256 -eq $manifest.runtimeSha256){
       $files=Get-Content (Join-Path $payload 'runtime-files.json') -Raw|ConvertFrom-Json
       foreach($entry in $files){Verify-File (Join-Path $candidate $entry.path) $entry.sha256}
       $previous=$candidate
      }
     }
    }catch{$previous=$null}}
    if($previous){
     foreach($file in Get-ChildItem -LiteralPath $previous -Force){if($file.Name -notin @('resources','runtime.json','LEGGIMI.txt')){Copy-Item -LiteralPath $file.FullName -Destination $stage -Recurse -Force}}
     $resources=Join-Path $stage 'resources';New-Item -ItemType Directory -Path $resources -Force|Out-Null
     foreach($file in Get-ChildItem (Join-Path $previous 'resources') -Force){if($file.Name -ne 'app'){Copy-Item -LiteralPath $file.FullName -Destination $resources -Recurse -Force}}
    } else {
     $runtime=Join-Path $payload 'runtime.zip'
     if(!(Test-Path $runtime)){
      if(!$manifest.runtimeUrl.StartsWith('https://github.com/EasysistemRB/EasyRT-Releases/releases/download/')){throw 'Origine del motore non consentita'}
      $runtime=Join-Path $payload 'download-runtime.zip'
      (New-Object Net.WebClient).DownloadFile($manifest.runtimeUrl,$runtime)
     }
     Verify-File $runtime $manifest.runtimeSha256
     [IO.Compression.ZipFile]::ExtractToDirectory($runtime,$stage)
    }
    $app=Join-Path $payload 'app.zip';Verify-File $app $manifest.appSha256
    [IO.Compression.ZipFile]::ExtractToDirectory($app,$stage)
    if(!(Test-Path (Join-Path $stage 'EasyRT.exe'))){throw 'Motore applicativo mancante'}
    foreach($listName in @('app-files.json','runtime-files.json')){
     $entries=Get-Content (Join-Path $payload $listName) -Raw|ConvertFrom-Json
     foreach($entry in $entries){Verify-File (Join-Path $stage $entry.path) $entry.sha256}
    }
    if(Test-Path $target){throw 'Cartella della revisione occupata: riprovare dopo averla verificata'}
    Move-Item -LiteralPath $stage -Destination $target
   }
   $shell=New-Object -ComObject WScript.Shell
   foreach($folder in @([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('Programs'))){
    $link=$shell.CreateShortcut((Join-Path $folder 'Easy RT Utility.lnk'));$link.TargetPath=Join-Path $target 'EasyRT.exe';$link.WorkingDirectory=$target;$link.IconLocation=(Join-Path $target 'EasyRT_App.ico')+',0';$link.Description='Easy RT Utility '+$manifest.version;$link.Save()
   }
   $value=@{version=$manifest.version;runtimeVersion=$manifest.runtimeVersion;distributionSchema=2}|ConvertTo-Json
   $temp=Join-Path $root 'current.json.tmp';[IO.File]::WriteAllText($temp,$value);Move-Item -LiteralPath $temp -Destination (Join-Path $root 'current.json') -Force
   return (Join-Path $target 'EasyRT.exe')
  } finally {if(Test-Path $stage){Remove-Item -LiteralPath $stage -Recurse -Force}}
 }
 $script:poll.Start()
}
$script:poll=New-Object Windows.Forms.Timer;$script:poll.Interval=150
$script:poll.Add_Tick({
 if($script:job.State -in @('Completed','Failed','Stopped')){
  $script:poll.Stop()
  try{
   $result=@(Receive-Job $script:job -ErrorAction Stop)
   if($script:job.State -ne 'Completed' -or !$result){throw 'Installazione non completata'}
   $bar.Style='Blocks';$bar.Value=100;$status.Text='Installazione completata. Avvio Easy RT…'
   Start-Process -FilePath ([string]$result[-1]) -WorkingDirectory $install
   $form.Close()
  }catch{$bar.Style='Blocks';$status.Text='Errore: '+$_.Exception.Message;$go.Enabled=$true;$close.Enabled=$true;[Windows.Forms.MessageBox]::Show($status.Text,'Easy RT')|Out-Null}
  finally{Remove-Job $script:job -Force}
 }
})
$go.Add_Click({Install-EasyRT})
if($AutoUpdate){$form.Add_Shown({Install-EasyRT})}
[void]$form.ShowDialog();$script:poll.Dispose();$logo.Image.Dispose()
