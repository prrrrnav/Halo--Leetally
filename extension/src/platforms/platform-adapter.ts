export type ProblemData={platform:string;problem_slug:string;problem_title:string;difficulty?:string};
export interface CodingPlatformAdapter{isSupportedPage():boolean;extractProblem():Promise<ProblemData>;}
