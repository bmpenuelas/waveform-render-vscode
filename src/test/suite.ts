import * as assert from "assert";
import {
  activateWithApi,
  COPY_TO_CLIPBOARD_ICON,
  createWaveformWebviewHtml,
  WAVEFORM_CONTEXT_KEY,
  getFilenameFromPath,
  getTitleFromPath,
  isJsonLikeDocument,
  type CommandsLike,
  type ConfigurationChangeEventLike,
  type ConfigurationLike,
  type DisposableLike,
  type ExtensionContextLike,
  type TextDocumentLike,
  type TextEditorLike,
  type UriFactoryLike,
  type UriLike,
  type WaveformExtensionApi,
  type WebviewLike,
  type WebviewPanelLike,
  type WindowLike,
  type WorkspaceLike,
} from "../waveformExtension";

class FakeDisposable implements DisposableLike {
  public constructor(private readonly onDispose?: () => void) {}

  public dispose(): void {
    if (this.onDispose) {
      this.onDispose();
    }
  }
}

class FakeDocument implements TextDocumentLike {
  public constructor(
    public fileName: string,
    public languageId: string,
    private text: string,
    public isUntitled = false,
    public uri = {
      path: fileName,
      scheme: isUntitled ? "untitled" : "file",
    }
  ) {}

  public getText(): string {
    return this.text;
  }

  public setText(text: string): void {
    this.text = text;
  }
}

class FakeEditor implements TextEditorLike {
  public constructor(public document: FakeDocument) {}
}

class FakeWebview implements WebviewLike {
  public html = "";
  public readonly postedMessages: unknown[] = [];

  public asWebviewUri(uri: UriLike): string {
    return "webview:" + uri.toString();
  }

  public postMessage(message: unknown): boolean {
    this.postedMessages.push(message);
    return true;
  }
}

class FakeWebviewPanel implements WebviewPanelLike {
  public readonly webview = new FakeWebview();
  public readonly disposeListeners: Array<() => void> = [];
  public disposeCallCount = 0;
  public isDisposed = false;

  public constructor(public title: string) {}

  public onDidDispose(
    listener: () => void,
    _thisArgs?: unknown,
    disposables?: DisposableLike[]
  ): DisposableLike {
    this.disposeListeners.push(listener);
    const disposable = new FakeDisposable(() => {
      const index = this.disposeListeners.indexOf(listener);
      if (index >= 0) {
        this.disposeListeners.splice(index, 1);
      }
    });

    if (disposables) {
      disposables.push(disposable);
    }

    return disposable;
  }

  public dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    this.disposeCallCount += 1;
    const listeners = [...this.disposeListeners];
    for (const listener of listeners) {
      listener();
    }
  }
}

class FakeConfiguration implements ConfigurationLike {
  public constructor(private readonly values: Record<string, unknown>) {}

  public get<T>(section: string, defaultValue: T): T {
    if (Object.prototype.hasOwnProperty.call(this.values, section)) {
      return this.values[section] as T;
    }

    return defaultValue;
  }
}

class FakeCommands implements CommandsLike {
  public readonly handlers = new Map<string, (...args: unknown[]) => unknown>();
  public readonly executed: Array<{ args: unknown[]; command: string }> = [];

  public executeCommand<T = unknown>(command: string, ...args: unknown[]): T {
    this.executed.push({ args, command });
    return undefined as T;
  }

  public registerCommand(
    command: string,
    callback: (...args: unknown[]) => unknown
  ): DisposableLike {
    this.handlers.set(command, callback);
    return new FakeDisposable(() => {
      this.handlers.delete(command);
    });
  }
}

class FakeWindow implements WindowLike {
  public activeTextEditor: TextEditorLike | undefined;
  public readonly infoMessages: string[] = [];
  public readonly panels: FakeWebviewPanel[] = [];
  public readonly viewColumnBeside = "beside";
  public lastCreateOptions: unknown;
  public lastShowOptions: unknown;
  private readonly activeEditorListeners: Array<
    (editor: TextEditorLike | undefined) => void
  > = [];

  public createWebviewPanel(
    _viewType: string,
    title: string,
    showOptions: unknown,
    options: unknown
  ): WebviewPanelLike {
    this.lastShowOptions = showOptions;
    this.lastCreateOptions = options;
    const panel = new FakeWebviewPanel(title);
    this.panels.push(panel);
    return panel;
  }

