import type {
  ProblemSetsResponse,
  ExamResponse,
  ProblemSummariesResponse,
  ExamProblemsResponse,
  ProblemStatusResponse,
  RequestOptions
} from "./types";

import https from "https";

const agent = new https.Agent({
  timeout: 60000,
});

const PINTIA_API_BASE = "https://pintia.cn/api";

export class PintiaAPI {
  private readonly sessionId: string;

  constructor(session_id: string) {
    this.sessionId = session_id;
  }

  public async getMyProblemSets(activeOnly: boolean = true) {
    return makePintiaRequest<ProblemSetsResponse>("/problem-sets", this.sessionId, {
      params: activeOnly ?
        { "filter": `{\"endAtAfter\":\"${new Date().toISOString()}\"}` } :
        { "filter": "{}" },
    });
  }

  public async createProblemSetExams(problem_set_id: string) {
    // This might return 412 if exams already created, simply ignore it
    return await makePintiaRequest<ExamResponse>(`/problem-sets/${problem_set_id}/exams`,
      this.sessionId, { method: "POST" });
  }

  public async getProblemSetExams(problem_set_id: string, autoCreate: boolean = true) {
    // Try create first
    autoCreate && this.createProblemSetExams(problem_set_id);
    // Then get it, this includes exams_id we need
    return makePintiaRequest<ExamResponse>(`/problem-sets/${problem_set_id}/exams`, this.sessionId);
  }

  public async getProblemSetSummaries(problem_set_id: string) {
    return makePintiaRequest<ProblemSummariesResponse>(`/problem-sets/${problem_set_id}/problem-summaries`, this.sessionId);
  }

  public async getExamProblems(exams_id: string, problem_set_id: string, problem_type: string) {
    return makePintiaRequest<ExamProblemsResponse>(`/problem-sets/${problem_set_id}/exam-problems`, this.sessionId, {
      params: { "exam_id": exams_id, problem_type }
    });
  }

  public async getProblemStatus(exams_id: string, problem_set_id: string) {
    return makePintiaRequest<ProblemStatusResponse>(`/exams/${exams_id}/problem-sets/${problem_set_id}/problem-status`, this.sessionId);
  }

  public async getProblemSubmission(exams_id: string, problem_set_id: string, problem_id: string) {
    return makePintiaRequest<any>(`/exams/${exams_id}/problem-sets/${problem_set_id}/exam-problem-submissions/${problem_id}`, this.sessionId);
  }

  public async getExamSubmissions(exams_id: string, problem_set_id: string) {
    return makePintiaRequest<any>(`/exams/${exams_id}/problem-sets/${problem_set_id}/submissions`, this.sessionId);
  }

  public async getSubmissionDetail(submission_id: string) {
    return makePintiaRequest<any>(`/submissions/${submission_id}`, this.sessionId);
  }
}


async function makePintiaRequest<T>(
  path: string,
  sessionId: string,
  options: RequestOptions = {}
): Promise<T | Error> {
  const { method = "GET", params, body } = options;

  const headers: Record<string, string> = {
    Accept: "application/json;charset=UTF-8",
    Cookie: `PTASession=${sessionId}`,
  };

  const url = new URL(PINTIA_API_BASE + path);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, String(value));
    });
  }

  const response = await fetch(url.toString(), { method, headers, body,
    // @ts-ignore
    agent,
  });
  if (!response.ok) {
    throw new Error(`Faild to fetch Pintia API, http code ${response.status}, check if environment variable PINTIA_SESSION_ID is set`);
  }
  return (await response.json()) as T;
}
