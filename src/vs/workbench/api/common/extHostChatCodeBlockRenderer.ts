/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { ExtHostChatCodeBlockRendererShape, IMainContext, MainContext, MainThreadChatCodeBlockRendererShape } from './extHost.protocol.js';
import { Disposable } from './extHostTypes.js';
import { ExtHostWebviews } from './extHostWebview.js';
import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';

export class ExtHostChatCodeBlockRenderer implements ExtHostChatCodeBlockRendererShape {

	private readonly _proxy: MainThreadChatCodeBlockRendererShape;

	private readonly _renderers = new Map</*id*/ string, {
		readonly renderer: vscode.ChatCodeBlockRenderer;
		readonly extension: IExtensionDescription;
	}>();

	constructor(
		mainContext: IMainContext,
		private readonly webviews: ExtHostWebviews,
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadChatCodeBlockRenderer);
	}

	registerChatCodeBlockRenderer(extension: IExtensionDescription, id: string, renderer: vscode.ChatCodeBlockRenderer): vscode.Disposable {
		if (this._renderers.has(id)) {
			throw new Error(`Chat code block renderer already registered for: ${id}`);
		}

		this._renderers.set(id, { extension, renderer });
		this._proxy.$registerChatCodeBlockRenderer(id, extension.identifier, extension.extensionLocation);

		return new Disposable(() => {
			this._renderers.delete(id);
			this._proxy.$unregisterChatCodeBlockRenderer(id);
		});
	}

	async $shouldRenderCodeBlock(id: string, languageId: string, code: string, isComplete: boolean, token: CancellationToken): Promise<boolean> {
		const entry = this._renderers.get(id);
		if (!entry) {
			return false;
		}

		const context: vscode.ChatCodeBlockContext = Object.freeze({
			languageId,
			code,
			isComplete
		});

		try {
			const result = await entry.renderer.shouldRenderCodeBlock(context, token);
			return result?.shouldRender ?? false;
		} catch (e) {
			console.error(`Error in shouldRenderCodeBlock for ${id}:`, e);
			return false;
		}
	}

	async $renderCodeBlock(id: string, languageId: string, code: string, isComplete: boolean, webviewHandle: string, token: CancellationToken): Promise<void> {
		const entry = this._renderers.get(id);
		if (!entry) {
			throw new Error(`No chat code block renderer registered for: ${id}`);
		}

		const context: vscode.ChatCodeBlockContext = Object.freeze({
			languageId,
			code,
			isComplete
		});

		const webview = this.webviews.createNewWebview(webviewHandle, {}, entry.extension);
		return entry.renderer.renderCodeBlock(context, webview, token);
	}
}
