import * as path from "path";
import type * as vscode from "vscode";

export interface DisposableLike {
  dispose(): void;
}

export interface UriLike {
  path?: string;
  toString(): string;
}

export interface TextDocumentLike {
  fileName: string;
  languageId: string;
  isUntitled: boolean;
  uri: {
    scheme: string;
    path: string;
  };
  getText(): string;
}

export interface TextEditorLike {
  document: TextDocumentLike;
}

export interface WebviewLike {
  html: string;
  asWebviewUri(uri: UriLike): UriLike | string;
  postMessage(message: unknown): PromiseLike<boolean> | boolean;
}

export interface WebviewPanelLike {
  title: string;
  webview: WebviewLike;
  onDidDispose(
    listener: () => void,
    thisArgs?: unknown,
    disposables?: DisposableLike[]
  ): DisposableLike;
  dispose(): void;
}

export interface ConfigurationLike {
  get<T>(section: string, defaultValue: T): T;
}

export interface ConfigurationChangeEventLike {
  affectsConfiguration(section: string): boolean;
}

export interface CommandsLike {
  registerCommand(
    command: string,
    callback: (...args: unknown[]) => unknown
  ): DisposableLike;
  executeCommand<T = unknown>(
    command: string,
    ...args: unknown[]
  ): PromiseLike<T> | T;
}

export interface WindowLike {
  activeTextEditor: TextEditorLike | undefined;
  showInformationMessage(message: string): Promise<unknown> | unknown;
  createWebviewPanel(
    viewType: string,
    title: string,
    showOptions: unknown,
    options: unknown
  ): WebviewPanelLike;
  onDidChangeActiveTextEditor(
    listener: (editor: TextEditorLike | undefined) => void
  ): DisposableLike;
  viewColumnBeside: unknown;
}

export interface WorkspaceLike {
  getConfiguration(section: string): ConfigurationLike;
  onDidChangeTextDocument(listener: (event: unknown) => void): DisposableLike;
  onDidChangeConfiguration(
    listener: (event: ConfigurationChangeEventLike) => void
  ): DisposableLike;
}

export interface UriFactoryLike {
  file(filePath: string): UriLike;
}

export interface WaveformExtensionApi {
  commands: CommandsLike;
  uri: UriFactoryLike;
  window: WindowLike;
  workspace: WorkspaceLike;
}

export interface ExtensionContextLike {
  extensionPath: string;
  subscriptions: DisposableLike[];
}

interface ManagedPanel {
  disposables: DisposableLike[];
  panel: WebviewPanelLike;
}

export const WAVEFORM_VIEW_TYPE = "waveformRender";
export const WAVEFORM_CONTEXT_KEY = "waveformRender.isWaveformFile";
export const COPY_TO_CLIPBOARD_ICON = "&#128203;";
export const DEFAULT_WAVEFORM_EXTENSIONS = [".json", ".json5"];
export const DEFAULT_WAVEFORM_CONTENT = `{ signal: [
    { name: "clk",         wave: "p.....|..." },
    { name: "Data",        wave: "x.345x|=.x", data: ["head", "body", "tail", "data"] },
    { name: "Request",     wave: "0.1..0|1.0" },
    {},
    { name: "Acknowledge", wave: "1.....|01." }
  ]}`;

export function normalizeConfiguredExtensions(extensions: string[]): string[] {
  const normalized = extensions
    .filter((extension) => !!extension)
    .map((extension) => extension.trim().toLowerCase())
    .filter((extension) => extension.length > 0)
    .map((extension) => (extension.startsWith(".") ? extension : "." + extension));

  return [...new Set(normalized)];
}

export function isJsonLikeDocument(
  doc: TextDocumentLike,
  configuredExtensions: string[] = []
): boolean {
  const fileName = doc.fileName.toLowerCase();
  const allExtensions = [
    ...DEFAULT_WAVEFORM_EXTENSIONS,
    ...normalizeConfiguredExtensions(configuredExtensions),
  ];

  return (
    allExtensions.some((extension) => fileName.endsWith(extension)) ||
    doc.languageId === "json" ||
    doc.languageId === "jsonc" ||
    doc.languageId === "json5" ||
    doc.isUntitled ||
    doc.uri.scheme === "untitled"
  );
}

export function getFilenameFromPath(
  fileName: string,
  configuredExtensions: string[] = []
): string {
  const fullName = fileName.split(/[\\/]/).pop() || "";
  let baseName = fullName;
  const allExtensions = [
    ...DEFAULT_WAVEFORM_EXTENSIONS,
    ...normalizeConfiguredExtensions(configuredExtensions),
  ].sort((left, right) => right.length - left.length);

  for (const extension of allExtensions) {
    const escapedExtension = extension.replace(".", "\\.");
    baseName = baseName.replace(new RegExp(`${escapedExtension}$`, "i"), "");
  }

  return baseName || fullName;
}

