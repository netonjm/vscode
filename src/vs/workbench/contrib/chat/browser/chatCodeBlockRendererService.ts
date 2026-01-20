/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow } from '../../../../base/browser/dom.js';
import { raceCancellationError } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IJSONSchema, TypeFromJsonSchema } from '../../../../base/common/jsonSchema.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import * as nls from '../../../../nls.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IWebview, IWebviewService, WebviewContentPurpose } from '../../../contrib/webview/browser/webview.js';
import { IExtensionService, isProposedApiEnabled } from '../../../services/extensions/common/extensions.js';
import { ExtensionsRegistry, IExtensionPointUser } from '../../../services/extensions/common/extensionsRegistry.js';

/**
 * Context for a code block being rendered.
 */
export interface IChatCodeBlockContext {
	readonly languageId: string;
	readonly code: string;
	readonly isComplete: boolean;
}

/**
 * Interface for a code block renderer provided by an extension.
 */
export interface IChatCodeBlockItemRenderer {
	/**
	 * Check if this renderer should handle the given code block.
	 */
	shouldRenderCodeBlock(context: IChatCodeBlockContext, token: CancellationToken): Promise<boolean>;

	/**
	 * Render the code block into the provided webview.
	 */
	renderCodeBlock(context: IChatCodeBlockContext, webview: IWebview, token: CancellationToken): Promise<void>;
}

interface RegisterOptions {
	readonly extension?: {
		readonly id: ExtensionIdentifier;
		readonly location: URI;
	};
}

export const IChatCodeBlockRendererService = createDecorator<IChatCodeBlockRendererService>('chatCodeBlockRendererService');

export interface IChatCodeBlockRendererService {
	readonly _serviceBrand: undefined;

	/**
	 * Register a code block renderer.
	 */
	registerRenderer(id: string, renderer: IChatCodeBlockItemRenderer, options: RegisterOptions): IDisposable;

	/**
	 * Check if any renderer wants to handle the given code block.
	 * Returns the renderer ID if found, undefined otherwise.
	 */
	findRenderer(context: IChatCodeBlockContext, token: CancellationToken): Promise<string | undefined>;

	/**
	 * Render a code block using a registered renderer.
	 */
	renderCodeBlock(rendererId: string, context: IChatCodeBlockContext, parent: HTMLElement, token: CancellationToken): Promise<RenderedCodeBlockPart>;

	/**
	 * Find all renderers that can handle the given code block.
	 * Returns an array of renderer IDs.
	 */
	findAllRenderers(context: IChatCodeBlockContext, token: CancellationToken): Promise<string[]>;

	/**
	 * Get the display name for a renderer.
	 */
	getRendererDisplayName(rendererId: string): string | undefined;
}

export interface RenderedCodeBlockPart extends IDisposable {
	readonly onDidChangeHeight: Event<number>;
	readonly webview: IWebview;
	reinitialize(): void;
}

interface RendererEntry {
	readonly renderer: IChatCodeBlockItemRenderer;
	readonly options: RegisterOptions;
	readonly languageIds: readonly string[];
}

export class ChatCodeBlockRendererService extends Disposable implements IChatCodeBlockRendererService {
	_serviceBrand: undefined;

	private readonly _contributions = new Map</*id*/ string, {
		readonly languageIds: readonly string[];
		readonly displayName: string;
	}>();

	private readonly _renderers = new Map</*id*/ string, RendererEntry>();

	constructor(
		@IWebviewService private readonly _webviewService: IWebviewService,
		@IExtensionService private readonly _extensionService: IExtensionService,
	) {
		super();

		this._register(chatCodeBlockRendererContributionPoint.setHandler(extensions => {
			this.updateContributions(extensions);
		}));
	}

	registerRenderer(id: string, renderer: IChatCodeBlockItemRenderer, options: RegisterOptions): IDisposable {
		const contribution = this._contributions.get(id);
		this._renderers.set(id, {
			renderer,
			options,
			languageIds: contribution?.languageIds ?? []
		});
		return {
			dispose: () => {
				this._renderers.delete(id);
			}
		};
	}

	getRendererDisplayName(rendererId: string): string | undefined {
		const contribution = this._contributions.get(rendererId);
		return contribution?.displayName;
	}

	async findRenderer(context: IChatCodeBlockContext, token: CancellationToken): Promise<string | undefined> {
		await raceCancellationError(this._extensionService.whenInstalledExtensionsRegistered(), token);

		// First, try to find by language ID
		for (const [id, contribution] of this._contributions) {
			if (contribution.languageIds.length > 0 && !contribution.languageIds.includes(context.languageId)) {
				continue;
			}

			// Activate the extension
			await raceCancellationError(this._extensionService.activateByEvent(`onChatCodeBlockRenderer:${id}`), token);

			const entry = this._renderers.get(id);
			if (entry) {
				try {
					const shouldRender = await entry.renderer.shouldRenderCodeBlock(context, token);
					if (shouldRender) {
						return id;
					}
				} catch (e) {
					// Continue to next renderer
					console.error(`Error checking renderer ${id}:`, e);
				}
			}
		}

		return undefined;
	}

