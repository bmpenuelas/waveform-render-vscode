Render waveforms with [WaveDrom](https://github.com/wavedrom/wavedrom) inside [VSCode](https://code.visualstudio.com/)


:page_with_curl: Open a JSON file containing a WaveDrom waveform, like
```
{ signal: [
  { name: "clk",         wave: "p.....|..." },
  { name: "Data",        wave: "x.345x|=.x", data: ["head", "body", "tail", "data"] },
  { name: "Request",     wave: "0.1..0|1.0" },
  {},
  { name: "Acknowledge", wave: "1.....|01." }
]}
```

:musical_keyboard: press (`ctrl+w` followed by `ctrl+d`), or (`ctrl+shift+p` followed by `Waveform Render: draw`)

:rainbow: and you will get a new tab with a nice waveform rendered inside your text editor
![waveform render vscode example](/media/demo_0.png)

You can find the complete syntax [here](https://github.com/wavedrom/schema).
