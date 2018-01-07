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
  const projectAlternateFileCmd = vscode.commands.registerCommand(
    "projectionist.projectAlternateFile",
    () => openAlternateFile({ split: false })
  );

  const projectAlternateFileSplitCmd = vscode.commands.registerCommand(
    "projectionist.projectAlternateFileSplit",
    () => openAlternateFile({ split: true })
  );

  const projectFileCmd = vscode.commands.registerCommand(
    "projectionist.projectFile",
    async () => {
      const input = await window.showInputBox();
      if (input === "") {
        return;
      }
      const [type, name] = input.split(" ");
      if (name === undefined) {
        const uri = await getRelatedUri(type);
        return openUri(uri, { split: false });
      } else {
        const uri = await getUriForTypeAndName(type, name);
        return openUri(uri, { split: false });
      }
    }
  );

  context.subscriptions.push(
    projectAlternateFileCmd,
    projectAlternateFileSplitCmd
  );
}

/**
 * Opens the projection specified as "alternate".
 * @param options options (currently only looks for split: bool)
 */
async function openAlternateFile(options?: {}) {
  const editor = window.activeTextEditor;
  if (!editor) {
    return;
  }

  const uri = await getAlternateUriForCurrentDocument();
  openUri(uri, options);
}

/**
 * Opens a TextDocument based off the given `Uri`.
 * @param uri the Uri to open
 * @param options options (currently only looks for split: bool)
 */
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

/**
 * Returns a configuration by loading the .projectionist.json file
 * from the the specified workspace folder.
 * @param workspace the current workspace folder
 */
function getConfiguration(workspace: WorkspaceFolder): Uri {
  const workspaceUri = workspace.uri;
  const configurationPath = path.resolve(
    workspaceUri.fsPath,
    ".projectionist.json"
  );
  const configuration = require(configurationPath);
  return configuration;
}

async function getUriForTypeAndName(
  type: string,
  name: string
): Promise<Uri | undefined> {
  const currentUri = window.activeTextEditor.document.uri;
  const currentWorkspace = workspace.getWorkspaceFolder(currentUri);
  const configuration = getConfiguration(currentWorkspace);

  const typeCaseInsensitive = type.toLowerCase();
  for (const glob in configuration) {
    if (configuration.hasOwnProperty(glob)) {
      if (configuration[glob]["type"].toLowerCase() === typeCaseInsensitive) {
        return await getNewUri(currentWorkspace, name, glob, "*");
      }
    }
  }
  return undefined;
}

/**
 * Returns a `Uri` based off the first glob that matches the current
 * document, by looking for a key matching `type` and using it as
 * the template for projection.
 * @param type the type of the projection
 */
async function getRelatedUri(type: string): Promise<Uri | undefined> {
  const currentUri = window.activeTextEditor.document.uri;
  const currentWorkspace = workspace.getWorkspaceFolder(currentUri);
  const configuration = getConfiguration(currentWorkspace);

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
  return undefined;
}

/**
 * Creates a `Uri` for the desired document. If the file does not yet exist
 * in the file system, returns a `Uri` with its scheme set to "untitled".
 * This causes VSCode to open a new buffer without writing to disk until
 * the user manually saves.
 * @param workspace the current workspace
 * @param replaceWith the term to insert
 * @param template the template string
 * @param replacing what to replace in the template string
 */
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
  const currentUri = window.activeTextEditor.document.uri;
  const currentWorkspace = workspace.getWorkspaceFolder(currentUri);
  const configuration = getConfiguration(currentWorkspace);

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
