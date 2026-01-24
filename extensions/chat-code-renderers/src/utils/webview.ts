/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Escape text for safe HTML embedding.
 */
export function escapeHtml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

/**
 * Escape code for safe embedding in JavaScript template literals.
 * Handles backslashes, backticks, and template literal expressions.
 */
export function escapeForJs(code: string): string {
	return code
		.replace(/\\/g, '\\\\')        // Escape backslashes first
		.replace(/`/g, '\\`')          // Escape backticks
		.replace(/\$\{/g, '\\${');     // Escape template literal expressions
}

/**
 * Base webview HTML template with common styles.
 */
export function createWebviewHtml(options: {
	title: string;
	headerIcon: string;
	bodyContent: string;
	scripts: string;
	additionalStyles?: string;
}): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${options.title}</title>
	<style>
		* { margin: 0; padding: 0; box-sizing: border-box; }
		html, body {
			background: var(--vscode-editor-background, #1e1e1e);
			min-height: 200px;
			overflow: hidden;
		}
		body {
			padding: 16px;
			font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
		}
		#diagram-container {
			background: #ffffff;
			border-radius: 8px;
			padding: 20px;
			display: flex;
			justify-content: center;
			align-items: center;
			min-height: 150px;
			overflow: auto;
			position: relative;
			cursor: grab;
		}
		#diagram-container.panning { cursor: grabbing; }
		#diagram-wrapper {
			display: inline-block;
			transform-origin: center center;
			transition: transform 0.1s ease-out;
		}
		#diagram {
			max-width: 100%;
			opacity: 0;
			transition: opacity 0.2s ease-in;
			user-select: none;
		}
		#diagram.visible { opacity: 1; }
		.loading {
			color: #666;
			font-size: 14px;
			display: flex;
			align-items: center;
			gap: 8px;
			position: absolute;
		}
		.loading::before {
			content: '';
			width: 16px;
			height: 16px;
			border: 2px solid #ddd;
			border-top-color: #3c8dbc;
			border-radius: 50%;
			animation: spin 1s linear infinite;
		}
		@keyframes spin { to { transform: rotate(360deg); } }
		.error-container { width: 100%; }
		.error-message {
			color: #c00;
			background: #fee;
			padding: 8px 12px;
			border-radius: 4px 4px 0 0;
			font-size: 12px;
			border-bottom: 1px solid #fcc;
		}
		.fallback-code {
			background: #2d2d2d;
			color: #d4d4d4;
			padding: 12px;
			border-radius: 0 0 4px 4px;
			font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
			font-size: 13px;
			white-space: pre-wrap;
			overflow-x: auto;
			line-height: 1.4;
		}
		.header {
			color: var(--vscode-foreground, #cccccc);
			font-size: 12px;
			margin-bottom: 8px;
			display: flex;
			align-items: center;
			gap: 6px;
		}
		.header svg { width: 16px; height: 16px; }
		.header.error-header { color: #c00; }
		${options.additionalStyles || ''}
	</style>
</head>
<body>
	<div class="header" id="header">
		${options.headerIcon}
		<span id="header-text">${options.title}</span>
	</div>
	${options.bodyContent}
	<script>
		${options.scripts}
	</script>
</body>
</html>`;
}

/**
 * Common zoom and pan functionality for diagrams.
 */
export function getZoomPanScript(): string {
	return `
		function initZoomAndPan(wrapper, container) {
			let scale = 1, isPanning = false, startX = 0, startY = 0, translateX = 0, translateY = 0;

			container.addEventListener('wheel', (e) => {
				e.preventDefault();
				const delta = e.deltaY;
				const newScale = delta > 0 ? scale * 0.9 : scale * 1.1;
				scale = Math.min(Math.max(0.5, newScale), 3);
				updateTransform();
			}, { passive: false });

			container.addEventListener('mousedown', (e) => {
				isPanning = true;
				startX = e.clientX - translateX;
				startY = e.clientY - translateY;
				container.classList.add('panning');
			});

			container.addEventListener('mousemove', (e) => {
				if (!isPanning) return;
				translateX = e.clientX - startX;
				translateY = e.clientY - startY;
				updateTransform();
			});

			container.addEventListener('mouseup', () => {
				isPanning = false;
				container.classList.remove('panning');
			});

			container.addEventListener('mouseleave', () => {
				isPanning = false;
				container.classList.remove('panning');
			});

			container.addEventListener('dblclick', () => {
				scale = 1;
				translateX = 0;
				translateY = 0;
				updateTransform();
			});

			function updateTransform() {
				wrapper.style.transform = \`translate(\${translateX}px, \${translateY}px) scale(\${scale})\`;
			}
		}
	`;
}
