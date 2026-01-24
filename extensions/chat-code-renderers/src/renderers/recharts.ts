/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { escapeHtml, createWebviewHtml, getZoomPanScript } from '../utils/webview';

/**
 * Renderer ID for registration.
 */
export const RENDERER_ID = 'vscode.rechartsCodeBlock';

/**
 * Tag to identify Recharts code blocks.
 * The model should prefix code with this tag.
 */
const RECHARTS_TAG = '@recharts';

/**
 * Check if code starts with the Recharts tag.
 */
function hasRechartsTag(code: string): boolean {
	return code.trim().toLowerCase().startsWith(RECHARTS_TAG);
}

/**
 * Remove the Recharts tag from code and return the clean JSX/data.
 */
function removeTag(code: string): string {
	const trimmed = code.trim();
	const tagIndex = trimmed.toLowerCase().indexOf(RECHARTS_TAG);
	if (tagIndex === 0) {
		return trimmed.substring(RECHARTS_TAG.length).trim();
	}
	return trimmed;
}

/**
 * Generate webview HTML content for Recharts.
 * Loads React, ReactDOM, Recharts, and Babel to transpile and execute user's JSX code.
 */
function getWebviewContent(userCode: string): string {
	// Use JSON.stringify to safely embed the code as a string
	const jsonCode = JSON.stringify(userCode);
	const htmlEscapedCode = escapeHtml(userCode);

	const headerIcon = `<svg viewBox="0 0 24 24" fill="currentColor">
		<path d="M3.5 18.5l6-6 4 4L22 6.92 20.59 5.5l-7.09 8-4-4-7.5 7.5 1.5 1.5z"/>
	</svg>`;

	const bodyContent = `
		<div id="diagram-container">
			<div class="loading" id="loading">Rendering chart...</div>
			<div id="diagram-wrapper">
				<div id="chart" style="width: 100%; min-height: 300px;"></div>
			</div>
		</div>
	`;

	const scripts = `
		const userCode = ${jsonCode};
		const originalCode = ${JSON.stringify(htmlEscapedCode)};

		function loadScript(src) {
			return new Promise((resolve, reject) => {
				const script = document.createElement('script');
				script.src = src;
				script.crossOrigin = 'anonymous';
				script.onload = resolve;
				script.onerror = reject;
				document.head.appendChild(script);
			});
		}

		async function loadAllScripts() {
			// Load React (required by Recharts) - use specific versions
			await loadScript('https://cdn.jsdelivr.net/npm/react@18.2.0/umd/react.production.min.js');
			// Load ReactDOM
			await loadScript('https://cdn.jsdelivr.net/npm/react-dom@18.2.0/umd/react-dom.production.min.js');
			// Load react-is (REQUIRED by Recharts!)
			await loadScript('https://cdn.jsdelivr.net/npm/react-is@18.2.0/umd/react-is.production.min.js');
			// Load prop-types (REQUIRED by Recharts!)
			await loadScript('https://cdn.jsdelivr.net/npm/prop-types@15.8.1/prop-types.min.js');
			// Load Babel standalone for JSX transpilation
			await loadScript('https://cdn.jsdelivr.net/npm/@babel/standalone@7.23.5/babel.min.js');
			// Load Recharts - use version 2.12.7 which has UMD build
			await loadScript('https://cdn.jsdelivr.net/npm/recharts@2.12.7/umd/Recharts.js');
		}

		async function renderChart() {
			const container = document.getElementById('chart');
			const diagramWrapper = document.getElementById('diagram-wrapper');
			const diagramContainer = document.getElementById('diagram-container');
			const loadingEl = document.getElementById('loading');
			const header = document.getElementById('header');
			const headerText = document.getElementById('header-text');

			try {
				await loadAllScripts();

				// Check if Recharts loaded correctly
				if (typeof Recharts === 'undefined') {
					throw new Error('Recharts library failed to load');
				}

				// Make all Recharts components available globally
				const {
					// Charts
					LineChart, BarChart, AreaChart, PieChart, RadarChart, ScatterChart,
					ComposedChart, RadialBarChart, FunnelChart, Treemap, Sankey, SunburstChart,
					// Cartesian Components
					Line, Bar, Area, Scatter, XAxis, YAxis, ZAxis, CartesianGrid,
					ReferenceLine, ReferenceDot, ReferenceArea, Brush, ErrorBar, Funnel,
					// Polar Components
					Pie, Radar, RadialBar, PolarAngleAxis, PolarGrid, PolarRadiusAxis,
					// General Components
					ResponsiveContainer, Legend, Tooltip, Cell, LabelList, Label, Text,
					// Shapes
					Rectangle, Sector, Curve, Cross, Symbols
				} = Recharts;

				// Expose to global scope for user code
				Object.assign(window, {
					// Charts
					LineChart, BarChart, AreaChart, PieChart, RadarChart, ScatterChart,
					ComposedChart, RadialBarChart, FunnelChart, Treemap, Sankey, SunburstChart,
					// Cartesian Components
					Line, Bar, Area, Scatter, XAxis, YAxis, ZAxis, CartesianGrid,
					ReferenceLine, ReferenceDot, ReferenceArea, Brush, ErrorBar, Funnel,
					// Polar Components
					Pie, Radar, RadialBar, PolarAngleAxis, PolarGrid, PolarRadiusAxis,
					// General Components
					ResponsiveContainer, Legend, Tooltip, Cell, LabelList, Label, Text,
					// Shapes
					Rectangle, Sector, Curve, Cross, Symbols
				});

				// User code is used directly - we capture the 'chart' variable in wrapped code
				let processedCode = userCode;

				// User code - we'll capture 'chart' variable and assign to __chartResult
				// Build the wrapped code as a concatenation to avoid template literal issues
				const wrappedCode = 
					'// Ensure React is globally available for JSX transpiled code\\n' +
					'const React = window.React;\\n' +
					'\\n' +
					'// Execute user code and capture result\\n' +
					'let __chartResult;\\n' +
					'{\\n' +
					processedCode + '\\n' +
					'\\n' +
					'// Capture the chart variable if it was defined\\n' +
					'if (typeof chart !== \\'undefined\\') {\\n' +
					'  __chartResult = chart;\\n' +
					'}\\n' +
					'}\\n' +
					'\\n' +
					'// Render the chart\\n' +
					'if (__chartResult && React.isValidElement(__chartResult)) {\\n' +
					'  const chartEl = document.getElementById(\\'chart\\');\\n' +
					'  const root = ReactDOM.createRoot(chartEl);\\n' +
					'  root.render(__chartResult);\\n' +
					'} else {\\n' +
					'  throw new Error(\\'No valid React element found. Make sure to define a chart variable with your JSX.\\');\\n' +
					'}';

				// Transpile JSX to JavaScript using Babel with classic runtime
				const transpiledCode = Babel.transform(wrappedCode, {
					presets: [
						['react', { runtime: 'classic' }]
					],
					plugins: []
				}).code;

				// Execute the transpiled code
				eval(transpiledCode);

				// Wait for React to render
				await new Promise(resolve => setTimeout(resolve, 100));

				if (loadingEl) loadingEl.style.display = 'none';
				container.classList.add('visible');

				// Initialize zoom and pan
				initZoomAndPan(diagramWrapper, diagramContainer);

			} catch (error) {
				header.classList.add('error-header');
				headerText.textContent = 'Recharts (Error)';
				diagramContainer.style.background = 'transparent';
				diagramContainer.style.padding = '0';
				const errorMsg = error.message || 'Failed to render chart';
				container.innerHTML = 
					'<div class="error-container">' +
					'<div class="error-message">⚠ ' + errorMsg + '</div>' +
					'<pre class="fallback-code">' + originalCode + '</pre>' +
					'</div>';
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
		title: 'Recharts',
		headerIcon,
		bodyContent,
		scripts
	});
}

/**
 * Create the Recharts code block renderer.
 */
export function createRenderer(): vscode.ChatCodeBlockRenderer {
	return {
		shouldRenderCodeBlock(codeBlockContext, _token) {
			const code = codeBlockContext.code.trim();
			// Only render if code starts with @recharts tag
			return { shouldRender: hasRechartsTag(code) };
		},

		async renderCodeBlock(codeBlockContext, webview, _token) {
			// Remove the tag and get clean code
			const cleanCode = removeTag(codeBlockContext.code);

			webview.options = {
				enableScripts: true
			};
			webview.html = getWebviewContent(cleanCode);
		}
	};
}
