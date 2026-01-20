/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from '../../../base/common/lifecycle.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { ExtensionIdentifier } from '../../../platform/extensions/common/extensions.js';
import { IChatCodeBlockRendererService } from '../../contrib/chat/browser/chatCodeBlockRendererService.js';
import { IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostChatCodeBlockRendererShape, ExtHostContext, MainThreadChatCodeBlockRendererShape } from '../common/extHost.protocol.js';
import { MainThreadWebviews } from './mainThreadWebviews.js';

export class MainThreadChatCodeBlockRenderer extends Disposable implements MainThreadChatCodeBlockRendererShape {

	private readonly _proxy: ExtHostChatCodeBlockRendererShape;

	private _webviewHandlePool = 0;

	private readonly registeredRenderers = new Map</* id */ string, IDisposable>();

	constructor(
		extHostContext: IExtHostContext,
		private readonly _mainThreadWebview: MainThreadWebviews,
		@IChatCodeBlockRendererService private readonly _rendererService: IChatCodeBlockRendererService,
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostChatCodeBlockRenderer);
	}

	override dispose(): void {
		super.dispose();

		this.registeredRenderers.forEach(disposable => disposable.dispose());
		this.registeredRenderers.clear();
	}

	$registerChatCodeBlockRenderer(id: string, extensionId: ExtensionIdentifier, extensionLocation: UriComponents): void {
		const disposable = this._rendererService.registerRenderer(id, {
			shouldRenderCodeBlock: async (context, token) => {
				return this._proxy.$shouldRenderCodeBlock(id, context.languageId, context.code, context.isComplete, token);
			},
			renderCodeBlock: async (context, webview, token) => {
				const webviewHandle = `chat-codeblock-${++this._webviewHandlePool}`;

				this._mainThreadWebview.addWebview(webviewHandle, webview, {
					serializeBuffersForPostMessage: true,
				});

				return this._proxy.$renderCodeBlock(id, context.languageId, context.code, context.isComplete, webviewHandle, token);
			},
		}, {
			extension: { id: extensionId, location: URI.revive(extensionLocation) }
		});

		this.registeredRenderers.set(id, disposable);
	}

	$unregisterChatCodeBlockRenderer(id: string): void {
		this.registeredRenderers.get(id)?.dispose();
		this.registeredRenderers.delete(id);
	}
}
