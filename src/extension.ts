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
  const openAlternateFileCmd = vscode.commands.registerCommand(
    "projectionist.openAlternateFile",
    () => openAlternateFile({ split: false })
  );

  const openAlternateFileSplitCmd = vscode.commands.registerCommand(
    "projectionist.openAlternateFileSplit",
    () => openAlternateFile({ split: true })
  );

  const openOtherFileCmd = vscode.commands.registerCommand(
    "projectionist.navigateTo",
    async () => {
      const input = await window.showInputBox();
      if (input === "") {
        return;
      }
      const [type, name] = input.split(" ");
      return navigateTo(type, name, { split: false });
    }
  );

  context.subscriptions.push(openAlternateFileCmd, openAlternateFileSplitCmd);
}

async function navigateTo(type: string, name: string, options?: Object) {
  const editor = window.activeTextEditor;
  if (!editor) {
    return;
  }

  const uri = await getUri(type, name);
  if (uri == undefined) {
    return;
  }

  const viewColumn =
    options["split"] === true ? editor.viewColumn + 1 : editor.viewColumn;

  return workspace
    .openTextDocument(uri)
    .then(doc => window.showTextDocument(doc, viewColumn));
}

async function openAlternateFile(options?: {}) {
  const editor = window.activeTextEditor;
  if (!editor) {
    return;
  }

  const uri = await getAlternateUriForCurrentDocument();
  openUri(uri, options);
}

function openUri(uri: Uri, options: Object) {
  if (!uri) {
    return;
  }
  const editor = window.activeTextEditor;
  const viewColumn =
    options["split"] === true ? editor.viewColumn + 1 : editor.viewColumn;

  workspace
    .openTextDocument(uri)
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

async function getUri(type: string, name?: string): Promise<Uri | undefined> {
  const editor = window.activeTextEditor;
  const currentUri = editor.document.uri;
  const currentWorkspace = workspace.getWorkspaceFolder(currentUri);
  const workspacePath = currentWorkspace.uri.fsPath;
  const configuration = getConfiguration(currentWorkspace);
  const document = editor.document;

  if (name) {
    const typeCaseInsensitive = type.toLowerCase();
    for (const glob in configuration) {
      if (configuration.hasOwnProperty(glob)) {
        if (configuration[glob]["type"].toLowerCase() === typeCaseInsensitive) {
          return await getNewUri(currentWorkspace, name, glob, "*");
        }
      }
    }
  } else {
    for (const glob in configuration) {
      if (configuration.hasOwnProperty(glob)) {
        const pathTemplate = configuration[glob][type];
        const fsPath = currentUri.fsPath
          .replace(currentWorkspace.uri.fsPath, "")
          .substring(1); // remove project path and leading slash
        if (pathTemplate && isMatch(fsPath, glob)) {
          const match = mm.capture(glob, fsPath)[0];
          return await getNewUri(currentWorkspace, match, pathTemplate, "{}");
        }
      }
    }
  }
  return undefined;
}

async function getNewUri(
  workspace: WorkspaceFolder,
  replaceWith: string,
  template: string,
  replacing: string
) {
  const newRelativePath = template.replace(replacing, replaceWith);
  const newAbsolutePath = path.resolve(workspace.uri.fsPath, newRelativePath);
  const newUri = workspace.uri.with({ path: newAbsolutePath });

  const exists = await fileExists(newUri.fsPath);
  return exists ? newUri : newUri.with({ scheme: "untitled" });
}

/**
 * Returns a `Uri` for the alternate specified in the .projectionist.json configuration.
 * If no alternate glob is specified in the configuration, returns undefined.
 */
async function getAlternateUriForCurrentDocument(): Promise<Uri | undefined> {
  const editor = window.activeTextEditor;
  const currentUri = editor.document.uri;
  const currentWorkspace = workspace.getWorkspaceFolder(currentUri);
  const configuration = getConfiguration(currentWorkspace);
  const document = editor.document;

  const fsPath = currentUri.fsPath
    .replace(currentWorkspace.uri.fsPath, "")
    .substring(1); // remove project path and leading slash

  for (const glob in configuration) {
    if (configuration.hasOwnProperty(glob)) {
      const pathTemplate = configuration[glob]["alternate"];
      if (pathTemplate && isMatch(fsPath, glob)) {
        const match = mm.capture(glob, fsPath)[0];
        return await getNewUri(currentWorkspace, match, pathTemplate, "{}");
      }
    }
  }
  return undefined;
}

// this method is called when your extension is deactivated
export function deactivate() {}