  public fireActiveTextEditorChange(editor: TextEditorLike | undefined): void {
    this.activeTextEditor = editor;
    for (const listener of this.activeEditorListeners) {
      listener(editor);
    }
  }

  public onDidChangeActiveTextEditor(
    listener: (editor: TextEditorLike | undefined) => void
  ): DisposableLike {
    this.activeEditorListeners.push(listener);
    return new FakeDisposable(() => {
      const index = this.activeEditorListeners.indexOf(listener);
      if (index >= 0) {
        this.activeEditorListeners.splice(index, 1);
      }
    });
  }

  public showInformationMessage(message: string): void {
    this.infoMessages.push(message);
  }
}

class FakeWorkspace implements WorkspaceLike {
  private readonly configuration: FakeConfiguration;
  private readonly configurationValues: Record<string, unknown>;
  private readonly configurationListeners: Array<
    (event: ConfigurationChangeEventLike) => void
  > = [];
  private readonly textDocumentListeners: Array<(event: unknown) => void> = [];

  public constructor(configurationValues: Record<string, unknown>) {
    this.configurationValues = configurationValues;
    this.configuration = new FakeConfiguration(configurationValues);
  }

  public fireConfigurationChange(section: string): void {
    const event: ConfigurationChangeEventLike = {
      affectsConfiguration: (requestedSection: string) =>
        requestedSection === section,
    };

    for (const listener of this.configurationListeners) {
      listener(event);
    }
  }

  public fireTextDocumentChange(): void {
    for (const listener of this.textDocumentListeners) {
      listener({});
    }
  }

  public setConfigurationValue(section: string, value: unknown): void {
    this.configurationValues[section] = value;
  }

  public getConfiguration(section: string): ConfigurationLike {
    assert.strictEqual(section, "waveformRender");
    return this.configuration;
  }

  public onDidChangeConfiguration(
    listener: (event: ConfigurationChangeEventLike) => void
  ): DisposableLike {
    this.configurationListeners.push(listener);
    return new FakeDisposable(() => {
      const index = this.configurationListeners.indexOf(listener);
      if (index >= 0) {
        this.configurationListeners.splice(index, 1);
      }
    });
  }

  public onDidChangeTextDocument(listener: (event: unknown) => void): DisposableLike {
    this.textDocumentListeners.push(listener);
    return new FakeDisposable(() => {
      const index = this.textDocumentListeners.indexOf(listener);
      if (index >= 0) {
        this.textDocumentListeners.splice(index, 1);
      }
    });
  }
}

class FakeUri implements UriLike {
  public constructor(public path: string) {}

  public toString(): string {
    return "file:///" + this.path.replace(/\\/g, "/");
  }
}

class FakeUriFactory implements UriFactoryLike {
  public file(filePath: string): UriLike {
    return new FakeUri(filePath);
  }
}

function createHarness(options?: {
  activeEditor?: TextEditorLike;
  closePanelOnDisable?: boolean;
  extensions?: string[];
}) {
  const commands = new FakeCommands();
  const window = new FakeWindow();
  const workspace = new FakeWorkspace({
    closePanelOnDisable: options?.closePanelOnDisable ?? false,
    extensions: options?.extensions ?? [],
  });
  const api: WaveformExtensionApi = {
    commands,
    uri: new FakeUriFactory(),
    window,
    workspace,
  };
  const context: ExtensionContextLike = {
    extensionPath: "C:\\extension",
    subscriptions: [],
  };

  window.activeTextEditor = options?.activeEditor;
  const controller = activateWithApi(api, context);

  return {
    api,
    commands,
    context,
    controller,
    window,
    workspace,
  };
}

type TestCase = {
  name: string;
  run: () => void;
};

const tests: TestCase[] = [];

function test(name: string, run: () => void): void {
  tests.push({ name, run });
}

function createJsonEditor(fileName: string, text: string): FakeEditor {
  return new FakeEditor(new FakeDocument(fileName, "json", text));
}

