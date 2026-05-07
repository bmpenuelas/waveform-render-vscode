# Testing

This document covers both automated and manual validation for `waveform-render-vscode`.

## Automated Tests

Install dependencies first:

```bash
npm install
```

Available test commands:

- `npm run test:logic`
  Runs the extension logic suite against the testable controller layer.
- `npm run test:webview`
  Runs the browser-executed webview runtime suite in headless Microsoft Edge.
- `npm test`
  Runs both suites.

What each suite covers:

- `test:logic` verifies command registration, panel creation, live preview toggling, editor-change refreshes, export command dispatch, title generation, and generated webview HTML.
- `test:webview` executes the webview page scripts in a real browser context and verifies SVG export, PNG export, clipboard copy success, and clipboard failure handling.

Notes:

- The webview runtime suite expects Microsoft Edge to be installed at a standard Windows location.
- In restricted or sandboxed environments, browser launch may be blocked even when the test code is correct.
- If PowerShell blocks `npm`, run the commands through `cmd /c`, for example `cmd /c npm test`.

## Manual Testing

Use this checklist when validating the extension in VS Code.

### 1. Launch The Extension

From the repo root:

```bash
npm run compile
```

Then open the folder in VS Code and press `F5` to start an Extension Development Host.

### 2. Open A Sample Waveform

Create or open a `.json` or `.json5` file with WaveDrom content such as:

```json
{ signal: [
  { name: "clk", wave: "p...." },
  { name: "req", wave: "01..0" },
  { name: "ack", wave: "0..10" }
]}
```

### 3. Verify Draw Flow

- Run `Waveform Render: Draw`.
- Confirm a preview opens beside the editor.
- Confirm the preview title matches the file name without the `.json` or `.json5` extension.
- Confirm the waveform renders instead of showing a blank page.

### 4. Verify Live Preview

- Run `Waveform Render: Toggle Live Preview`.
- Edit the waveform JSON.
- Confirm the preview updates after changes.
- Run `Waveform Render: Toggle Live Preview` again.
- Edit the file once more and confirm the preview no longer auto-refreshes.

### 5. Verify Editor Switching

- With live preview enabled, switch between two waveform files.
- Confirm the same preview panel updates to the newly active file.
- Confirm the panel title changes to match the active file.

### 6. Verify Export Commands

- Run `Waveform Render: Save as PNG`.
- Run `Waveform Render: Save as SVG`.
- Confirm the browser/webview download flow starts for both formats.

### 7. Verify Clipboard Copy

- Click `copy to clipboard` in the preview.
- Confirm the success message appears.
- Paste into an image-aware target such as Paint, PowerPoint, Slack, or an email composer.

### 8. Verify Close Behavior

- Enable live preview.
- Close the preview panel.
- Confirm live preview stops.
- If `waveformRender.closePanelOnDisable` is enabled, disable live preview and confirm the panel closes automatically.
