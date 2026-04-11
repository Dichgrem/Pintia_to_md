// ==UserScript==
// @name         PTA / Pintia 题目导出工具
// @namespace    https://github.com/Dichgrem/Pintia_to_md
// @version      1.0.5
// @description  从 Pintia 平台导出题目集为 Markdown 文件
// @author       dich
// @match        https://pintia.cn/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_notification
// @grant        GM_setClipboard
// @grant        GM_registerMenuCommand
// @grant        GM_cookie
// @connect      pintia.cn
// @run-at       document-idle
// @homepageURL  https://github.com/yourname/Pintia_to_md
// @supportURL   https://github.com/yourname/Pintia_to_md/issues
// ==/UserScript==

(() => {
	// ==================== Types ====================
	/**
	 * @typedef {Object} ProblemSet
	 * @property {string} id
	 * @property {string} name
	 */

	/**
	 * @typedef {Object} Exam
	 * @property {string} id
	 */

	/**
	 * @typedef {Object} ExamProblem
	 * @property {string} id
	 * @property {string} label
	 * @property {string} title
	 * @property {string} content
	 * @property {string} type
	 */

	// ==================== PintiaAPI Class ====================
	class PintiaAPI {
		/**
		 * @param {string} sessionId
		 */
		constructor(sessionId) {
			this.sessionId = sessionId;
		}

		/**
		 * Make API request using GM_xmlhttpRequest
		 * @param {string} path
		 * @param {Object} options
		 * @returns {Promise<Object>}
		 */
		request(path, options = {}) {
			const { method = "GET", params, body } = options;

			const url = new URL("https://pintia.cn/api" + path);
			if (params) {
				Object.entries(params).forEach(([key, value]) => {
					url.searchParams.append(key, String(value));
				});
			}

			const headers = {
				Accept: "application/json;charset=UTF-8",
				Cookie: `PTASession=${this.sessionId}`,
			};

			if (body && method === "POST") {
				headers["Content-Type"] = "application/json";
			}

			return new Promise((resolve, reject) => {
				GM_xmlhttpRequest({
					method,
					url: url.toString(),
					headers,
					data: body,
					responseType: "json",
					onload: (response) => {
						if (response.status >= 200 && response.status < 300) {
							try {
								const data = JSON.parse(response.responseText);
								resolve(data);
							} catch (e) {
								resolve(response.responseText);
							}
						} else {
							reject(
								new Error(
									`Request failed with status ${response.status}: ${response.statusText}`,
								),
							);
						}
					},
					onerror: (error) => {
						reject(new Error(`Request failed: ${error.statusText || error}`));
					},
					ontimeout: () => {
						reject(new Error("Request timeout"));
					},
				});
			});
		}

		async getMyProblemSets(activeOnly = true) {
			return this.request("/problem-sets", {
				params: activeOnly
					? { filter: `{"endAtAfter":"${new Date().toISOString()}"}` }
					: { filter: "{}" },
			});
		}

		async createProblemSetExams(problemSetId) {
			return this.request(`/problem-sets/${problemSetId}/exams`, {
				method: "POST",
			});
		}

		async getProblemSetExams(problemSetId, autoCreate = true) {
			if (autoCreate) {
				try {
					await this.createProblemSetExams(problemSetId);
				} catch (e) {
					// Ignore 412 errors (already exists)
				}
			}
			return this.request(`/problem-sets/${problemSetId}/exams`);
		}

		async getProblemSetSummaries(problemSetId) {
			return this.request(`/problem-sets/${problemSetId}/problem-summaries`);
		}

		async getExamProblems(examsId, problemSetId, problemType) {
			return this.request(`/problem-sets/${problemSetId}/exam-problems`, {
				params: { exam_id: examsId, problem_type: problemType },
			});
		}

		async getProblemStatus(examsId, problemSetId) {
			return this.request(
				`/exams/${examsId}/problem-sets/${problemSetId}/problem-status`,
			);
		}

		async getProblemSubmission(examsId, problemSetId, problemId) {
			return this.request(
				`/exams/${examsId}/problem-sets/${problemSetId}/exam-problem-submissions/${problemId}`,
			);
		}

		async getExamSubmissions(examsId, problemSetId) {
			return this.request(
				`/exams/${examsId}/problem-sets/${problemSetId}/submissions`,
			);
		}

		async getSubmissionDetail(submissionId) {
			return this.request(`/submissions/${submissionId}`);
		}
	}

	// ==================== Session ID Management ====================
	/**
	 * Get session ID from cookies or stored value
	 * @returns {Promise<string|null>}
	 */
	async function getSessionId() {
		// Method 1: Try GM_cookie API (works with HttpOnly cookies)
		if (typeof GM_cookie !== "undefined") {
			try {
				console.log("尝试使用 GM_cookie API...");
				const cookies = await new Promise((resolve, reject) => {
					GM_cookie.list({}, (cookies, error) => {
						if (error) {
							reject(error);
						} else {
							resolve(cookies || []);
						}
					});
				});

				console.log(
					"获取到的 cookies:",
					cookies.map((c) => c.name),
				);
				const sessionCookie = cookies.find((c) => c.name === "PTASession");
				if (sessionCookie && sessionCookie.value) {
					const sessionId = sessionCookie.value;
					saveSessionId(sessionId);
					console.log("✅ 通过 GM_cookie API 获取到 Session ID");
					return sessionId;
				}
			} catch (e) {
				console.log("⚠️ GM_cookie 不可用:", e.message);
			}
		} else {
			console.log("⚠️ GM_cookie API 未定义");
		}

		// Method 2: Try to get from document.cookie
		try {
			const cookieString = document.cookie;
			if (cookieString) {
				console.log("尝试解析 document.cookie...");
				const cookies = cookieString.split(";");
				for (const cookie of cookies) {
					const [name, value] = cookie.trim().split("=");
					if (name === "PTASession" && value) {
						saveSessionId(value);
						console.log("✅ 通过 document.cookie 获取到 Session ID");
						return value;
					}
				}
				console.log("⚠️ document.cookie 中没有找到 PTASession");
			} else {
				console.log("⚠️ document.cookie 为空");
			}
		} catch (e) {
			console.log("⚠️ document.cookie 获取失败:", e.message);
		}

		// Method 3: Try to get from GM storage
		const storedSession = GM_getValue("pintia_session_id", null);
		if (storedSession) {
			console.log("✅ 从缓存中获取到 Session ID");
			return storedSession;
		}

		console.log("❌ 无法自动获取 Session ID，需要手动输入");
		return null;
	}

	/**
	 * Save session ID to GM storage
	 * @param {string} sessionId
	 */
	function saveSessionId(sessionId) {
		GM_setValue("pintia_session_id", sessionId);
	}

	/**
	 * Prompt user to enter session ID manually
	 * @returns {Promise<string|null>}
	 */
	function promptSessionId() {
		return new Promise((resolve) => {
			const overlay = document.createElement("div");
			overlay.style.cssText = `
				position: fixed;
				top: 0;
				left: 0;
				right: 0;
				bottom: 0;
				background: rgba(0, 0, 0, 0.7);
				z-index: 100000;
				display: flex;
				align-items: center;
				justify-content: center;
			`;

			const dialog = document.createElement("div");
			dialog.style.cssText = `
				background: white;
				border-radius: 12px;
				padding: 24px;
				max-width: 500px;
				width: 90%;
				box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
			`;

			const title = document.createElement("h3");
			title.textContent = "🔑 需要 Session ID";
			title.style.cssText = `
				margin: 0 0 16px 0;
				font-size: 18px;
				color: #333;
			`;

			const description = document.createElement("div");
			description.innerHTML = `
				<p style="color: #666; font-size: 14px; line-height: 1.6;">
					如果无法自动获取 Session ID，请手动输入。获取步骤：
				</p>
				<ol style="color: #666; font-size: 13px; line-height: 1.8; padding-left: 20px;">
					<li>登录 Pintia 网站 (https://pintia.cn)</li>
					<li>按 F12 打开开发者工具</li>
					<li>切换到 <strong>Network</strong> 标签</li>
					<li>刷新页面</li>
					<li>找到任意请求，查看 Request Headers</li>
					<li>复制 <code>Cookie: PTASession=xxx</code> 中的 <code>xxx</code> 部分</li>
				</ol>
			`;

			const input = document.createElement("input");
			input.type = "text";
			input.placeholder = "请输入 PTASession 值...";
			input.style.cssText = `
				width: 100%;
				padding: 10px;
				margin: 16px 0;
				border: 1px solid #ddd;
				border-radius: 6px;
				font-size: 14px;
				box-sizing: border-box;
			`;

			const buttonGroup = document.createElement("div");
			buttonGroup.style.cssText = `
				display: flex;
				gap: 12px;
				justify-content: flex-end;
				margin-top: 16px;
			`;

			const cancelBtn = document.createElement("button");
			cancelBtn.textContent = "取消";
			cancelBtn.style.cssText = `
				padding: 8px 20px;
				background: #f5f5f5;
				color: #666;
				border: none;
				border-radius: 6px;
				cursor: pointer;
				font-size: 14px;
			`;

			const confirmBtn = document.createElement("button");
			confirmBtn.textContent = "确定";
			confirmBtn.style.cssText = `
				padding: 8px 20px;
				background: #1890ff;
				color: white;
				border: none;
				border-radius: 6px;
				cursor: pointer;
				font-size: 14px;
			`;

			cancelBtn.onclick = () => {
				document.body.removeChild(overlay);
				resolve(null);
			};

			confirmBtn.onclick = () => {
				const value = input.value.trim();
				document.body.removeChild(overlay);
				resolve(value || null);
			};

			input.addEventListener("keypress", (e) => {
				if (e.key === "Enter") {
					const value = input.value.trim();
					document.body.removeChild(overlay);
					resolve(value || null);
				}
			});

			buttonGroup.appendChild(cancelBtn);
			buttonGroup.appendChild(confirmBtn);

			dialog.appendChild(title);
			dialog.appendChild(description);
			dialog.appendChild(input);
			dialog.appendChild(buttonGroup);
			overlay.appendChild(dialog);
			document.body.appendChild(overlay);

			// Auto focus input
			setTimeout(() => input.focus(), 100);
		});
	}

	// ==================== Export Logic ====================
	/**
	 * Generate Markdown content from problems
	 * @param {string} name
	 * @param {string} id
	 * @param {Array} problems
	 * @param {Object} status
	 * @param {Object} userAnswers
	 * @returns {string}
	 */
	function generateMarkdown(name, id, problems, status, userAnswers) {
		let md = `# ${name}\n\n`;

		for (let i = 0; i < problems.length; i++) {
			const problem = problems[i];
			const userAnswer = userAnswers[problem.id];
			let cleanContent = problem.content
				.replace(/@\[\]\(\d+\)/g, "")
				.replace(/@(?!\[)/g, "");

			const titleWithoutLabel = problem.label
				? problem.title.replace(new RegExp(`^${problem.label}\\s*-\\s*`), "")
				: problem.title;

			if (cleanContent.trim().startsWith(titleWithoutLabel.trim())) {
				cleanContent = cleanContent.replace(
					new RegExp(
						`^${titleWithoutLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`,
					),
					"",
				);
			}

			if (cleanContent.trim().startsWith(problem.title.trim())) {
				cleanContent = cleanContent.replace(
					new RegExp(
						`^${problem.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`,
					),
					"",
				);
			}

			cleanContent = cleanContent.trim();

			if (
				!cleanContent ||
				cleanContent === "~" ||
				cleanContent === "。" ||
				cleanContent.trim().length < 5
			) {
				cleanContent = titleWithoutLabel;
			}

			md += `## ${i + 1}. ${problem.label} - ${problem.title}\n\n`;
			md += `### 题目\n\n`;
			md += `${cleanContent}\n\n`;

			if (userAnswer) {
				md += `### 答案\n\n`;
				md += `\`\`\`\n${userAnswer}\n\`\`\`\n\n`;
			}

			md += "---\n\n";
		}

		return md;
	}

	/**
	 * Sleep utility function
	 * @param {number} ms
	 */
	function sleep(ms) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	/**
	 * Export a single problem set
	 * @param {PintiaAPI} api
	 * @param {ProblemSet} problemSet
	 * @returns {Promise<{success: boolean, filename?: string, content?: string, error?: string}>}
	 */
	async function exportProblemSet(api, problemSet) {
		const problemSetId = problemSet.id;
		const problemSetName = problemSet.name;

		try {
			// Create exam (ignore errors if already exists)
			try {
				await api.createProblemSetExams(problemSetId);
			} catch (e) {
				// Ignore 412 errors
			}

			await sleep(1000);

			// Get exam info
			const examInfo = await api.getProblemSetExams(problemSetId, false);
			const examId = examInfo.exam.id;

			await sleep(500);

			// Get problem summaries
			const summaryInfo = await api.getProblemSetSummaries(problemSetId);
			const problemTypes = Object.keys(summaryInfo.summaries);

			await sleep(500);

			// Get all problems
			const allProblems = [];
			for (const type of problemTypes) {
				const res = await api.getExamProblems(examId, problemSetId, type);
				if (res.problemSetProblems) {
					allProblems.push(...res.problemSetProblems.filter((p) => p));
				}
				await sleep(500);
			}

			// Get problem status
			let problemStatus = {};
			try {
				const statusInfo = await api.getProblemStatus(examId, problemSetId);
				if (statusInfo.problemStatus) {
					problemStatus = statusInfo.problemStatus;
				}
			} catch (e) {
				// Ignore status errors
			}

			await sleep(500);

			// Get user answers
			const userAnswers = {};
			try {
				const submissionsInfo = await api.getExamSubmissions(
					examId,
					problemSetId,
				);

				if (submissionsInfo?.submissions?.length > 0) {
					const acceptedSubmissions = submissionsInfo.submissions.filter((s) =>
						["PARTIAL_ACCEPTED", "PROBLEM_ACCEPTED", "ACCEPTED"].includes(
							s.status,
						),
					);

					for (const submission of acceptedSubmissions) {
						try {
							const submissionDetail = await api.getSubmissionDetail(
								submission.id,
							);

							if (submissionDetail?.submission?.submissionDetails) {
								for (const detail of submissionDetail.submission
									.submissionDetails) {
									if (detail.multipleChoiceSubmissionDetail?.answer) {
										userAnswers[detail.problemSetProblemId] =
											detail.multipleChoiceSubmissionDetail.answer;
									} else if (detail.programmingSubmissionDetail?.code) {
										userAnswers[detail.problemSetProblemId] =
											detail.programmingSubmissionDetail.code;
									} else if (detail.sqlProgrammingSubmissionDetail?.program) {
										userAnswers[detail.problemSetProblemId] =
											detail.sqlProgrammingSubmissionDetail.program;
									} else if (detail.fillBlankSubmissionDetail?.answer) {
										userAnswers[detail.problemSetProblemId] =
											detail.fillBlankSubmissionDetail.answer;
									}
								}
							}
						} catch (e) {
							// Ignore individual submission errors
						}
						await sleep(100);
					}
				}
			} catch (e) {
				// Ignore submissions errors
			}

			// Generate markdown
			const mdContent = generateMarkdown(
				problemSetName,
				problemSetId,
				allProblems,
				problemStatus,
				userAnswers,
			);

			const filename = `${problemSetId}-${problemSetName.replace(
				/[^a-zA-Z0-9\u4e00-\u9fa5]/g,
				"_",
			)}.md`;

			return {
				success: true,
				filename,
				content: mdContent,
			};
		} catch (error) {
			return {
				success: false,
				error: error.message,
			};
		}
	}

	// ==================== UI Components ====================
	/**
	 * Create export panel UI
	 */
	function createExportPanel() {
		// Create panel container
		const panel = document.createElement("div");
		panel.id = "pintia-export-panel";
		panel.style.cssText = `
			position: fixed;
			top: 20px;
			right: 20px;
			z-index: 10000;
			background: white;
			border: 1px solid #ddd;
			border-radius: 8px;
			box-shadow: 0 4px 12px rgba(0,0,0,0.15);
			padding: 16px;
			min-width: 300px;
			max-width: 400px;
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
			display: none;
		`;

		// Header
		const header = document.createElement("div");
		header.style.cssText = `
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 12px;
			padding-bottom: 8px;
			border-bottom: 1px solid #eee;
		`;

		const title = document.createElement("h3");
		title.textContent = "📤 Pintia 导出工具";
		title.style.cssText = `
			margin: 0;
			font-size: 16px;
			color: #333;
		`;

		const headerActions = document.createElement("div");
		headerActions.style.cssText = `
			display: flex;
			gap: 8px;
			align-items: center;
		`;

		// Settings button
		const settingsBtn = document.createElement("button");
		settingsBtn.textContent = "⚙️";
		settingsBtn.title = "设置 Session ID";
		settingsBtn.style.cssText = `
			background: none;
			border: none;
			font-size: 18px;
			cursor: pointer;
			padding: 4px;
			opacity: 0.6;
			transition: opacity 0.2s;
		`;
		settingsBtn.onmouseover = () => (settingsBtn.style.opacity = "1");
		settingsBtn.onmouseout = () => (settingsBtn.style.opacity = "0.6");

		settingsBtn.onclick = async () => {
			const newSessionId = await promptSessionId();
			if (newSessionId) {
				saveSessionId(newSessionId);
				showNotification("✅ Session ID 已更新", "success");
				// Reload problem sets
				loadProblemSets();
			}
		};

		const closeBtn = document.createElement("button");
		closeBtn.textContent = "✕";
		closeBtn.style.cssText = `
			background: none;
			border: none;
			font-size: 20px;
			cursor: pointer;
			color: #999;
			padding: 0 4px;
		`;
		closeBtn.onclick = () => {
			panel.style.display = "none";
		};

		headerActions.appendChild(settingsBtn);
		headerActions.appendChild(closeBtn);
		header.appendChild(title);
		header.appendChild(headerActions);

		// Content
		const content = document.createElement("div");
		content.id = "pintia-export-content";
		content.style.cssText = `
			max-height: 400px;
			overflow-y: auto;
		`;

		// Export all button
		const exportAllBtn = document.createElement("button");
		exportAllBtn.textContent = "导出所有题目集";
		exportAllBtn.style.cssText = `
			width: 100%;
			padding: 10px;
			background: #1890ff;
			color: white;
			border: none;
			border-radius: 4px;
			cursor: pointer;
			font-size: 14px;
			margin-bottom: 12px;
		`;
		exportAllBtn.onmouseover = () =>
			(exportAllBtn.style.background = "#40a9ff");
		exportAllBtn.onmouseout = () => (exportAllBtn.style.background = "#1890ff");

		// Problem set list
		const problemSetList = document.createElement("div");
		problemSetList.id = "pintia-problemset-list";
		problemSetList.style.cssText = `
			display: flex;
			flex-direction: column;
			gap: 8px;
		`;

		content.appendChild(exportAllBtn);
		content.appendChild(problemSetList);

		// Loading overlay
		const loading = document.createElement("div");
		loading.id = "pintia-export-loading";
		loading.style.cssText = `
			display: none;
			text-align: center;
			padding: 20px;
		`;
		const loadingText = document.createElement("div");
		loadingText.id = "pintia-loading-text";
		loadingText.style.cssText = `
			color: #666;
			font-size: 14px;
		`;
		loading.appendChild(loadingText);

		panel.appendChild(header);
		panel.appendChild(content);
		panel.appendChild(loading);

		// Event listeners
		exportAllBtn.onclick = () => exportAllProblemSets();

		document.body.appendChild(panel);

		return panel;
	}

	/**
	 * Create floating toggle button
	 */
	function createToggleButton(panel) {
		const btn = document.createElement("div");
		btn.id = "pintia-export-toggle";
		btn.textContent = "📤";
		btn.style.cssText = `
			position: fixed;
			bottom: 100px;
			right: 20px;
			z-index: 10001;
			width: 50px;
			height: 50px;
			background: #1890ff;
			border-radius: 50%;
			display: flex;
			align-items: center;
			justify-content: center;
			cursor: pointer;
			box-shadow: 0 4px 12px rgba(0,0,0,0.3);
			font-size: 24px;
			transition: transform 0.2s;
		`;

		btn.onmouseover = () => (btn.style.transform = "scale(1.1)");
		btn.onmouseout = () => (btn.style.transform = "scale(1)");

		btn.onclick = () => {
			const isVisible = panel.style.display === "block";
			panel.style.display = isVisible ? "none" : "block";
		};

		document.body.appendChild(btn);
		return btn;
	}

	/**
	 * Load problem sets into the panel
	 */
	async function loadProblemSets() {
		let sessionId = await getSessionId();

		// If no session ID found, prompt user to enter
		if (!sessionId) {
			console.log("未找到 Session ID，弹出输入框...");
			sessionId = await promptSessionId();

			if (!sessionId) {
				showNotification("未提供 Session ID，已取消操作", "info");
				return;
			}

			// Save the manually entered session ID
			saveSessionId(sessionId);
			showNotification("✅ Session ID 已保存", "success");
		}

		const api = new PintiaAPI(sessionId);
		const listContainer = document.getElementById("pintia-problemset-list");
		const loading = document.getElementById("pintia-export-loading");
		const content = document.getElementById("pintia-export-content");

		// Show loading
		content.style.display = "none";
		loading.style.display = "block";
		document.getElementById("pintia-loading-text").textContent =
			"正在加载题目集...";

		try {
			const response = await api.getMyProblemSets(false);
			const problemSets = response.problemSets || [];

			loading.style.display = "none";
			content.style.display = "block";

			if (problemSets.length === 0) {
				listContainer.innerHTML =
					'<div style="text-align:center;color:#999;padding:20px;">没有找到题目集</div>';
				return;
			}

			listContainer.innerHTML = "";

			problemSets.forEach((ps) => {
				const item = document.createElement("div");
				item.style.cssText = `
					padding: 10px;
					background: #f5f5f5;
					border-radius: 4px;
					cursor: pointer;
					transition: background 0.2s;
					display: flex;
					justify-content: space-between;
					align-items: center;
				`;
				item.onmouseover = () => (item.style.background = "#e6f7ff");
				item.onmouseout = () => (item.style.background = "#f5f5f5");

				const name = document.createElement("span");
				name.textContent = ps.name;
				name.style.cssText = `
					flex: 1;
					font-size: 14px;
					overflow: hidden;
					text-overflow: ellipsis;
					white-space: nowrap;
				`;

				const exportBtn = document.createElement("button");
				exportBtn.textContent = "导出";
				exportBtn.style.cssText = `
					padding: 4px 12px;
					background: #52c41a;
					color: white;
					border: none;
					border-radius: 4px;
					cursor: pointer;
					font-size: 12px;
					margin-left: 8px;
				`;
				exportBtn.onmouseover = () => (exportBtn.style.background = "#73d13d");
				exportBtn.onmouseout = () => (exportBtn.style.background = "#52c41a");

				exportBtn.onclick = async () => {
					exportBtn.disabled = true;
					exportBtn.textContent = "导出中...";
					exportBtn.style.background = "#d9d9d9";

					const result = await exportProblemSet(api, ps);

					if (result.success) {
						exportBtn.textContent = "✓";
						exportBtn.style.background = "#52c41a";
						showNotification(`✅ ${result.filename} 导出成功`, "success");
						copyToClipboard(result.content, result.filename);
					} else {
						exportBtn.textContent = "✗";
						exportBtn.style.background = "#ff4d4f";
						showNotification(`❌ 导出失败: ${result.error}`, "error");
					}

					setTimeout(() => {
						exportBtn.disabled = false;
						exportBtn.textContent = "导出";
						exportBtn.style.background = "#52c41a";
					}, 2000);
				};

				item.appendChild(name);
				item.appendChild(exportBtn);
				listContainer.appendChild(item);
			});
		} catch (error) {
			loading.style.display = "none";
			content.style.display = "block";
			listContainer.innerHTML = `<div style="text-align:center;color:#ff4d4f;padding:20px;">加载失败: ${error.message}</div>`;
		}
	}

	/**
	 * Export all problem sets
	 */
	async function exportAllProblemSets() {
		let sessionId = await getSessionId();

		// If no session ID found, prompt user to enter
		if (!sessionId) {
			console.log("未找到 Session ID，弹出输入框...");
			sessionId = await promptSessionId();

			if (!sessionId) {
				showNotification("未提供 Session ID，已取消操作", "info");
				return;
			}

			// Save the manually entered session ID
			saveSessionId(sessionId);
			showNotification("✅ Session ID 已保存", "success");
		}

		const api = new PintiaAPI(sessionId);
		const loading = document.getElementById("pintia-export-loading");
		const content = document.getElementById("pintia-export-content");

		content.style.display = "none";
		loading.style.display = "block";
		document.getElementById("pintia-loading-text").textContent =
			"正在获取题目集列表...";

		try {
			const response = await api.getMyProblemSets(false);
			const problemSets = response.problemSets || [];

			if (problemSets.length === 0) {
				loading.style.display = "none";
				content.style.display = "block";
				showNotification("没有找到题目集", "info");
				return;
			}

			let successCount = 0;
			let failCount = 0;

			for (let i = 0; i < problemSets.length; i++) {
				const ps = problemSets[i];
				document.getElementById("pintia-loading-text").textContent =
					`正在导出 (${i + 1}/${problemSets.length}): ${ps.name}`;

				const result = await exportProblemSet(api, ps);

				if (result.success) {
					successCount++;
					copyToClipboard(result.content, result.filename);
					await sleep(500);
				} else {
					failCount++;
				}
			}

			loading.style.display = "none";
			content.style.display = "block";

			showNotification(
				`✅ 导出完成: ${successCount} 成功, ${failCount} 失败`,
				successCount > 0 ? "success" : "error",
			);
		} catch (error) {
			loading.style.display = "none";
			content.style.display = "block";
			showNotification(`❌ 导出失败: ${error.message}`, "error");
		}
	}

	/**
	 * Copy content to clipboard and trigger download
	 * @param {string} content
	 * @param {string} filename
	 */
	function copyToClipboard(content, filename) {
		// Copy to clipboard
		GM_setClipboard(content);

		// Create download link
		const blob = new Blob([content], { type: "text/markdown" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = filename;
		a.style.display = "none";
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	/**
	 * Show notification
	 * @param {string} message
	 * @param {string} type
	 */
	function showNotification(message, type = "info") {
		if (typeof GM_notification !== "undefined") {
			GM_notification({
				text: message,
				title: "Pintia 导出工具",
				timeout: 3000,
				image: type === "success" ? "✅" : type === "error" ? "❌" : "ℹ️",
			});
		} else {
			// Fallback to alert
			alert(message);
		}
	}

	// ==================== Initialize ====================
	async function init() {
		// Check if user is logged in
		const sessionId = await getSessionId();
		console.log("Session ID 状态:", sessionId ? "已找到" : "未找到");

		// Create UI
		const panel = createExportPanel();
		const toggleBtn = createToggleButton(panel);

		// Register menu command
		if (typeof GM_registerMenuCommand !== "undefined") {
			GM_registerMenuCommand("打开 Pintia 导出工具", () => {
				panel.style.display =
					panel.style.display === "block" ? "none" : "block";
			});
		}

		// Load problem sets when panel is opened
		const originalDisplay = panel.style.display;
		const observer = new MutationObserver((mutations) => {
			mutations.forEach((mutation) => {
				if (
					mutation.attributeName === "style" &&
					panel.style.display === "block" &&
					document.getElementById("pintia-problemset-list")?.children.length ===
						0
				) {
					loadProblemSets();
				}
			});
		});

		observer.observe(panel, { attributes: true });

		console.log("Pintia 导出工具已加载");
	}

	// Start the application
	init();
})();