export function getTitleFromPath(
  fileName: string,
  configuredExtensions: string[] = []
): string {
  return "Waveform: " + getFilenameFromPath(fileName, configuredExtensions);
}

export function createWaveformWebviewHtml(params: {
  extensionPath: string;
  title?: string;
  toWebviewUri: (uri: UriLike) => UriLike | string;
  uriFactory: UriFactoryLike;
  waveformJson: string;
}): string {
  const scriptPathOnDisk = params.uriFactory.file(
    path.join(params.extensionPath, "localScripts", "wavedrom.min.js")
  );
  const defaultSkinPathOnDisk = params.uriFactory.file(
    path.join(params.extensionPath, "localScripts", "skins", "default.js")
  );
  const narrowSkinPathOnDisk = params.uriFactory.file(
    path.join(params.extensionPath, "localScripts", "skins", "narrow.js")
  );
  const lowkeySkinPathOnDisk = params.uriFactory.file(
    path.join(params.extensionPath, "localScripts", "skins", "lowkey.js")
  );

  const scriptUri = params.toWebviewUri(scriptPathOnDisk);
  const defaultUri = params.toWebviewUri(defaultSkinPathOnDisk);
  const narrowUri = params.toWebviewUri(narrowSkinPathOnDisk);
  const lowkeyUri = params.toWebviewUri(lowkeySkinPathOnDisk);
  const title = params.title || "waveform render";

  return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">

                  <script src="${scriptUri}"></script>

                  <script src="${defaultUri}"></script>
                  <script src="${narrowUri}"></script>
                  <script src="${lowkeyUri}"></script>

                  <title>${title}</title>
            </head>

            <script>
            window.addEventListener('message', async event => {
              const command = event.data.command;

              const svgEl = document.querySelector('svg');
              if (!svgEl) return;

              if (command === 'saveSvg') {
                const blob = new Blob([svgEl.outerHTML], { type: 'image/svg+xml' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = document.title + '.svg';
                a.click();
                URL.revokeObjectURL(url);
              }

              if (command === 'savePng') {
                const svg = new XMLSerializer().serializeToString(svgEl);
                const svg64 = btoa(unescape(encodeURIComponent(svg)));
                const img = new Image();
                img.src = 'data:image/svg+xml;base64,' + svg64;

                img.onload = async function () {
                  const scaleFactor = 2;
                  const canvas = document.createElement('canvas');
                  const width = img.width * scaleFactor;
                  const height = img.height * scaleFactor;

                  canvas.width = width;
                  canvas.height = height;
                  const ctx = canvas.getContext('2d');
                  ctx.scale(scaleFactor, scaleFactor);
                  ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, img.width, img.height);

                  const pngUrl = canvas.toDataURL('image/png');

                  const a = document.createElement('a');
                  a.href = pngUrl;
                  a.download = document.title + '.png';
                  a.click();
                };
              }

            });
            </script>

            <body onload="WaveDrom.ProcessAll()" style="background-color: white;">
              <div id="copyBtn" style="display: flex; align-items: center; justify-content: flex-end; cursor: pointer; margin-top: 10px; margin-bottom: 10px;">
                <span style="font-size: 14px; margin-right: 3px;">${COPY_TO_CLIPBOARD_ICON}</span>
                <span style="font-weight: 600; font-size: 16px;">copy to clipboard</span>
              </div>

              <div>
                <script type="WaveDrom">
                  ${params.waveformJson}
                </script>
              </div>

              <script>
                document.getElementById('copyBtn').addEventListener('click', async () => {
                  const svgEl = document.querySelector('svg');
                  if (!svgEl) {
                    alert('SVG not found!');
                    return;
                  }

                  const svg = new XMLSerializer().serializeToString(svgEl);
                  const svg64 = btoa(unescape(encodeURIComponent(svg)));
                  const img = new Image();
                  img.src = 'data:image/svg+xml;base64,' + svg64;

                  img.onload = async function () {
                    const scaleFactor = 2;
                    const canvas = document.createElement('canvas');
                    const width = img.width * scaleFactor;
                    const height = img.height * scaleFactor;

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.scale(scaleFactor, scaleFactor);
                    ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, img.width, img.height);

                    const pngUrl = canvas.toDataURL('image/png');
                    const blob = await (await fetch(pngUrl)).blob();

                    try {
                      await navigator.clipboard.write([
                        new ClipboardItem({ [blob.type]: blob })
                      ]);
                      alert('Image copied to clipboard!');
                    } catch (err) {
                      alert('Clipboard copy failed: ' + err.message);
                    }
                  };
                });
              </script>

            </body>
            </html>`;
}

export class WaveformRenderController {
  private currentPanel: ManagedPanel | undefined;
  private listenerTextChange: DisposableLike | undefined;
  private livePreview = false;
  private livePreviewDocumentPath: string | null = null;

  public constructor(
    private readonly api: WaveformExtensionApi,
    private readonly extensionPath: string
  ) {}

  public activate(subscriptions: DisposableLike[]): void {
    subscriptions.push(
      this.api.commands.registerCommand("waveformRender.start", () => {
        this.disableLivePreview();
        this.api.window.showInformationMessage(
          "Waveform refreshed manually, Live Preview OFF"
        );
        this.createOrShow();
      })
    );

    subscriptions.push(
      this.api.commands.registerCommand(
        "waveformRender.toggleLivePreview",
        () => {
          this.toggleLivePreview();
        }
      )
    );

    subscriptions.push(
      this.api.window.onDidChangeActiveTextEditor((editor) => {
        this.updateWaveformContext();
        if (this.livePreview && editor && this.isWaveformDocument(editor.document)) {
          this.createOrShow();
        }
      })
    );

    subscriptions.push(
      this.api.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("waveformRender.extensions")) {
          this.updateWaveformContext();

          if (
            this.currentPanel &&
            this.api.window.activeTextEditor &&
            this.isWaveformDocument(this.api.window.activeTextEditor.document)
          ) {
            this.currentPanel.panel.title = this.getTitle();
            this.updateCurrentPanel();
          }
        }
      })
    );

    subscriptions.push(
      this.api.commands.registerCommand("waveformRender.saveAsPng", () => {
        this.saveAsPng();
      })
    );

    subscriptions.push(
      this.api.commands.registerCommand("waveformRender.saveAsSvg", () => {
        this.saveAsSvg();
      })
    );

    this.updateWaveformContext();
  }

  public isLivePreviewEnabled(): boolean {
    return this.livePreview;
  }

  public hasCurrentPanel(): boolean {
    return !!this.currentPanel;
  }

  public toggleLivePreview(): void {
    const closePanelOnDisable = this.api.workspace
      .getConfiguration("waveformRender")
      .get<boolean>("closePanelOnDisable", true);

    if (this.livePreview) {
      this.disableLivePreview();

      if (closePanelOnDisable && this.currentPanel) {
        this.disposePanel(this.currentPanel, false);
      }
    } else {
      const activeEditor = this.api.window.activeTextEditor;
      this.livePreviewDocumentPath = activeEditor
        ? activeEditor.document.uri.path
        : null;
      this.listenerTextChange = this.api.workspace.onDidChangeTextDocument(() => {
        this.createOrShow();
      });
      this.livePreview = true;
      this.createOrShow();
    }

    this.api.window.showInformationMessage(
      "Waveform Live Preview: " + (this.livePreview ? "ON" : "OFF")
    );
  }

  public disableLivePreview(): void {
    this.livePreviewDocumentPath = null;
    if (this.listenerTextChange) {
      this.listenerTextChange.dispose();
      this.listenerTextChange = undefined;
    }
    this.livePreview = false;
  }

  public createOrShow(): void {
    const activeEditor = this.api.window.activeTextEditor;

    if (!activeEditor || !this.isWaveformDocument(activeEditor.document)) {
      return;
    }

    if (this.currentPanel) {
      this.currentPanel.panel.title = this.getTitle();
      this.updateCurrentPanel();
      return;
    }

    const panel = this.api.window.createWebviewPanel(
      WAVEFORM_VIEW_TYPE,
      this.getTitle(),
      {
        preserveFocus: true,
        viewColumn: this.api.window.viewColumnBeside,
      },
      {
        enableScripts: true,
        localResourceRoots: [
          this.api.uri.file(path.join(this.extensionPath, "localScripts")),
        ],
      }
    );

    const managedPanel: ManagedPanel = {
      disposables: [],
      panel,
    };

    panel.onDidDispose(
      () => this.disposePanel(managedPanel, true),
      null,
      managedPanel.disposables
    );

    this.currentPanel = managedPanel;
    this.updateCurrentPanel();
  }

  public saveAsSvg(): void {
    if (this.currentPanel) {
      this.currentPanel.panel.webview.postMessage({
        command: "saveSvg",
      });
    }
  }

  public saveAsPng(): void {
    if (this.currentPanel) {
      this.currentPanel.panel.webview.postMessage({
        command: "savePng",
      });
    }
  }

  private disposePanel(panel: ManagedPanel, panelAlreadyDisposed: boolean): void {
    if (this.currentPanel !== panel) {
      return;
    }

    this.currentPanel = undefined;
    this.disableLivePreview();

    if (!panelAlreadyDisposed) {
      panel.panel.dispose();
    }

    while (panel.disposables.length) {
      const disposable = panel.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  private getConfiguredExtensions(): string[] {
    const extensions = this.api.workspace
      .getConfiguration("waveformRender")
      .get<string[]>("extensions", []);

    return normalizeConfiguredExtensions(extensions);
  }

  private getFilename(): string {
    const activeEditor = this.api.window.activeTextEditor;
    if (!activeEditor) {
      return "";
    }

    return getFilenameFromPath(
      activeEditor.document.fileName,
      this.getConfiguredExtensions()
    );
  }

  private getTitle(): string {
    const activeEditor = this.api.window.activeTextEditor;
    if (!activeEditor) {
      return "Waveform: ";
    }

    return getTitleFromPath(
      activeEditor.document.fileName,
      this.getConfiguredExtensions()
    );
  }

  private isWaveformDocument(document: TextDocumentLike): boolean {
    return isJsonLikeDocument(document, this.getConfiguredExtensions());
  }

  private updateCurrentPanel(): void {
    if (!this.currentPanel) {
      return;
    }

    const activeEditor = this.api.window.activeTextEditor;
    if (!activeEditor) {
      return;
    }

    this.currentPanel.panel.webview.html = createWaveformWebviewHtml({
      extensionPath: this.extensionPath,
      title: this.getFilename(),
      toWebviewUri: (uri) => this.currentPanel!.panel.webview.asWebviewUri(uri),
      uriFactory: this.api.uri,
      waveformJson: activeEditor.document.getText(),
    });
  }

  private updateWaveformContext(): void {
    const activeEditor = this.api.window.activeTextEditor;
    const isWaveformFile = activeEditor
      ? this.isWaveformDocument(activeEditor.document)
      : false;

    this.api.commands.executeCommand(
      "setContext",
      WAVEFORM_CONTEXT_KEY,
      isWaveformFile
    );
  }
}

export function activateWithApi(
  api: WaveformExtensionApi,
  context: ExtensionContextLike
): WaveformRenderController {
  const controller = new WaveformRenderController(api, context.extensionPath);
  controller.activate(context.subscriptions);
  return controller;
}

export function createVsCodeApi(
  vscodeApi: typeof vscode
): WaveformExtensionApi {
  return {
    commands: {
      executeCommand: (command: string, ...args: unknown[]) =>
        vscodeApi.commands.executeCommand(command, ...args),
      registerCommand: (
        command: string,
        callback: (...args: unknown[]) => unknown
      ) => vscodeApi.commands.registerCommand(command, callback),
    },
    uri: {
      file: (filePath: string) => vscodeApi.Uri.file(filePath),
    },
    window: {
      get activeTextEditor() {
        return vscodeApi.window.activeTextEditor as TextEditorLike | undefined;
      },
      createWebviewPanel: (
        viewType: string,
        title: string,
        showOptions: unknown,
        options: unknown
      ) =>
        vscodeApi.window.createWebviewPanel(
          viewType,
          title,
          showOptions as
            | vscode.ViewColumn
            | {
                preserveFocus?: boolean;
                viewColumn: vscode.ViewColumn;
              },
          options as vscode.WebviewOptions & vscode.WebviewPanelOptions
        ),
      onDidChangeActiveTextEditor: (
        listener: (editor: TextEditorLike | undefined) => void
      ) => vscodeApi.window.onDidChangeActiveTextEditor(listener),
      showInformationMessage: (message: string) =>
        vscodeApi.window.showInformationMessage(message),
      get viewColumnBeside() {
        return vscodeApi.ViewColumn.Beside;
      },
    },
    workspace: {
      getConfiguration: (section: string) =>
        vscodeApi.workspace.getConfiguration(section),
      onDidChangeConfiguration: (
        listener: (event: ConfigurationChangeEventLike) => void
      ) => vscodeApi.workspace.onDidChangeConfiguration(listener),
      onDidChangeTextDocument: (listener: (event: unknown) => void) =>
        vscodeApi.workspace.onDidChangeTextDocument(listener),
    },
  };
}
