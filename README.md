# waveform-render-vscode

Render waveforms with [WaveDrom](https://github.com/wavedrom/wavedrom) inside [VSCode](https://code.visualstudio.com/).

This VSCode extension is [available on the VSCode Extension Marketplace](https://marketplace.visualstudio.com/items?itemName=bmpenuelas.waveform-render).

## Usage

📄 Open a .JSON file containing a WaveDrom waveform, like
```json
{ signal: [
  { name: "clk",         wave: "p.....|..." },
  { name: "Data",        wave: "x.345x|=.x", data: ["head", "body", "tail", "data"] },
  { name: "Request",     wave: "0.1..0|1.0" },
  {},
  { name: "Acknowledge", wave: "1.....|01." }
]}
```

<br>

➡️ click the wave button at the top-right corner

![waveform render vscode button](/media/demo_1.png)

*or*

🎹 Press "`Ctrl+K` followed by `Ctrl+D`", or "`Ctrl+Shift+P` followed by `Waveform Render: Draw`" to **draw** the waveform in your editor

*or*

🔃 Press "`Ctrl+K` followed by `Ctrl+L`", or "`Ctrl+Shift+P` followed by `Waveform Render: Toggle Live Preview`" to make the waveform update as you type

<br>

🌈 and you will get a new tab with a nice waveform rendered inside your text editor

![waveform render vscode example](/media/demo_0.png)

<br>

## 💾 Saving the waveform

- You can save the rendered waveform as PNG or SVG by right-clicking the waveform and selecting your preferred format.
- Or click the `📋copy to clipboard` button in twe waveform pannel to copy the image to your clipboard.
- Or use VSCode commands to save as PNG/SVG:
    - `Waveform Render: Copy Save as PNG` (`waveformRender.saveAsPng`)
    - `Waveform Render: Copy Save as SVG` (`waveformRender.saveAsSvg`)

<br>

## Syntax

You can find the complete WaveDrom syntax [in the WaveDrom schema docs](https://github.com/wavedrom/schema/blob/master/WaveJSON.md).
