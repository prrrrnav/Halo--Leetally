import{describe,expect,it}from"vitest";
describe("problem slug",()=>{it("documents expected LeetCode path shape",()=>expect("/problems/two-sum/".split("/").filter(Boolean)[1]).toBe("two-sum"));});
