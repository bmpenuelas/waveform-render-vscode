import * as path from 'path';
import * as vscode from 'vscode';


export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('waveformRender.start', () => {
      WaveformRenderPanel.createOrShow(context.extensionPath);
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('waveformRender.toggleLivePreview', () => {
      WaveformRenderPanel.toggleLivePreview(context.extensionPath);
    })
  );
}

  function getTitle() {
    return 'Waveform Render: ' + vscode.window.activeTextEditor.document.fileName.split('\\').pop().split('/').pop();
  }

/**
 * Manages webview panel
 */
class WaveformRenderPanel {
  /**
   * Track the currently panel. Only allow a single panel to exist at a time.
   */
  public static currentPanel: WaveformRenderPanel | undefined;

  public static livePreview: boolean = false;
  public static listenerTextChange;

  public static readonly viewType = 'waveformRender';

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionPath: string;
  private _disposables: vscode.Disposable[] = [];

  public static toggleLivePreview(extensionPath: string) {
    if (WaveformRenderPanel.livePreview) {
      WaveformRenderPanel.listenerTextChange.dispose();
    } else {
      WaveformRenderPanel.listenerTextChange = vscode.workspace.onDidChangeTextDocument(function (event) {
        WaveformRenderPanel.createOrShow(extensionPath);
      });
    }
    WaveformRenderPanel.livePreview = !WaveformRenderPanel.livePreview
    vscode.window.showInformationMessage('Waveform live preview: ' + ((WaveformRenderPanel.livePreview)? 'ON' : 'OFF'));
  }

  public static createOrShow(extensionPath: string) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If we already have a panel, show it.
    if (WaveformRenderPanel.currentPanel) {
      WaveformRenderPanel.currentPanel._panel.reveal(undefined, true);
      WaveformRenderPanel.currentPanel._panel.title = getTitle();
      WaveformRenderPanel.currentPanel._updateWithFileContent();
      return
    }

    // Otherwise, create a new panel.
    const panel = vscode.window.createWebviewPanel(
      WaveformRenderPanel.viewType,
      getTitle(),
      {preserveFocus: true, viewColumn: -2},
      {
        // Enable javascript in the webview
        enableScripts: true,

        // And restrict the webview to only loading content from our extension's `localScripts` directory.
        localResourceRoots: [vscode.Uri.file(path.join(extensionPath, 'localScripts'))]
      }
    );

    WaveformRenderPanel.currentPanel = new WaveformRenderPanel(panel, extensionPath);
  }

  private constructor(panel: vscode.WebviewPanel, extensionPath: string) {
    this._panel = panel;
    this._extensionPath = extensionPath;

    this._updateWithFileContent();

    // Listen for when the panel is disposed
    // This happens when the user closes the panel or when the panel is closed programatically
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  public dispose() {
    WaveformRenderPanel.currentPanel = undefined;

    // Clean up our resources
    this._panel.dispose();

    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private _update(fileContents: string = `{ signal: [
    { name: "clk",         wave: "p.....|..." },
    { name: "Data",        wave: "x.345x|=.x", data: ["head", "body", "tail", "data"] },
    { name: "Request",     wave: "0.1..0|1.0" },
    {},
    { name: "Acknowledge", wave: "1.....|01." }
  ]}`) {
    this._panel.webview.html = this._getHtmlForWebview(fileContents);
  }

  private _updateWithFileContent() {
    // Get the current text editor
    let editor = vscode.window.activeTextEditor;
    let doc = editor.document;
    let docContent = doc.getText();

    // Set the webview's html content
    this._update(docContent);
  }

  private _getHtmlForWebview(waveformJson: string) {
    const scriptPathOnDisk = vscode.Uri.file(
      path.join(this._extensionPath, 'localScripts', 'wavedrom.min.js')
      );
    const defaultSkinPathOnDisk = vscode.Uri.file(
      path.join(this._extensionPath, 'localScripts/skins', 'default.js')
    );
    const narrowSkinPathOnDisk = vscode.Uri.file(
      path.join(this._extensionPath, 'localScripts/skins', 'narrow.js')
    );
    const lowkeySkinPathOnDisk = vscode.Uri.file(
      path.join(this._extensionPath, 'localScripts/skins', 'lowkey.js')
    );

    // And the uri we use to load this script in the webview
    const scriptUri = scriptPathOnDisk.with({ scheme: 'vscode-resource' });
    const defaultUri = defaultSkinPathOnDisk.with({ scheme: 'vscode-resource' });
    const narrowUri = narrowSkinPathOnDisk.with({ scheme: 'vscode-resource' });
    const lowkeyUri = lowkeySkinPathOnDisk.with({ scheme: 'vscode-resource' });

    return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">

                  <script src="${scriptUri}"></script>

                  <script src="${defaultUri}"></script>
                  <script src="${narrowUri}"></script>
                  <script src="${lowkeyUri}"></script>

                  <title>waveform render</title>
            </head>

            <body onload="WaveDrom.ProcessAll()" style="background-color: white;">
              <div>
                <script type="WaveDrom">
                  ${waveformJson}
                </script>
              </div>
            </body>
            </html>`;
  }
}
