import { promises as fs } from "fs";
import * as readline from "readline";
import { PintiaAPI } from "./pintia-api";

// 配置区域 - 使用环境变量或命令行参数
let SESSION_ID = process.env.PINTIA_SESSION_ID || "";

async function getSessionId(): Promise<string> {
	if (SESSION_ID) {
		return SESSION_ID;
	}

	console.log("未检测到环境变量 PINTIA_SESSION_ID");
	console.log("\n获取 Session ID 的步骤:");
	console.log("1. 登录 Pintia 网站 (https://pintia.cn)");
	console.log("2. 打开浏览器开发者工具 (F12)");
	console.log("3. 切换到 Network 标签");
	console.log("4. 刷新页面");
	console.log(
		"5. 找到任意请求，查看 Request Headers 中的 Cookie: PTASession=xxx",
	);
	console.log("6. 复制 PTASession 后的值\n");

	const sessionId = await askQuestion("请输入您的 Pintia Session ID: ");
	return sessionId.trim();
}

async function listProblemSets() {
	const api = new PintiaAPI(SESSION_ID);

	console.log("\n📡 正在获取题目集列表...\n");
	const response = await api.getMyProblemSets(false);

	if (response instanceof Error) {
		console.error("❌ 获取题目集失败:", response.message);
		process.exit(1);
	}

	const problemSets = response.problemSets;

	if (problemSets.length === 0) {
		console.log("📭 没有找到任何题目集");
		process.exit(0);
	}

	console.log(`✅ 找到 ${problemSets.length} 个题目集:\n`);
	problemSets.forEach((ps, index) => {
		console.log(`  ${index + 1}. ${ps.name} (ID: ${ps.id})`);
	});

	return problemSets;
}

function askQuestion(question: string): Promise<string> {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	return new Promise((resolve) => {
		rl.question(question, (answer) => {
			rl.close();
			resolve(answer);
		});
	});
}

async function selectProblemSets(problemSets: any[]): Promise<any[]> {
	const input = await askQuestion(
		"\n🎯 请选择要导出的题目集（输入序号，用逗号分隔，如: 1,3,5，或输入 'all' 导出全部）: ",
	);
	const trimmedInput = input.trim();

	if (trimmedInput.toLowerCase() === "all") {
		console.log(`📋 已选择全部 ${problemSets.length} 个题目集\n`);
		return problemSets;
	}

	const indices = trimmedInput
		.split(/[,，]/)
		.map((s) => s.trim())
		.filter((s) => s)
		.map((s) => parseInt(s) - 1);
	const selected: any[] = [];

	for (const index of indices) {
		if (index >= 0 && index < problemSets.length) {
			selected.push(problemSets[index]);
		} else {
			console.log(`⚠️  警告: 序号 ${index + 1} 无效，已跳过`);
		}
	}

	return selected;
}

