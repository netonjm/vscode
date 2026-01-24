/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { escapeHtml, escapeForJs, createWebviewHtml, getZoomPanScript } from '../utils/webview';

/**
 * Renderer ID for registration.
 */
export const RENDERER_ID = 'vscode.plotlyCodeBlock';

/**
 * Tag to identify Plotly code blocks.
 * The model should prefix code with this tag.
 */
const PLOTLY_TAG = '@plotlyjs';

/**
 * Check if code starts with the Plotly tag.
 */
function hasPlotlyTag(code: string): boolean {
	return code.trim().toLowerCase().startsWith(PLOTLY_TAG);
}

/**
 * Remove the Plotly tag from code and return the clean JavaScript.
 */
function removeTag(code: string): string {
	const trimmed = code.trim();
	// Remove the tag (case insensitive)
	const tagIndex = trimmed.toLowerCase().indexOf(PLOTLY_TAG);
	if (tagIndex === 0) {
		return trimmed.substring(PLOTLY_TAG.length).trim();
	}
	return trimmed;
}

/**
 * Generate webview HTML content for Plotly charts.
 * The jsCode is pure JavaScript that will be executed with Plotly available.
 */
function getWebviewContent(jsCode: string): string {
	const escapedCode = escapeForJs(jsCode);
	const htmlEscapedCode = escapeHtml(jsCode);

	const headerIcon = `<svg viewBox="0 0 24 24" fill="currentColor">
		<path d="M3 3v18h18V3H3zm16 16H5V5h14v14zM7 7h2v10H7V7zm4 4h2v6h-2v-6zm4-2h2v8h-2V9z"/>
	</svg>`;

	const bodyContent = `
		<div id="diagram-container">
			<div class="loading" id="loading">Rendering chart...</div>
			<div id="diagram-wrapper">
				<div id="chart"></div>
			</div>
		</div>
	`;

	// The user's JS code will be executed directly.
	// We provide a 'chart' div and Plotly is pre-loaded.
	const scripts = `
		const userCode = \`${escapedCode}\`;
		const originalCode = \`${htmlEscapedCode}\`;

		function loadPlotly() {
			return new Promise((resolve, reject) => {
				const script = document.createElement('script');
				script.src = 'https://cdn.jsdelivr.net/npm/plotly.js-dist@2.27.0/plotly.min.js';
				script.onload = resolve;
				script.onerror = reject;
				document.head.appendChild(script);
			});
		}

		async function renderChart() {
			const container = document.getElementById('chart');
			const diagramWrapper = document.getElementById('diagram-wrapper');
			const diagramContainer = document.getElementById('diagram-container');
			const loadingEl = document.getElementById('loading');
			const header = document.getElementById('header');
			const headerText = document.getElementById('header-text');

			try {
				await loadPlotly();

				// Execute user's JavaScript code directly
				// The code should use Plotly.newPlot('chart', data, layout) or similar
				eval(userCode);

				if (loadingEl) loadingEl.style.display = 'none';
				container.classList.add('visible');

				// Initialize zoom and pan
				initZoomAndPan(diagramWrapper, diagramContainer);

			} catch (error) {
				header.classList.add('error-header');
				headerText.textContent = 'Plotly Chart (Error)';
				diagramContainer.style.background = 'transparent';
				diagramContainer.style.padding = '0';
				container.innerHTML = \`
					<div class="error-container">
						<div class="error-message">⚠ \${error.message || 'Failed to execute code'}</div>
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
				document.addEventListener('DOMContentLoaded', renderChart);
			} else {
				renderChart();
			}
		});
	`;

	return createWebviewHtml({
		title: 'Plotly Chart',
		headerIcon,
		bodyContent,
		scripts
	});
}

/**
 * Create the Plotly code block renderer.
 */
export function createRenderer(): vscode.ChatCodeBlockRenderer {
	return {
		shouldRenderCodeBlock(codeBlockContext, _token) {
			const code = codeBlockContext.code.trim();
			// Only render if code starts with @plotlyjs tag
			return { shouldRender: hasPlotlyTag(code) };
		},

		async renderCodeBlock(codeBlockContext, webview, _token) {
			// Remove the tag and get clean JavaScript code
			const cleanCode = removeTag(codeBlockContext.code);

			webview.options = {
				enableScripts: true
			};
			webview.html = getWebviewContent(cleanCode);
		}
	};
}
