/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as path from 'path';
import {
	workspace as Workspace, commands as Commands, window as Window, ExtensionContext, TextDocument, OutputChannel, WorkspaceFolder, Uri
} from 'vscode';

import {
	LanguageClient, LanguageClientOptions, TransportKind
} from 'vscode-languageclient/node';

let defaultClient: LanguageClient;
const clients = new Map<string, LanguageClient>();

let _sortedWorkspaceFolders: string[] | undefined;
function sortedWorkspaceFolders(): string[] {
	if (_sortedWorkspaceFolders === void 0) {
		_sortedWorkspaceFolders = Workspace.workspaceFolders ? Workspace.workspaceFolders.map(folder => {
			let result = folder.uri.toString();
			if (result.charAt(result.length - 1) !== '/') {
				result = result + '/';
			}
			return result;
		}).sort(
			(a, b) => {
				return a.length - b.length;
			}
		) : [];
	}
	return _sortedWorkspaceFolders;
}
Workspace.onDidChangeWorkspaceFolders(() => _sortedWorkspaceFolders = undefined);

function getOuterMostWorkspaceFolder(folder: WorkspaceFolder): WorkspaceFolder {
	const sorted = sortedWorkspaceFolders();
	for (const element of sorted) {
		let uri = folder.uri.toString();
		if (uri.charAt(uri.length - 1) !== '/') {
			uri = uri + '/';
		}
		if (uri.startsWith(element)) {
			return Workspace.getWorkspaceFolder(Uri.parse(element))!;
		}
	}
	return folder;
}

export function activate(context: ExtensionContext) {

	const module = context.asAbsolutePath(path.join('server', 'out', 'server.js'));

	const outputChannel: OutputChannel = Window.createOutputChannel('Verse', {log: true});
	outputChannel.show();
	outputChannel.appendLine('Verse activated.');

	let installRhymingDictionary = Commands.registerCommand('verse.installRhymingDictionary', async () => {
		Window.showInformationMessage('Installing Rhyming Dictionary...');
		outputChannel.appendLine('Installing Rhyming Dictionary...');
		await Workspace.fs.createDirectory(context.globalStorageUri);

		outputChannel.appendLine(`Checking for rhyming dictionary database...`);

		if (context.globalState.get("__RhymingDictionaryInstalled__")) {
			Window.showInformationMessage('Rhyming dictionary already installed.');
			outputChannel.appendLine('Rhyming dictionary already installed.');
			return;
		}

		outputChannel.appendLine('Checking for rhyming dictionary...');
		const downloadPath = path.join(context.globalStorageUri.fsPath, 'cmudict-0.7b');
		const downloadExists = await Promise.resolve(Workspace.fs.stat(Uri.file(downloadPath))).then(() => true).catch(() => false);
		let rhymingDictionaryText: string;
		if (downloadExists) {
			outputChannel.appendLine('Rhyming dictionary already downloaded.');
			try {
				rhymingDictionaryText = (await Workspace.fs.readFile(Uri.file(downloadPath))).toString();
			} catch (err) {
				outputChannel.appendLine(`Failed to read rhyming dictionary: ${err}`);
				return;
			}
		} else {
			try {
				outputChannel.appendLine('Downloading CMU Pronouncing Dictionary...');
				const rhymingDictionaryResult = await fetch('https://svn.code.sf.net/p/cmusphinx/code/trunk/cmudict/cmudict-0.7b');
				rhymingDictionaryText = await rhymingDictionaryResult.text();
				await Workspace.fs.writeFile(Uri.file(downloadPath), Buffer.from(rhymingDictionaryText));
				outputChannel.appendLine(`Downloaded rhyming dictionary... `);
			} catch (err) {
				outputChannel.appendLine(`Failed to download rhyming dictionary: ${err}`);
				return;
			}
		}

		try {
			outputChannel.appendLine(`Saving rhyming dictionary to database...`);
			for (const line of rhymingDictionaryText.split('\n')) {
				if (line.startsWith(';;;') || !line.trim()) {
					continue;
				}
				const [word, phonemes] = line.split('  ');
				context.globalState.update(word, phonemes);
			}
		} catch (err) {
			outputChannel.appendLine(`Failed to fill database: ${err}`);
		}
		context.globalState.update("__RhymingDictionaryInstalled__", true);
		outputChannel.appendLine(`Rhyming Dictionary installed.`);
		Window.showInformationMessage('Rhyming Dictionary installed.');
	});
	context.subscriptions.push(installRhymingDictionary);

	function didOpenTextDocument(document: TextDocument): void {
		// We are only interested in language mode text
		if (document.languageId !== 'verse' || (document.uri.scheme !== 'file' && document.uri.scheme !== 'untitled')) {
			return;
		}

		const uri = document.uri;
		// Untitled files go to a default client.
		if (uri.scheme === 'untitled' && !defaultClient) {
			const serverOptions = {
				run: { module, transport: TransportKind.ipc },
				debug: { module, transport: TransportKind.ipc }
			};
			const clientOptions: LanguageClientOptions = {
				documentSelector: [
					{ scheme: 'untitled', language: 'verse' }
				],
				diagnosticCollectionName: 'verse-language-server',
				outputChannel: outputChannel
			};
			defaultClient = new LanguageClient('verse-language-server', 'Verse Language Server', serverOptions, clientOptions);
			defaultClient.start();
			return;
		}
		let folder = Workspace.getWorkspaceFolder(uri);
		// Files outside a folder can't be handled. This might depend on the language.
		// Single file languages like JSON might handle files outside the workspace folders.
		if (!folder) {
			return;
		}
		// If we have nested workspace folders we only start a server on the outer most workspace folder.
		folder = getOuterMostWorkspaceFolder(folder);

		if (!clients.has(folder.uri.toString())) {
			const serverOptions = {
				run: { module, transport: TransportKind.ipc },
				debug: { module, transport: TransportKind.ipc }
			};
			const clientOptions: LanguageClientOptions = {
				documentSelector: [
					{ scheme: 'file', language: 'verse', pattern: `${folder.uri.fsPath}/**/*` }
				],
				diagnosticCollectionName: 'verse-language-server',
				workspaceFolder: folder,
				outputChannel: outputChannel
			};
			const client = new LanguageClient('verse-language-server', 'Verse Language Server', serverOptions, clientOptions);
			client.start();
			clients.set(folder.uri.toString(), client);
		}
	}

	Workspace.onDidOpenTextDocument(didOpenTextDocument);
	Workspace.textDocuments.forEach(didOpenTextDocument);
	Workspace.onDidChangeWorkspaceFolders((event) => {
		for (const folder of event.removed) {
			const client = clients.get(folder.uri.toString());
			if (client) {
				clients.delete(folder.uri.toString());
				client.stop();
			}
		}
	});
}

export function deactivate(): Thenable<void> {
	const promises: Thenable<void>[] = [];
	if (defaultClient) {
		promises.push(defaultClient.stop());
	}
	for (const client of clients.values()) {
		promises.push(client.stop());
	}
	return Promise.all(promises).then(() => undefined);
}