async function exportProblemSets(selectedSets: any[]) {
	const api = new PintiaAPI(SESSION_ID);
	const startTime = Date.now();
	let totalProblems = 0;
	let totalAnswers = 0;

	console.log(`\n📦 开始导出 ${selectedSets.length} 个题目集...\n`);

	for (let i = 0; i < selectedSets.length; i++) {
		const problemSet = selectedSets[i];
		const problemSetId = problemSet.id;
		const problemSetName = problemSet.name;

		console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
		console.log(
			`[${i + 1}/${selectedSets.length}] 处理题目集: ${problemSetName}`,
		);
		console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

		await new Promise((resolve) => setTimeout(resolve, 2000));

		try {
			await api.createProblemSetExams(problemSetId);
		} catch (e) {
			console.log(`⏭️  Exam 可能已存在，继续...`);
		}

		const examInfo = await api.getProblemSetExams(problemSetId, false);
		if (examInfo instanceof Error) {
			console.error(`❌ 获取 exam 信息失败: ${examInfo.message}`);
			continue;
		}

		const examId = examInfo.exam.id;

		const summaryInfo = await api.getProblemSetSummaries(problemSetId);
		if (summaryInfo instanceof Error) {
			console.error(`❌ 获取题目摘要失败: ${summaryInfo.message}`);
			continue;
		}

		const problemTypes = Object.keys(summaryInfo.summaries);
		const allProblems: any[] = [];

		console.log(`\n📝 正在获取题目...`);
		for (const type of problemTypes) {
			const res = await api.getExamProblems(examId, problemSetId, type);
			if (res instanceof Error) {
				console.error(`❌ 获取 ${type} 类型题目失败: ${res.message}`);
				continue;
			}
			const count = res.problemSetProblems.filter((p) => p).length;
			console.log(`   ✅ ${type}: ${count} 道`);
			allProblems.push(...res.problemSetProblems.filter((p) => p));
		}

		const statusInfo = await api.getProblemStatus(examId, problemSetId);
		let problemStatus: Record<string, string> = {};
		if (!(statusInfo instanceof Error)) {
			problemStatus = statusInfo.problemStatus;
		}

		const userAnswers: Record<string, string> = {};

		try {
			const submissionsInfo = await api.getExamSubmissions(
				examId,
				problemSetId,
			);
			if (
				!(submissionsInfo instanceof Error) &&
				submissionsInfo?.submissions?.length > 0
			) {
				const acceptedSubmissions = submissionsInfo.submissions.filter(
					(s: any) =>
						["PARTIAL_ACCEPTED", "PROBLEM_ACCEPTED", "ACCEPTED"].includes(
							s.status,
						),
				);

				console.log(
					`\n💾 正在获取提交记录 (共 ${acceptedSubmissions.length} 条)...`,
				);
				for (let j = 0; j < acceptedSubmissions.length; j++) {
					const submission = acceptedSubmissions[j];
					process.stdout.write(
						`\r   进度: ${j + 1}/${acceptedSubmissions.length}`,
					);
					const submissionDetail = await api.getSubmissionDetail(submission.id);
					if (
						!(submissionDetail instanceof Error) &&
						submissionDetail?.submission?.submissionDetails
					) {
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
					await new Promise((resolve) => setTimeout(resolve, 100));
				}
				console.log(`\n   ✅ 找到 ${Object.keys(userAnswers).length} 个答案`);
			} else {
				console.log(`\n💾 没有找到提交记录`);
			}
		} catch (e) {
			console.log(`\n⚠️  获取提交记录失败`);
		}

		console.log(`\n📊 统计信息:`);
		console.log(`   📚 题目总数: ${allProblems.length}`);
		console.log(`   ✏️  已作答: ${Object.keys(userAnswers).length}`);
		console.log(
			`   ⏭️  未作答: ${allProblems.length - Object.keys(userAnswers).length}`,
		);

		const mdContent = generateMarkdown(
			problemSetName,
			problemSetId,
			allProblems,
			problemStatus,
			userAnswers,
		);
		const filename = `${problemSetId}-${problemSetName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "_")}.md`;
		await fs.writeFile(filename, mdContent, "utf-8");
		console.log(`\n✅ 已导出到: ${filename}`);

		totalProblems += allProblems.length;
		totalAnswers += Object.keys(userAnswers).length;
	}

	const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
	console.log(`\n${"━".repeat(50)}`);
	console.log(`🎉 所有题目集导出完成!`);
	console.log(`${"━".repeat(50)}`);
	console.log(`📊 总体统计:`);
	console.log(`   📦 导出题目集: ${selectedSets.length} 个`);
	console.log(`   📚 题目总数: ${totalProblems} 道`);
	console.log(`   ✏️  已作答: ${totalAnswers} 道`);
	console.log(`   ⏭️  未作答: ${totalProblems - totalAnswers} 道`);
	console.log(`   ⏱️  耗时: ${elapsedTime} 秒`);
	console.log(`${"━".repeat(50)}\n`);
}

function generateMarkdown(
	name: string,
	id: string,
	problems: any[],
	status: Record<string, string>,
	userAnswers: Record<string, string>,
): string {
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

async function main() {
	console.log("╔════════════════════════════════════════╗");
	console.log("║    Pintia 题目导出工具 v1.0           ║");
	console.log("╚════════════════════════════════════════╝");

	SESSION_ID = await getSessionId();

	const problemSets = await listProblemSets();
	const selectedSets = await selectProblemSets(problemSets);

	if (selectedSets.length === 0) {
		console.log("\n📭 没有选择任何题目集");
		process.exit(0);
	}

	await exportProblemSets(selectedSets);
}

main().catch((error) => {
	console.error("导出失败:", error);
	process.exit(1);
});
