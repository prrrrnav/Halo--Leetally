import type {CodingPlatformAdapter,ProblemData} from "./platform-adapter";
export class LeetCodeAdapter implements CodingPlatformAdapter{
  isSupportedPage(){return location.hostname==="leetcode.com"&&location.pathname.startsWith("/problems/");}
  async extractProblem():Promise<ProblemData>{
    const slug=location.pathname.split("/").filter(Boolean)[1]??"unknown";
    const heading=document.querySelector<HTMLElement>("[data-cy='question-title'], a[href^='/problems/'] div.text-title-large, h1");
    const text=document.body.innerText;
    const difficulty=["Easy","Medium","Hard"].find(value=>text.includes(value));
    return {platform:"leetcode",problem_slug:slug,problem_title:heading?.innerText.trim()||slug.replaceAll("-"," "),difficulty:difficulty?.toLowerCase()};
  }
}
