import React,{useState} from "react";
import{createRoot}from"react-dom/client";
import{LeetCodeAdapter}from"../platforms/leetcode";
import{createInterview}from"../services/api-client";
const adapter=new LeetCodeAdapter();
function Widget(){const[state,setState]=useState("Start AI Interview");async function start(){try{setState("Starting…");const interview=await createInterview(await adapter.extractProblem());setState(`Ready: ${interview.problem_title}`);}catch(error){setState(error instanceof Error?error.message:"Could not start");}}return <button onClick={start} style={{position:"fixed",right:24,bottom:24,zIndex:2147483647,border:0,borderRadius:999,padding:"14px 20px",background:"#111827",color:"white",fontWeight:700,boxShadow:"0 8px 24px #0005",cursor:"pointer"}}>{state}</button>}
if(adapter.isSupportedPage()){const host=document.createElement("div");host.id="ai-interviewer-root";document.body.appendChild(host);createRoot(host).render(<Widget/>);}
