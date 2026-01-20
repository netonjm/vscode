/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	/**
	 * Context information about a code block being rendered in chat.
	 */
	export interface ChatCodeBlockContext {
		/**
		 * The language identifier of the code block (e.g., 'javascript', 'mermaid', 'python').
		 */
		readonly languageId: string;

		/**
		 * The text content of the code block.
		 */
		readonly code: string;

		/**
		 * Whether the code block is complete (all content has been streamed).
		 */
		readonly isComplete: boolean;
	}

	/**
	 * Result from checking if a code block should be rendered by a custom renderer.
	 */
	export interface ChatCodeBlockRenderCheck {
		/**
		 * Whether this renderer wants to handle rendering of this code block.
		 * If true, {@link ChatCodeBlockRenderer.renderCodeBlock} will be called.
		 */
		readonly shouldRender: boolean;
	}

	/**
	 * A renderer for code blocks in chat responses.
	 *
	 * This allows extensions to provide custom rendering for specific types of code blocks,
	 * such as rendering Mermaid diagrams, PlantUML, or other visual representations.
	 */
	export interface ChatCodeBlockRenderer {
		/**
		 * Check if this renderer should handle the given code block.
		 *
		 * This method is called for each code block in a chat response. If it returns
		 * `{ shouldRender: true }`, the {@link renderCodeBlock} method will be called
		 * to render the code block.
		 *
		 * @param context Information about the code block.
		 * @param token A cancellation token.
		 * @returns Whether this renderer should handle rendering the code block.
		 */
		shouldRenderCodeBlock(context: ChatCodeBlockContext, token: CancellationToken): ProviderResult<ChatCodeBlockRenderCheck>;

		/**
		 * Render the code block into the provided webview.
		 *
		 * @param context Information about the code block to render.
		 * @param webview The webview to render the code block into.
		 * @param token A cancellation token.
		 * @returns A promise that resolves when the webview has been initialized.
		 */
		renderCodeBlock(context: ChatCodeBlockContext, webview: Webview, token: CancellationToken): Thenable<void>;
	}

	export namespace chat {
		/**
		 * Registers a custom renderer for code blocks in chat responses.
		 *
		 * When a code block is about to be rendered in a chat response, registered renderers
		 * are queried via {@link ChatCodeBlockRenderer.shouldRenderCodeBlock}. The first renderer
		 * that returns `{ shouldRender: true }` will be used to render the code block.
		 *
		 * Note: To use this API, you should also add a contribution point in your extension's
		 * package.json:
		 *
		 * ```json
		 * "contributes": {
		 *   "chatCodeBlockRenderer": [
		 *     {
		 *       "id": "myExt.mermaidRenderer",
		 *       "displayName": "Mermaid Diagram Renderer",
		 *       "languageIds": ["mermaid"]
		 *     }
		 *   ]
		 * }
		 * ```
		 *
		 * @param id Unique identifier for the renderer. This should match the `id` in your contribution point.
		 * @param renderer The renderer to register.
		 * @returns A disposable that unregisters the renderer when disposed.
		 */
		export function registerChatCodeBlockRenderer(id: string, renderer: ChatCodeBlockRenderer): Disposable;
	}
}
