Set sh = CreateObject("WScript.Shell")
apiDir = "c:\Users\Erdei Krisztián\Desktop\szakdoga2\teszt001\projekt\VocabApp\VocabApp.Api"
clientDir = "c:\Users\Erdei Krisztián\Desktop\szakdoga2\teszt001\projekt\VocabApp\vocab-client"
sh.CurrentDirectory = apiDir
sh.Run "cmd.exe /c dotnet run --launch-profile http", 0, False
WScript.Sleep 2000
sh.CurrentDirectory = clientDir
sh.Run "cmd.exe /c npm start", 0, False
