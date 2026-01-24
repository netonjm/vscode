/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { mermaid } from './renderers';

/**
 * Activate the extension and register all enabled code block renderers.
 */
export function activate(context: vscode.ExtensionContext) {
	// Register Mermaid renderer
	context.subscriptions.push(
		vscode.chat.registerChatCodeBlockRenderer(mermaid.RENDERER_ID, mermaid.createRenderer())
	);

	// Future renderers can be added here:
	// context.subscriptions.push(
	//     vscode.chat.registerChatCodeBlockRenderer(latex.RENDERER_ID, latex.createRenderer())
	// );
}

export function deactivate() {
	// Cleanup if needed
}
