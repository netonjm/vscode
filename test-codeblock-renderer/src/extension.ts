import * as vscode from 'vscode';

// Patterns to detect different Mermaid diagram types
// These patterns are more permissive to match variations
const mermaidPatterns = [
	/^flowchart(\s+(TB|TD|BT|RL|LR))?/i,      // flowchart TD, flowchart LR, etc.
	/^graph(\s+(TB|TD|BT|RL|LR))?/i,          // graph TD, graph LR, etc.
	/^sequenceDiagram/i,                       // sequenceDiagram
	/^classDiagram/i,                          // classDiagram
	/^stateDiagram(-v2)?/i,                    // stateDiagram, stateDiagram-v2
	/^erDiagram/i,                             // erDiagram (Entity Relationship)
	/^gantt/i,                                 // gantt
	/^pie(\s+showData)?/i,                     // pie, pie showData
	/^mindmap/i,                               // mindmap
	/^timeline/i,                              // timeline
	/^journey/i,                               // journey (User Journey)
	/^gitGraph/i,                              // gitGraph
	/^C4Context/i,                             // C4 diagrams
	/^C4Container/i,
	/^C4Component/i,
	/^C4Dynamic/i,
	/^C4Deployment/i,
	/^requirementDiagram/i,                    // requirementDiagram
	/^quadrantChart/i,                         // quadrantChart
	/^sankey-beta/i,                           // sankey diagram
	/^xychart-beta/i,                          // XY chart
	/^block-beta/i,                            // block diagram
];

/**
 * Check if the first line matches any known Mermaid diagram type
 */
function isMermaidDiagram(firstLine: string): boolean {
	const trimmed = firstLine.trim();
	return mermaidPatterns.some(pattern => pattern.test(trimmed));
}

/**
 * Basic validation of the mermaid code structure
 * Returns true if the code looks valid enough to attempt rendering
 */
function validateMermaidStructure(code: string): boolean {
	const lines = code.trim().split('\n').filter(l => l.trim().length > 0);

	// Must have at least 2 lines (diagram type + content)
	if (lines.length < 2) {
		return false;
	}

	// First line must be a valid diagram type
	if (!isMermaidDiagram(lines[0])) {
		return false;
	}

	// Check for some minimal content after the first line
	const contentLines = lines.slice(1).filter(l => !l.trim().startsWith('%%')); // Exclude comments
	if (contentLines.length === 0) {
		return false;
	}

	return true;
}

export function activate(context: vscode.ExtensionContext) {
	console.log('Mermaid Code Block Renderer extension activated!');

	// Register the mermaid code block renderer
	const renderer: vscode.ChatCodeBlockRenderer = {
		shouldRenderCodeBlock(codeBlockContext, token) {
			const code = codeBlockContext.code.trim();
			const languageId = codeBlockContext.languageId.toLowerCase();

			console.log('shouldRenderCodeBlock called:', languageId, code.substring(0, 50));

			// Case 1: Language is explicitly mermaid
			if (languageId === 'mermaid') {
				// Still validate structure to avoid rendering garbage
				const isValid = validateMermaidStructure(code);
				console.log('Language is mermaid, structure valid:', isValid);
				return { shouldRender: isValid };
			}

			// Case 2: Check if content looks like Mermaid (for untagged code blocks)
			const firstLine = code.split('\n')[0].trim();
			if (isMermaidDiagram(firstLine)) {
				const isValid = validateMermaidStructure(code);
				console.log('Detected Mermaid pattern, structure valid:', isValid);
				return { shouldRender: isValid };
			}

			console.log('Not a Mermaid diagram');
			return { shouldRender: false };
		},

		async renderCodeBlock(codeBlockContext, webview, token) {
			console.log('renderCodeBlock called - rendering Mermaid diagram');

			webview.options = {
				enableScripts: true
			};

			webview.html = getMermaidWebviewContent(codeBlockContext.code, codeBlockContext.isComplete);
		}
	};

	const disposable = vscode.chat.registerChatCodeBlockRenderer('testRenderer.mermaid', renderer);
	context.subscriptions.push(disposable);

	console.log('Mermaid renderer registered!');
}

