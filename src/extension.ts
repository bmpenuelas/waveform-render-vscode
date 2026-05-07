import * as vscode from "vscode";
import { activateWithApi, createVsCodeApi } from "./waveformExtension";

export function activate(context: vscode.ExtensionContext): void {
  activateWithApi(createVsCodeApi(vscode), context);
}