test("detects supported waveform documents", () => {
  assert.strictEqual(
    isJsonLikeDocument(new FakeDocument("wave.json", "plaintext", "{}")),
    true
  );
  assert.strictEqual(
    isJsonLikeDocument(new FakeDocument("wave.json5", "plaintext", "{}")),
    true
  );
  assert.strictEqual(
    isJsonLikeDocument(new FakeDocument("wave.txt", "jsonc", "{}")),
    true
  );
  assert.strictEqual(
    isJsonLikeDocument(
      new FakeDocument("Untitled-1", "plaintext", "{}", true, {
        path: "Untitled-1",
        scheme: "untitled",
      })
    ),
    true
  );
  assert.strictEqual(
    isJsonLikeDocument(new FakeDocument("wave.txt", "plaintext", "{}")),
    false
  );
});

test("derives filenames and titles from editor paths", () => {
  assert.strictEqual(
    getFilenameFromPath("C:\\workspace\\timing.json"),
    "timing"
  );
  assert.strictEqual(
    getFilenameFromPath("/workspace/timing.json5"),
    "timing"
  );
  assert.strictEqual(
    getTitleFromPath("C:\\workspace\\timing.json5"),
    "Waveform: timing"
  );
  assert.strictEqual(
    getFilenameFromPath("C:\\workspace\\timing.wavejson", [".wavejson"]),
    "timing"
  );
  assert.strictEqual(
    getTitleFromPath("C:\\workspace\\timing.wavejson", ["wavejson"]),
    "Waveform: timing"
  );
});

test("renders webview HTML with scripts and export actions", () => {
  const html = createWaveformWebviewHtml({
    extensionPath: "C:\\extension",
    title: "timing",
    toWebviewUri: (uri) => "webview:" + uri.toString(),
    uriFactory: new FakeUriFactory(),
    waveformJson: "{ signal: [] }",
  });

  assert.ok(html.includes("wavedrom.min.js"));
  assert.ok(html.includes("saveSvg"));
  assert.ok(html.includes("savePng"));
  assert.ok(html.includes("copy to clipboard"));
  assert.ok(html.includes(COPY_TO_CLIPBOARD_ICON));
  assert.ok(!html.includes("Ã°Å¸â€œâ€¹"));
  assert.ok(html.includes("WaveDrom.ProcessAll()"));
  assert.ok(html.includes("{ signal: [] }"));
  assert.ok(html.includes("<title>timing</title>"));
});

test("registers extension commands during activation", () => {
  const harness = createHarness();

  assert.deepStrictEqual(
    [...harness.commands.handlers.keys()].sort(),
    [
      "waveformRender.saveAsPng",
      "waveformRender.saveAsSvg",
      "waveformRender.start",
      "waveformRender.toggleLivePreview",
    ]
  );
  assert.strictEqual(harness.context.subscriptions.length, 6);
});

test("activation updates the waveform context key", () => {
  const supportedEditor = createJsonEditor("C:\\workspace\\wave.json", "{ signal: [] }");
  const harness = createHarness({ activeEditor: supportedEditor });

  assert.deepStrictEqual(harness.commands.executed[0], {
    args: [WAVEFORM_CONTEXT_KEY, true],
    command: "setContext",
  });

  const unsupportedEditor = new FakeEditor(
    new FakeDocument("C:\\workspace\\notes.txt", "plaintext", "not waveform")
  );
  harness.window.fireActiveTextEditorChange(unsupportedEditor);

  assert.deepStrictEqual(harness.commands.executed[1], {
    args: [WAVEFORM_CONTEXT_KEY, false],
    command: "setContext",
  });
});

test("draw command creates a panel and keeps live preview disabled", () => {
  const editor = createJsonEditor("C:\\workspace\\wave.json", "{ signal: [] }");
  const harness = createHarness({ activeEditor: editor });

  harness.commands.handlers.get("waveformRender.start")?.();

  assert.strictEqual(harness.controller.hasCurrentPanel(), true);
  assert.strictEqual(harness.controller.isLivePreviewEnabled(), false);
  assert.strictEqual(harness.window.panels.length, 1);
  assert.strictEqual(harness.window.panels[0].title, "Waveform: wave");
  assert.ok(harness.window.panels[0].webview.html.includes("{ signal: [] }"));
  assert.deepStrictEqual(harness.window.lastShowOptions, {
    preserveFocus: true,
    viewColumn: "beside",
  });
  assert.deepStrictEqual(harness.window.lastCreateOptions, {
    enableScripts: true,
    localResourceRoots: [new FakeUri("C:\\extension\\localScripts")],
  });
  assert.ok(
    harness.window.infoMessages.includes(
      "Waveform refreshed manually, Live Preview OFF"
    )
  );
});

