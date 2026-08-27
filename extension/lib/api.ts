import { supabase } from "./supabase";
import type { InterviewType, TargetCompanyId } from "./progress";

const API_URL = import.meta.env.VITE_API_URL;

export interface InterviewContext {
  platform: string;
  problemSlug: string;
  problemTitle: string;
  difficulty: string | null;
  targetCompany?: TargetCompanyId;
  interviewType?: InterviewType;
}

export interface Interview {
  id: string;
  user_id: string;
  platform: string;
  problem_slug: string;
  problem_title: string;
  difficulty: string | null;
  target_company: TargetCompanyId;
  interview_type: InterviewType;
  status: string;
  created_at: string;
}

export interface InterviewTurnResponse {
  transcript: string;
  interviewer_message: string;
  /** Base64-encoded audio from Fish Audio (may be absent if synthesis failed). */
  interviewer_audio_base64?: string | null;
  /** MIME type of the audio, e.g. "audio/mpeg". */
  interviewer_audio_content_type?: string | null;
  phase: InterviewPhase;
}

export type InterviewPhase =
  | "clarification" | "approach" | "coding"
  | "testing" | "complexity" | "wrap_up";

export interface ScoreDimension {
  score: number;
  evidence: string[];
  next_action: string;
}

export interface InterviewAssessment {
  interview_id: string;
  level: "sde1";
  overall_score: number;
  hiring_signal: "strong_hire" | "hire" | "lean_hire" | "not_yet";
  summary: string;
  dimensions: Record<string, ScoreDimension>;
  strengths: string[];
  priority_improvements: string[];
  next_drills: string[];
  duration_seconds: number;
  completed_at: string;
}

export interface BillingEntitlement {
  plan_id?: string | null;
  plan_name?: string | null;
  status: string;
  is_lifetime: boolean;
  minutes_limit: number;
  minutes_used: number;
  minutes_remaining: number;
  speech_seconds_used?: number;
  speech_seconds_remaining?: number;
  usage_percent?: number;
  auto_renew?: boolean;
  period_start?: string | null;
  period_end?: string | null;
  features?: string[];
}

export interface AccountFriendConnection {
  relationship_id: string;
  account_user_id: string;
  email: string;
  display_name?: string | null;
  status: "pending" | "accepted";
  direction: "sent" | "received" | "connected";
  username?: string | null;
  avatar?: string | null;
  ranking?: number | null;
  total_solved: number;
  easy_solved: number;
  medium_solved: number;
  hard_solved: number;
  synced_at?: string | null;
}

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw new Error(error.message);
  }

  if (!session?.access_token) {
    throw new Error("Please sign in first.");
  }

  return session.access_token;
}

async function authenticatedFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = await getAccessToken();

  const headers = new Headers(init.headers);

  headers.set("Authorization", `Bearer ${token}`);

  return fetch(url, {
    ...init,
    credentials: "omit",
    headers,
  });
}

async function friendResponse(response: Response): Promise<AccountFriendConnection[]> {
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail ?? `Friend request failed (${response.status}).`);
  }
  return response.json();
}

export async function listFriendConnections(): Promise<AccountFriendConnection[]> {
  return friendResponse(await authenticatedFetch(`${API_URL}/friends`));
}

export async function addFriendByEmail(email: string): Promise<AccountFriendConnection[]> {
  return friendResponse(await authenticatedFetch(`${API_URL}/friends`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  }));
}

export async function acceptFriendRequest(relationshipId: string): Promise<AccountFriendConnection[]> {
  return friendResponse(await authenticatedFetch(`${API_URL}/friends/${relationshipId}/accept`, {
    method: "POST",
  }));
}

export async function removeFriendConnection(relationshipId: string): Promise<void> {
  const response = await authenticatedFetch(`${API_URL}/friends/${relationshipId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail ?? `Could not remove friend (${response.status}).`);
  }
}

export async function createInterview(
  context: InterviewContext,
): Promise<Interview> {
  const response = await authenticatedFetch(
    `${API_URL}/interviews`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        platform: context.platform,
        problem_slug: context.problemSlug,
        problem_title: context.problemTitle,
        difficulty: context.difficulty,
        target_company: context.targetCompany ?? "google",
        interview_type: context.interviewType ?? "dsa",
        level: "sde1",
      }),
    },
  );

  if (!response.ok) {
    const body = await response.json().catch(() => null);

    throw new Error(
      body?.detail ??
        `Backend request failed with status ${response.status}`,
    );
  }

  return response.json();
}

export async function submitInterviewAudio(
  interviewId: string,
  audio: Blob,
): Promise<InterviewTurnResponse> {
  const formData = new FormData();

  formData.append(
    "audio",
    audio,
    `candidate-${Date.now()}.wav`,
  );

  const response = await authenticatedFetch(
    `${API_URL}/interviews/${interviewId}/turns/audio`,
    {
      method: "POST",
      body: formData,
    },
  );

  if (!response.ok) {
    const body = await response.json().catch(() => null);

    throw new Error(
      body?.detail ??
        `Backend request failed with status ${response.status}`,
    );
  }

  return response.json();
}

export async function updateInterviewContext(
  interviewId: string,
  context: Partial<{
    problem_title: string;
    problem_description: string;
    difficulty: string;
    programming_language: string;
    code: string;
    visible_output: string;
    problem_topics: string[];
    interview_companies: string[];
  }>,
): Promise<void> {
  const response = await authenticatedFetch(`${API_URL}/interviews/${interviewId}/context`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(context),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail ?? `Could not sync interview evidence (${response.status}).`);
  }
}

export async function completeInterview(
  interviewId: string,
  durationSeconds: number,
): Promise<InterviewAssessment> {
  const response = await authenticatedFetch(`${API_URL}/interviews/${interviewId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ duration_seconds: durationSeconds }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail ?? `Could not complete interview (${response.status}).`);
  }
  return response.json();
}

export async function getBillingEntitlement(): Promise<BillingEntitlement> {
  const response = await authenticatedFetch(`${API_URL}/billing/me`);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail ?? `Could not load premium status (${response.status}).`);
  }
  return response.json();
}
