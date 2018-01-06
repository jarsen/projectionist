"use strict";
import * as vscode from "vscode";
import {
  window,
  workspace,
  Uri,
  WorkspaceFolder,
  TextDocument,
  ViewColumn
} from "vscode";
import * as path from "path";
import { worker } from "cluster";
import * as fs from "fs";

import * as mm from "micromatch";
import { isMatch } from "micromatch";

function fileExists(path: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    fs.exists(path, exists => {
      resolve(exists);
    });
  });
}

export function activate(context: vscode.ExtensionContext) {
  console.log("started projectionist");
  const openAlternateFileCmd = vscode.commands.registerCommand(
    "projectionist.openAlternateFile",
    () => openAlternateFile({ split: false })
  );

  const openAlternateFileSplitCmd = vscode.commands.registerCommand(
    "projectionist.openAlternateFileSplit",
    () => openAlternateFile({ split: true })
  );

  context.subscriptions.push(openAlternateFileCmd, openAlternateFileSplitCmd);
}

async function openAlternateFile(options?: {}): Promise<vscode.TextEditor> {
  const editor = window.activeTextEditor;
  if (!editor) {
    return;
  }

  const openUri = await alternateUriForCurrentDocument();
  if (openUri == undefined) {
    return;
  }

  const viewColumn =
    options["split"] === true ? editor.viewColumn + 1 : editor.viewColumn;

  return workspace
    .openTextDocument(openUri)
    .then(doc => window.showTextDocument(doc, viewColumn));
}

function getConfiguration(workspace: WorkspaceFolder): Uri {
  const workspaceUri = workspace.uri;
  const configurationPath = path.resolve(
    workspaceUri.fsPath,
    ".projectionist.json"
  );
  const configuration = require(configurationPath);
  return configuration;
}

/**
 * Returns a `Uri` for the alternate specified in the .projectionist.json configuration.
 * If no alternate glob is specified in the configuration, returns undefined.
 */
async function alternateUriForCurrentDocument(): Promise<Uri | undefined> {
  const editor = window.activeTextEditor;
  const currentUri = editor.document.uri;
  const currentWorkspace = workspace.getWorkspaceFolder(currentUri);
  const configuration = getConfiguration(currentWorkspace);
  const document = editor.document;
  const uri = document.uri;

  const fsPath = uri.fsPath
    .replace(currentWorkspace.uri.fsPath, "")
    .substring(1); // remove project path and leading slash

  for (const glob in configuration) {
    if (configuration.hasOwnProperty(glob)) {
      const alternateGlob = configuration[glob]["alternate"];
      if (alternateGlob && isMatch(fsPath, glob)) {
        const match = mm.capture(glob, fsPath)[0];
        const alternateRelativePath = alternateGlob.replace("*", match);
        const alternatePath = path.resolve(
          currentWorkspace.uri.fsPath,
          alternateRelativePath
        );
        const alternateUri = uri.with({ path: alternatePath });

        const exists = await fileExists(alternateUri.fsPath);
        return exists
          ? alternateUri
          : alternateUri.with({ scheme: "untitled" });
      }
    }
  }
  return undefined;
}

// this method is called when your extension is deactivated
export function deactivate() {}
