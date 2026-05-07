const assert = require("assert");
const fs = require("fs");
const { chromium } = require("playwright-core");
const { createWaveformWebviewHtml } = require("../.test-out/waveformExtension.js");

const EDGE_CANDIDATES = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

const tests = [];

class DataUri {
  constructor(value) {
    this.value = value;
  }

  toString() {
    return this.value;
  }
}

class DataUriFactory {
  file(filePath) {
    return new DataUri("file:///" + filePath.replace(/\\/g, "/"));
  }
}

function test(name, run) {
  tests.push({ name, run });
}

function findEdgeExecutable() {
  for (const candidate of EDGE_CANDIDATES) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function createRuntimeHtml(waveformJson = "{ signal: [] }", title = "runtime") {
  return createWaveformWebviewHtml({
    extensionPath: "C:\\extension",
    title,
    toWebviewUri: () => "data:text/javascript,void%200;",
    uriFactory: new DataUriFactory(),
    waveformJson,
  });
}

async function createRuntimePage(browser) {
  const page = await browser.newPage();

  await page.setContent(
    createRuntimeHtml("{ signal: [{ name: 'clk', wave: 'p.' }] }", "runtime")
  );
  await page.waitForSelector("#copyBtn");
  await page.evaluate(() => {
    const state = {
      alerts: [],
      anchorClicks: [],
      clipboardWrites: [],
      failClipboard: false,
      fetchCalls: [],
      imageSrcs: [],
      objectUrls: [],
      processAllCalls: 0,
      revokedUrls: [],
    };

    window.__waveTest = state;

    window.alert = (message) => {
      state.alerts.push(String(message));
    };

    window.WaveDrom = {
      ProcessAll() {
        state.processAllCalls += 1;

        if (!document.querySelector("svg")) {
          const svg = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "svg"
          );
          svg.setAttribute("width", "120");
          svg.setAttribute("height", "80");
          svg.innerHTML = "<rect width='120' height='80'></rect>";
          document.body.appendChild(svg);
        }
      },
    };

    class FakeImage {
      constructor() {
        this.width = 120;
        this.height = 80;
        this.onload = null;
        this._src = "";
      }

      get src() {
        return this._src;
      }

      set src(value) {
        this._src = value;
        state.imageSrcs.push(value);
        Promise.resolve().then(() => {
          if (this.onload) {
            this.onload();
          }
        });
      }
    }

    class FakeClipboardItem {
      constructor(items) {
        this.items = items;
        this.types = Object.keys(items);
      }
    }

    Object.defineProperty(window, "Image", {
      configurable: true,
      value: FakeImage,
    });

    Object.defineProperty(window, "ClipboardItem", {
      configurable: true,
      value: FakeClipboardItem,
    });

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        async write(items) {
          state.clipboardWrites.push(items);
          if (state.failClipboard) {
            throw new Error("denied");
          }
        },
      },
    });

    HTMLCanvasElement.prototype.getContext = function getContext() {
      return {
        drawImage() {},
        scale() {},
      };
    };

    HTMLCanvasElement.prototype.toDataURL = function toDataURL() {
      return "data:image/png;base64,ZmFrZQ==";
    };

    HTMLAnchorElement.prototype.click = function click() {
      state.anchorClicks.push({
        download: this.download,
        href: this.href,
      });
    };

    URL.createObjectURL = (blob) => {
      const url = `blob:fake-${state.objectUrls.length + 1}`;
      state.objectUrls.push({
        type: blob.type,
        url,
      });
      return url;
    };

    URL.revokeObjectURL = (url) => {
      state.revokedUrls.push(url);
    };

    window.fetch = async (input) => {
      const value =
        typeof input === "string"
          ? input
          : input instanceof URL
          ? input.toString()
          : input.url;
      state.fetchCalls.push(value);
      return {
        async blob() {
          return new Blob(["fake-png"], { type: "image/png" });
        },
      };
    };
  });
  await page.evaluate(() => {
    window.WaveDrom.ProcessAll();
  });
  await page.waitForFunction(() => {
    return !!document.querySelector("svg") && window.__waveTest.processAllCalls > 0;
  });
  return page;
}