function getMermaidWebviewContent(mermaidCode: string, isComplete: boolean): string {
	// Escape the mermaid code for safe embedding in JavaScript
	const escapedCode = mermaidCode
		.replace(/\\/g, '\\\\')
		.replace(/`/g, '\\`')
		.replace(/\$/g, '\\$');

	// Also escape for HTML display in fallback
	const htmlEscapedCode = mermaidCode
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Mermaid Diagram</title>
	<style>
		* {
			margin: 0;
			padding: 0;
			box-sizing: border-box;
		}
		html, body {
			background: var(--vscode-editor-background, #1e1e1e);
			/* Fixed initial height to prevent scroll jumps during load */
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
		#diagram-container.panning {
			cursor: grabbing;
		}
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
		#diagram.visible {
			opacity: 1;
		}
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
		@keyframes spin {
			to { transform: rotate(360deg); }
		}
		.error-container {
			width: 100%;
		}
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
		.header svg {
			width: 16px;
			height: 16px;
		}
		.header.error-header {
			color: #c00;
		}
	</style>
</head>
<body>
	<div class="header" id="header">
		<svg viewBox="0 0 24 24" fill="currentColor">
			<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
		</svg>
		<span id="header-text">Mermaid Diagram</span>
	</div>
	<div id="diagram-container">
		<div class="loading" id="loading">Rendering diagram...</div>
		<div id="diagram-wrapper">
			<div id="diagram"></div>
		</div>
	</div>
	<script>
		const mermaidCode = \`${escapedCode}\`;
		const originalCode = \`${htmlEscapedCode}\`;
		let mermaidLoaded = false;
		let heightReported = false;

		// Load mermaid.js dynamically to control timing
		function loadMermaid() {
			return new Promise((resolve, reject) => {
				const script = document.createElement('script');
				script.src = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js';
				script.onload = () => {
					mermaidLoaded = true;
					resolve();
				};
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
				// Load mermaid first
				await loadMermaid();

				mermaid.initialize({
					startOnLoad: false,
					theme: 'default',
					securityLevel: 'loose',
					flowchart: {
						useMaxWidth: true,
						htmlLabels: true,
						curve: 'basis'
					}
				});

				const { svg } = await mermaid.render('mermaid-svg', mermaidCode);
				container.innerHTML = svg;

				// Hide loading and show diagram with fade-in
				if (loadingEl) loadingEl.style.display = 'none';
				container.classList.add('visible');

				// Initialize zoom and pan controls
				initZoomAndPan(diagramWrapper, diagramContainer);

			} catch (error) {
				// Show fallback with error message and original code
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

		// Zoom and Pan functionality
		function initZoomAndPan(wrapper, container) {
			let scale = 1;
			let isPanning = false;
			let startX = 0;
			let startY = 0;
			let translateX = 0;
			let translateY = 0;

			// Zoom with mouse wheel or trackpad pinch
			container.addEventListener('wheel', (e) => {
				e.preventDefault();
				
				const delta = e.deltaY;
				const zoomIntensity = 0.1;
				
				// Calculate new scale
				const newScale = delta > 0 
					? scale * (1 - zoomIntensity) 
					: scale * (1 + zoomIntensity);
				
				// Limit zoom range
				scale = Math.min(Math.max(0.5, newScale), 3);
				
				updateTransform();
			}, { passive: false });

			// Pan with mouse drag
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

			// Double-click to reset zoom
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

		// Render when ready - use requestAnimationFrame to batch initial render
		requestAnimationFrame(() => {
			if (document.readyState === 'loading') {
				document.addEventListener('DOMContentLoaded', renderDiagram);
			} else {
				renderDiagram();
			}
		});
	</script>
</body>
</html>`;
}

export function deactivate() {
	console.log('Mermaid Code Block Renderer extension deactivated');
}
