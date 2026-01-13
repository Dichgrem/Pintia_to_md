export interface ProblemSet {
  id: string;
  name: string;
}

export interface ProblemSetsResponse {
  problemSets: ProblemSet[];
}

export interface Exam {
  id: string;
}

export interface ExamResponse {
  exam: Exam;
}

export interface ProblemSummary {
  [problemType: string]: {
    count: number;
  };
}

export interface ProblemSummariesResponse {
  summaries: ProblemSummary;
}

export interface ExamProblem {
  id: string;
  label: string;
  title: string;
  content: string;
  type: string;
}

export interface ExamProblemsResponse {
  problemSetProblems: ExamProblem[];
}

export interface ProblemStatus {
  [problemId: string]: {
    status: string;
  };
}

export interface ProblemStatusResponse {
  problemStatus: ProblemStatus;
}

export interface Problem {
  id: string;
  label: string;
  title: string;
  content: string;
  type: string;
}

export interface RequestOptions {
  method?: string;
  params?: Record<string, string>;
  body?: string;
}
