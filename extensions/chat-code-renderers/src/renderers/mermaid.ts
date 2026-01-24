/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { escapeHtml, escapeForJs, createWebviewHtml, getZoomPanScript } from '../utils/webview';

/**
 * Renderer ID for registration.
 */
export const RENDERER_ID = 'vscode.mermaidCodeBlock';

/**
 * Patterns to detect different Mermaid diagram types.
 */
const mermaidPatterns = [
	/^flowchart(\s+(TB|TD|BT|RL|LR))?/i,
	/^graph(\s+(TB|TD|BT|RL|LR))?/i,
	/^sequenceDiagram/i,
	/^classDiagram/i,
	/^stateDiagram(-v2)?/i,
	/^erDiagram/i,
	/^gantt/i,
	/^pie(\s+showData)?/i,
	/^mindmap/i,
	/^timeline/i,
	/^journey/i,
	/^gitGraph/i,
	/^C4Context/i,
	/^C4Container/i,
	/^C4Component/i,
	/^C4Dynamic/i,
	/^C4Deployment/i,
	/^requirementDiagram/i,
	/^quadrantChart/i,
	/^sankey-beta/i,
	/^xychart-beta/i,
	/^block-beta/i,
];

/**
 * Check if the first line matches any known Mermaid diagram type.
 */
function isMermaidDiagram(firstLine: string): boolean {
	const trimmed = firstLine.trim();
	return mermaidPatterns.some(pattern => pattern.test(trimmed));
}

/**
 * Basic validation of the mermaid code structure.
 */
function validateMermaidStructure(code: string): boolean {
	const lines = code.trim().split('\n').filter(l => l.trim().length > 0);
	if (lines.length < 2) {
		return false;
	}
	if (!isMermaidDiagram(lines[0])) {
		return false;
	}
	const contentLines = lines.slice(1).filter(l => !l.trim().startsWith('%%'));
	return contentLines.length > 0;
}

/**
 * Generate webview HTML content for Mermaid diagrams.
 */
function getWebviewContent(mermaidCode: string): string {
	const escapedCode = escapeForJs(mermaidCode);
	const htmlEscapedCode = escapeHtml(mermaidCode);

	const headerIcon = `<svg viewBox="0 0 24 24" fill="currentColor">
		<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
	</svg>`;

	const bodyContent = `
		<div id="diagram-container">
			<div class="loading" id="loading">Rendering diagram...</div>
			<div id="diagram-wrapper">
				<div id="diagram"></div>
			</div>
		</div>
	`;

	const scripts = `
		const mermaidCode = \`${escapedCode}\`;
		const originalCode = \`${htmlEscapedCode}\`;

		function loadMermaid() {
			return new Promise((resolve, reject) => {
				const script = document.createElement('script');
				script.src = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js';
				script.onload = resolve;
				script.onerror = reject;
				document.head.appendChild(script);
			});
		}

		async function renderDiagram() {
			const container = document.getElementById('diagram');
			const diagramWrapper = document.getElementById('diagram-wrapper');
			const diagramContainer = document.getElementById('diagram-container');
			const loadingEl = document.getElementById('loading');
			const header = document.getElementById('header');
			const headerText = document.getElementById('header-text');

			try {
				await loadMermaid();
				mermaid.initialize({
					startOnLoad: false,
					theme: 'default',
					securityLevel: 'loose',
					flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis' }
				});

				const { svg } = await mermaid.render('mermaid-svg', mermaidCode);
				container.innerHTML = svg;
				if (loadingEl) loadingEl.style.display = 'none';
				container.classList.add('visible');
				initZoomAndPan(diagramWrapper, diagramContainer);
			} catch (error) {
				header.classList.add('error-header');
				headerText.textContent = 'Mermaid Diagram (Parse Error)';
				diagramContainer.style.background = 'transparent';
				diagramContainer.style.padding = '0';
				container.innerHTML = \`
					<div class="error-container">
						<div class="error-message">⚠ \${error.message || 'Failed to parse diagram'}</div>
						<pre class="fallback-code">\${originalCode}</pre>
					</div>
				\`;
				if (loadingEl) loadingEl.style.display = 'none';
				container.classList.add('visible');
			}
		}

		${getZoomPanScript()}

		requestAnimationFrame(() => {
			if (document.readyState === 'loading') {
				document.addEventListener('DOMContentLoaded', renderDiagram);
			} else {
				renderDiagram();
			}
		});
	`;

	return createWebviewHtml({
		title: 'Mermaid Diagram',
		headerIcon,
		bodyContent,
		scripts
	});
}

/**
 * Create the Mermaid code block renderer.
 */
export function createRenderer(): vscode.ChatCodeBlockRenderer {
	return {
		shouldRenderCodeBlock(codeBlockContext, _token) {
			const code = codeBlockContext.code.trim();
			const languageId = codeBlockContext.languageId.toLowerCase();

			// Case 1: Language is explicitly mermaid
			if (languageId === 'mermaid') {
				return { shouldRender: validateMermaidStructure(code) };
			}

			// Case 2: Check if content looks like Mermaid (for untagged code blocks)
			const firstLine = code.split('\n')[0].trim();
			if (isMermaidDiagram(firstLine)) {
				return { shouldRender: validateMermaidStructure(code) };
			}

			return { shouldRender: false };
		},

		async renderCodeBlock(codeBlockContext, webview, _token) {
			webview.options = {
				enableScripts: true
			};
			webview.html = getWebviewContent(codeBlockContext.code);
		}
	};
}
