package main
import("archive/zip";"bytes";_ "embed";"io";"os";"os/exec";"path/filepath";"strings";"syscall")
//go:embed payload.zip
var payload []byte
//go:embed setup.ps1
var setup []byte
func main(){
 dir,err:=os.MkdirTemp("","EasyRT-Setup-");if err!=nil{return};defer os.RemoveAll(dir)
 zr,err:=zip.NewReader(bytes.NewReader(payload),int64(len(payload)));if err!=nil{return}
 for _,f:=range zr.File{
  out:=filepath.Join(dir,filepath.FromSlash(f.Name));if !strings.HasPrefix(out,dir+string(os.PathSeparator)){return}
  if f.FileInfo().IsDir(){if os.MkdirAll(out,0755)!=nil{return};continue}
  if os.MkdirAll(filepath.Dir(out),0755)!=nil{return}
  rc,e:=f.Open();if e!=nil{return};w,e:=os.Create(out);if e!=nil{rc.Close();return};_,e=io.Copy(w,rc);rc.Close();w.Close();if e!=nil{return}
 }
 script:=filepath.Join(dir,"setup.ps1");if os.WriteFile(script,setup,0600)!=nil{return}
 root:=filepath.Join(os.Getenv("LOCALAPPDATA"),"Programs","EasyRT")
 args:=[]string{"-NoProfile","-STA","-WindowStyle","Hidden","-ExecutionPolicy","Bypass","-File",script,"-Payload",dir,"-Root",root}
 if len(os.Args)>1&&os.Args[1]=="--update"{args=append(args,"-AutoUpdate")}
 cmd:=exec.Command("powershell.exe",args...);cmd.SysProcAttr=&syscall.SysProcAttr{HideWindow:true,CreationFlags:0x08000000};_ = cmd.Run()
}