	async findAllRenderers(context: IChatCodeBlockContext, token: CancellationToken): Promise<string[]> {
		await raceCancellationError(this._extensionService.whenInstalledExtensionsRegistered(), token);

		const rendererIds: string[] = [];

		for (const [id, contribution] of this._contributions) {
			if (contribution.languageIds.length > 0 && !contribution.languageIds.includes(context.languageId)) {
				continue;
			}

			// Activate the extension
			try {
				await raceCancellationError(this._extensionService.activateByEvent(`onChatCodeBlockRenderer:${id}`), token);

				const entry = this._renderers.get(id);
				if (entry) {
					const shouldRender = await entry.renderer.shouldRenderCodeBlock(context, token);
					if (shouldRender) {
						rendererIds.push(id);
					}
				}
			} catch (e) {
				// Continue to next renderer
				console.error(`Error checking renderer ${id}:`, e);
			}
		}

		return rendererIds;
	}

	async renderCodeBlock(rendererId: string, context: IChatCodeBlockContext, parent: HTMLElement, token: CancellationToken): Promise<RenderedCodeBlockPart> {
		const entry = this._renderers.get(rendererId);
		if (!entry) {
			throw new Error(`Renderer not found: ${rendererId}`);
		}

		if (token.isCancellationRequested) {
			throw new CancellationError();
		}

		const store = new DisposableStore();

		const webview = store.add(this._webviewService.createWebviewElement({
			title: '',
			origin: generateUuid(),
			options: {
				enableFindWidget: false,
				purpose: WebviewContentPurpose.ChatOutputItem,
				tryRestoreScrollPosition: false,
			},
			contentOptions: {},
			extension: entry.options.extension,
		}));

		const onDidChangeHeight = store.add(new Emitter<number>());
		store.add(autorun(reader => {
			const height = reader.readObservable(webview.intrinsicContentSize);
			if (height) {
				onDidChangeHeight.fire(height.height);
				parent.style.height = `${height.height}px`;
			}
		}));

		webview.mountTo(parent, getWindow(parent));
		await entry.renderer.renderCodeBlock(context, webview, token);

		return {
			get webview() { return webview; },
			onDidChangeHeight: onDidChangeHeight.event,
			dispose: () => {
				store.dispose();
			},
			reinitialize: () => {
				webview.reinitializeAfterDismount();
			},
		};
	}

	private updateContributions(extensions: readonly IExtensionPointUser<readonly IChatCodeBlockRendererContribution[]>[]) {
		this._contributions.clear();
		for (const extension of extensions) {
			if (!isProposedApiEnabled(extension.description, 'chatCodeBlockRenderer')) {
				continue;
			}

			for (const contribution of extension.value) {
				if (this._contributions.has(contribution.id)) {
					extension.collector.error(`Chat code block renderer with id '${contribution.id}' already registered`);
					continue;
				}

				this._contributions.set(contribution.id, {
					languageIds: contribution.languageIds ?? [],
					displayName: contribution.displayName,
				});
			}
		}
	}
}

const chatCodeBlockRendererContributionSchema = {
	type: 'object',
	additionalProperties: false,
	required: ['id', 'displayName'],
	properties: {
		id: {
			type: 'string',
			description: nls.localize('chatCodeBlockRenderer.id', 'Unique identifier for the renderer.'),
		},
		displayName: {
			type: 'string',
			description: nls.localize('chatCodeBlockRenderer.displayName', 'Display name for the renderer.'),
		},
		languageIds: {
			type: 'array',
			description: nls.localize('chatCodeBlockRenderer.languageIds', 'Language IDs that this renderer can handle. If not specified, the renderer will be queried for all code blocks.'),
			items: {
				type: 'string'
			}
		}
	}
} as const satisfies IJSONSchema;

type IChatCodeBlockRendererContribution = TypeFromJsonSchema<typeof chatCodeBlockRendererContributionSchema>;

const chatCodeBlockRendererContributionPoint = ExtensionsRegistry.registerExtensionPoint<IChatCodeBlockRendererContribution[]>({
	extensionPoint: 'chatCodeBlockRenderer',
	activationEventsGenerator: function* (contributions) {
		for (const contrib of contributions) {
			yield `onChatCodeBlockRenderer:${contrib.id}`;
		}
	},
	jsonSchema: {
		description: nls.localize('vscode.extension.contributes.chatCodeBlockRenderer', 'Contributes a custom renderer for code blocks in chat responses'),
		type: 'array',
		items: chatCodeBlockRendererContributionSchema,
	}
});