test("draw command ignores unsupported files", () => {
  const editor = new FakeEditor(
    new FakeDocument("C:\\workspace\\notes.txt", "plaintext", "not waveform")
  );
  const harness = createHarness({ activeEditor: editor });

  harness.commands.handlers.get("waveformRender.start")?.();

  assert.strictEqual(harness.controller.hasCurrentPanel(), false);
  assert.strictEqual(harness.window.panels.length, 0);
});

test("draw command supports configured custom extensions", () => {
  const editor = new FakeEditor(
    new FakeDocument("C:\\workspace\\wave.wavejson", "plaintext", "{ signal: [] }")
  );
  const harness = createHarness({
    activeEditor: editor,
    extensions: ["wavejson"],
  });

  harness.commands.handlers.get("waveformRender.start")?.();

  assert.strictEqual(harness.controller.hasCurrentPanel(), true);
  assert.strictEqual(harness.window.panels.length, 1);
  assert.strictEqual(harness.window.panels[0].title, "Waveform: wave");
  assert.ok(harness.window.panels[0].webview.html.includes("{ signal: [] }"));
});

test("draw command reuses the existing panel and refreshes its contents", () => {
  const firstEditor = createJsonEditor("C:\\workspace\\first.json", "{ one: 1 }");
  const secondEditor = createJsonEditor("C:\\workspace\\second.json5", "{ two: 2 }");
  const harness = createHarness({ activeEditor: firstEditor });

  harness.commands.handlers.get("waveformRender.start")?.();
  harness.window.activeTextEditor = secondEditor;
  harness.commands.handlers.get("waveformRender.start")?.();

  assert.strictEqual(harness.window.panels.length, 1);
  assert.strictEqual(harness.window.panels[0].title, "Waveform: second");
  assert.ok(harness.window.panels[0].webview.html.includes("{ two: 2 }"));
});

test("live preview updates the existing panel on text changes", () => {
  const editor = createJsonEditor("C:\\workspace\\live.json", "{ before: true }");
  const harness = createHarness({
    activeEditor: editor,
    closePanelOnDisable: false,
  });

  harness.commands.handlers.get("waveformRender.toggleLivePreview")?.();
  assert.strictEqual(harness.controller.isLivePreviewEnabled(), true);
  assert.strictEqual(harness.controller.hasCurrentPanel(), true);
  assert.ok(harness.window.infoMessages.includes("Waveform Live Preview: ON"));

  editor.document.setText("{ after: true }");
  harness.workspace.fireTextDocumentChange();
  assert.ok(harness.window.panels[0].webview.html.includes("{ after: true }"));

  harness.commands.handlers.get("waveformRender.toggleLivePreview")?.();
  assert.strictEqual(harness.controller.isLivePreviewEnabled(), false);
  assert.strictEqual(harness.controller.hasCurrentPanel(), true);
  assert.ok(harness.window.infoMessages.includes("Waveform Live Preview: OFF"));

  editor.document.setText("{ final: true }");
  harness.workspace.fireTextDocumentChange();
  assert.ok(!harness.window.panels[0].webview.html.includes("{ final: true }"));
});

test("live preview can close the panel when disabled via configuration", () => {
  const editor = createJsonEditor("C:\\workspace\\close.json", "{ close: false }");
  const harness = createHarness({
    activeEditor: editor,
    closePanelOnDisable: true,
  });

  harness.commands.handlers.get("waveformRender.toggleLivePreview")?.();
  harness.commands.handlers.get("waveformRender.toggleLivePreview")?.();

  assert.strictEqual(harness.controller.isLivePreviewEnabled(), false);
  assert.strictEqual(harness.controller.hasCurrentPanel(), false);
  assert.strictEqual(harness.window.panels[0].isDisposed, true);
  assert.strictEqual(harness.window.panels[0].disposeCallCount, 1);
});

