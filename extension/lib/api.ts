import { supabase } from "./supabase";

const API_URL = import.meta.env.VITE_API_URL;

export interface InterviewContext {
  platform: string;
  problemSlug: string;
  problemTitle: string;
  difficulty: string | null;
}

export interface Interview {
  id: string;
  user_id: string;
  platform: string;
  problem_slug: string;
  problem_title: string;
  difficulty: string | null;
  status: string;
  created_at: string;
}

export interface InterviewTurnResponse {
  transcript: string;
  interviewer_message: string;
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