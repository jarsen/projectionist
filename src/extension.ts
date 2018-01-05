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
  // TODO memoize all the matchers and load them here.?
  // Then we'll have to deal with caching
  const disposable = vscode.commands.registerCommand(
    "projectionist.jumpToAlternateFile",
    async () => {
      const editor = window.activeTextEditor;
      if (!editor) {
        return;
      }

      const currentUri = editor.document.uri;
      const currentWorkspace = workspace.getWorkspaceFolder(currentUri);
      const configuration = configurationForWorkspace(currentWorkspace);
      const alternateUri = alternateUriForDocument(
        currentWorkspace,
        configuration,
        editor.document
      );

      const exists = await fileExists(alternateUri.fsPath);
      const openUri = exists
        ? alternateUri
        : alternateUri.with({ scheme: "untitled" });

      return workspace
        .openTextDocument(openUri)
        .then(doc => window.showTextDocument(doc));
    }
  );

  context.subscriptions.push(disposable);
}

function configurationForWorkspace(workspace: WorkspaceFolder): Uri {
  const workspaceUri = workspace.uri;
  const configurationPath = path.resolve(
    workspaceUri.fsPath,
    ".projectionist.json"
  );
  const configuration = require(configurationPath);
  return configuration;
}

/**
 * Returns a `Uri` for the alternate specified in the projectionist configuration.
 * If no alternate glob is specified in the configuration, returns undefined.
 * @param workspace the workspace the document belongs to
 * @param configuration the projectionist configuration (loaded from .projectionist.json)
 * @param document the document currently being edited
 */
function alternateUriForDocument(
  workspace: WorkspaceFolder,
  configuration: Object,
  document: TextDocument
): Uri | undefined {
  const uri = document.uri;
  const fsPath = uri.fsPath.replace(workspace.uri.fsPath, "").substring(1); // remove project path and leading slash
  for (const glob in configuration) {
    if (configuration.hasOwnProperty(glob)) {
      const alternateGlob = configuration[glob]["alternate"];
      if (alternateGlob && isMatch(fsPath, glob)) {
        const match = mm.capture(glob, fsPath)[0];
        const alternateRelativePath = alternateGlob.replace("*", match);
        const alternatePath = path.resolve(
          workspace.uri.fsPath,
          alternateRelativePath
        );
        return uri.with({ path: alternatePath });
      }
    }
  }
  return undefined;
}

// this method is called when your extension is deactivated
export function deactivate() {}
