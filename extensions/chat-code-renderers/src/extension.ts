/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { mermaid, plotly, recharts } from './renderers';

/**
 * Activate the extension and register all enabled code block renderers.
 */
export function activate(context: vscode.ExtensionContext) {
	// Register Mermaid renderer
	context.subscriptions.push(
		vscode.chat.registerChatCodeBlockRenderer(mermaid.RENDERER_ID, mermaid.createRenderer())
	);

	// Register Plotly renderer
	context.subscriptions.push(
		vscode.chat.registerChatCodeBlockRenderer(plotly.RENDERER_ID, plotly.createRenderer())
	);

	// Register Recharts renderer
	context.subscriptions.push(
		vscode.chat.registerChatCodeBlockRenderer(recharts.RENDERER_ID, recharts.createRenderer())
	);
}

export function deactivate() {
	// Cleanup if needed
}
