import type {ProblemData} from "../platforms/platform-adapter";
import {getAccessToken} from "./auth-client";
const API="http://localhost:8000/api/v1";
export async function createInterview(problem:ProblemData){
  const token=await getAccessToken();
  const response=await fetch(`${API}/interviews`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify(problem)});
  if(!response.ok)throw new Error(`Backend returned ${response.status}`);
  return response.json();
}