async function getRuntimeState(page) {
  return page.evaluate(() => window.__waveTest);
}

test("loads the webview runtime and renders the stubbed svg", async (browser) => {
  const page = await createRuntimePage(browser);
  try {
    assert.strictEqual(await page.title(), "runtime");
    assert.strictEqual(await page.locator("#copyBtn").count(), 1);
    assert.strictEqual(await page.locator("svg").count(), 1);
    assert.strictEqual(
      await page.locator("#copyBtn span").first().textContent(),
      String.fromCodePoint(0x1f4cb)
    );

    const state = await getRuntimeState(page);
    assert.strictEqual(state.processAllCalls, 1);
  } finally {
    await page.close();
  }
});

test("saveSvg executes browser-side download logic", async (browser) => {
  const page = await createRuntimePage(browser);
  try {
    await page.evaluate(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { command: "saveSvg" },
        })
      );
    });

    const state = await getRuntimeState(page);
    assert.deepStrictEqual(state.objectUrls, [
      { type: "image/svg+xml", url: "blob:fake-1" },
    ]);
    assert.deepStrictEqual(state.revokedUrls, ["blob:fake-1"]);
    assert.deepStrictEqual(state.anchorClicks, [
      { download: "runtime.svg", href: "blob:fake-1" },
    ]);
  } finally {
    await page.close();
  }
});

test("savePng executes browser-side canvas export logic", async (browser) => {
  const page = await createRuntimePage(browser);
  try {
    await page.evaluate(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { command: "savePng" },
        })
      );
    });

    await page.waitForFunction(() => window.__waveTest.anchorClicks.length === 1);

    const state = await getRuntimeState(page);
    assert.strictEqual(state.imageSrcs.length, 1);
    assert.ok(state.imageSrcs[0].startsWith("data:image/svg+xml;base64,"));
    assert.deepStrictEqual(state.anchorClicks, [
      {
        download: "runtime.png",
        href: "data:image/png;base64,ZmFrZQ==",
      },
    ]);
  } finally {
    await page.close();
  }
});

test("copy button writes to the clipboard on success", async (browser) => {
  const page = await createRuntimePage(browser);
  try {
    await page.click("#copyBtn");
    await page.waitForFunction(() => window.__waveTest.clipboardWrites.length === 1);

    const state = await getRuntimeState(page);
    assert.strictEqual(state.fetchCalls.length, 1);
    assert.deepStrictEqual(state.clipboardWrites[0][0].types, ["image/png"]);
    assert.deepStrictEqual(state.alerts, ["Image copied to clipboard!"]);
  } finally {
    await page.close();
  }
});

test("copy button surfaces clipboard failures", async (browser) => {
  const page = await createRuntimePage(browser);
  try {
    await page.evaluate(() => {
      window.__waveTest.failClipboard = true;
    });

    await page.click("#copyBtn");
    await page.waitForFunction(() => window.__waveTest.alerts.length === 1);

    const state = await getRuntimeState(page);
    assert.deepStrictEqual(state.alerts, ["Clipboard copy failed: denied"]);
  } finally {
    await page.close();
  }
});

async function runTests() {
  const edgeExecutable = findEdgeExecutable();
  if (!edgeExecutable) {
    console.log("SKIP webview runtime tests: Edge executable not found");
    return;
  }

  const browser = await chromium.launch({
    executablePath: edgeExecutable,
    headless: true,
  });

  let failures = 0;

  try {
    for (const currentTest of tests) {
      try {
        await currentTest.run(browser);
        console.log("PASS", currentTest.name);
      } catch (error) {
        failures += 1;
        console.error("FAIL", currentTest.name);
        console.error(error);
      }
    }
  } finally {
    await browser.close();
  }

  if (failures > 0) {
    process.exitCode = 1;
    console.error(`${failures} webview runtime test(s) failed`);
    return;
  }

  console.log(`${tests.length} webview runtime test(s) passed`);
}

runTests().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
