from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from .config import get_settings
from .dependencies import current_user, get_ai_provider, get_repository
from .domain import AIProvider, AuthenticatedUser, InterviewRepository
from .schemas import InterviewCreate, InterviewOut, MessageIn, MessageOut, UserOut

settings = get_settings()
app = FastAPI(title="AI LeetCode Interviewer API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origin_list, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

@app.get("/api/v1/health")
async def health(): return {"status": "ok", "version": app.version}

@app.get("/api/v1/auth/me", response_model=UserOut)
async def me(user: AuthenticatedUser = Depends(current_user)): return user

@app.post("/api/v1/interviews", response_model=InterviewOut, status_code=201)
async def create_interview(payload: InterviewCreate, user: AuthenticatedUser = Depends(current_user), repo: InterviewRepository = Depends(get_repository)):
    return await repo.create(user.id, payload.model_dump())

@app.get("/api/v1/interviews/{interview_id}", response_model=InterviewOut)
async def read_interview(interview_id: str, user: AuthenticatedUser = Depends(current_user), repo: InterviewRepository = Depends(get_repository)):
    item = await repo.get(interview_id, user.id)
    if not item: raise HTTPException(status_code=404, detail="Interview not found")
    return item

@app.post("/api/v1/interviews/{interview_id}/messages", response_model=MessageOut)
async def message(interview_id: str, payload: MessageIn, user: AuthenticatedUser = Depends(current_user), repo: InterviewRepository = Depends(get_repository), ai: AIProvider = Depends(get_ai_provider)):
    item = await repo.get(interview_id, user.id)
    if not item: raise HTTPException(status_code=404, detail="Interview not found")
    return MessageOut(reply=await ai.reply(item, payload.content))