test("changing editors refreshes the preview when live mode is enabled", () => {
  const firstEditor = createJsonEditor("C:\\workspace\\a.json", "{ a: 1 }");
  const secondEditor = createJsonEditor("C:\\workspace\\b.json", "{ b: 2 }");
  const harness = createHarness({
    activeEditor: firstEditor,
    closePanelOnDisable: false,
  });

  harness.commands.handlers.get("waveformRender.toggleLivePreview")?.();
  harness.window.fireActiveTextEditorChange(secondEditor);

  assert.strictEqual(harness.window.panels.length, 1);
  assert.strictEqual(harness.window.panels[0].title, "Waveform: b");
  assert.ok(harness.window.panels[0].webview.html.includes("{ b: 2 }"));
});

test("changing editors to an unsupported file does not refresh the preview", () => {
  const firstEditor = createJsonEditor("C:\\workspace\\wave.json", "{ a: 1 }");
  const unsupportedEditor = new FakeEditor(
    new FakeDocument("C:\\workspace\\notes.txt", "plaintext", "not waveform")
  );
  const harness = createHarness({
    activeEditor: firstEditor,
    closePanelOnDisable: false,
  });

  harness.commands.handlers.get("waveformRender.toggleLivePreview")?.();
  const originalHtml = harness.window.panels[0].webview.html;

  harness.window.fireActiveTextEditorChange(unsupportedEditor);

  assert.strictEqual(harness.window.panels.length, 1);
  assert.strictEqual(harness.window.panels[0].webview.html, originalHtml);
  assert.strictEqual(harness.window.panels[0].title, "Waveform: wave");
});

test("configuration changes update context and support custom extensions", () => {
  const editor = new FakeEditor(
    new FakeDocument("C:\\workspace\\diagram.wavejson", "plaintext", "{ signal: [] }")
  );
  const harness = createHarness({ activeEditor: editor });

  assert.deepStrictEqual(harness.commands.executed[0], {
    args: [WAVEFORM_CONTEXT_KEY, false],
    command: "setContext",
  });

  harness.workspace.setConfigurationValue("extensions", ["wavejson"]);
  harness.workspace.fireConfigurationChange("waveformRender.extensions");
  assert.deepStrictEqual(harness.commands.executed[1], {
    args: [WAVEFORM_CONTEXT_KEY, true],
    command: "setContext",
  });
  harness.commands.handlers.get("waveformRender.start")?.();
  assert.strictEqual(harness.window.panels[0].title, "Waveform: diagram");
});

test("save commands forward export requests to the webview", () => {
  const editor = createJsonEditor("C:\\workspace\\export.json", "{ export: true }");
  const harness = createHarness({ activeEditor: editor });

  harness.commands.handlers.get("waveformRender.saveAsPng")?.();
  harness.commands.handlers.get("waveformRender.saveAsSvg")?.();
  assert.strictEqual(harness.window.panels.length, 0);

  harness.commands.handlers.get("waveformRender.start")?.();
  harness.commands.handlers.get("waveformRender.saveAsPng")?.();
  harness.commands.handlers.get("waveformRender.saveAsSvg")?.();

  assert.deepStrictEqual(harness.window.panels[0].webview.postedMessages, [
    { command: "savePng" },
    { command: "saveSvg" },
  ]);
});

test("disposing the panel externally clears controller state", () => {
  const editor = createJsonEditor("C:\\workspace\\dispose.json", "{ dispose: true }");
  const harness = createHarness({
    activeEditor: editor,
    closePanelOnDisable: false,
  });

  harness.commands.handlers.get("waveformRender.toggleLivePreview")?.();
  harness.window.panels[0].dispose();

  assert.strictEqual(harness.controller.hasCurrentPanel(), false);
  assert.strictEqual(harness.controller.isLivePreviewEnabled(), false);
});

function runTests(): void {
  let failures = 0;

  for (const currentTest of tests) {
    try {
      currentTest.run();
      console.log("PASS", currentTest.name);
    } catch (error) {
      failures += 1;
      console.error("FAIL", currentTest.name);
      console.error(error);
    }
  }

  if (failures > 0) {
    process.exitCode = 1;
    console.error(`${failures} test(s) failed`);
    return;
  }

  console.log(`${tests.length} test(s) passed`);
}

runTests();
