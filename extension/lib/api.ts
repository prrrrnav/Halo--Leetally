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
  /** Temporary provider-capacity notice; the text interview can continue. */
  service_notice?: string | null;
  phase: InterviewPhase;
}

export type VoiceProviderId = "fish" | "elevenlabs";

export interface VoiceProviderOption {
  id: VoiceProviderId;
  name: string;
  available: boolean;
  configured?: boolean;
  requires_paid: boolean;
}

export async function getVoiceProviders(): Promise<VoiceProviderOption[]> {
  const response = await authenticatedFetch(`${API_URL}/voice/providers`);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail ?? "Could not load voice choices.");
  }
  const body = await response.json();
  return Array.isArray(body?.providers) ? body.providers : [];
}

export type InterviewStreamStage = "transcribing" | "responding" | "voice";

export interface InterviewStreamHandlers {
  onStatus?: (stage: InterviewStreamStage) => void;
  onTranscript?: (text: string, phase: InterviewPhase) => void;
  onAssistantDelta?: (text: string) => void;
  onAssistantDone?: (text: string, phase: InterviewPhase) => void;
  onAudio?: (base64: string, contentType: string) => void;
  onNotice?: (message: string) => void;
  onDone?: (phase: InterviewPhase, serviceNotice?: string | null) => void;
}

export class InterviewStreamUnavailableError extends Error {
  constructor(message = "Live interview streaming is unavailable.") {
    super(message);
    this.name = "InterviewStreamUnavailableError";
  }
}

export type InterviewPhase = "clarification" | "approach" | "coding" | "testing" | "complexity" | "wrap_up";

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
  streak: number;
  total_solved: number;
  easy_solved: number;
  medium_solved: number;
  hard_solved: number;
  synced_at?: string | null;
}

export interface ProductFeedback {
  id: string;
  email: string;
  message: string;
  rating: number;
  metadata: {
    source?: string;
    extension_version?: string;
    problem_slug?: string | null;
    problem_title?: string | null;
    difficulty?: string | null;
    interview_type?: string | null;
  };
  created_at: string;
}

export async function submitProductFeedback(payload: {
  message: string;
  rating: number;
  interview_id?: string | null;
  extension_version: string;
  problem_slug?: string | null;
  problem_title?: string | null;
  difficulty?: string | null;
  interview_type?: InterviewType | null;
}): Promise<ProductFeedback> {
  const response = await authenticatedFetch(`${API_URL}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail ?? "Could not send feedback.");
  }
  return response.json();
}

export async function getProductFeedbackInbox(): Promise<ProductFeedback[]> {
  const response = await authenticatedFetch(`${API_URL}/admin/feedback`);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail ?? "Could not load feedback inbox.");
  }
  return response.json();
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

async function authenticatedFetch(url: string, init: RequestInit = {}): Promise<Response> {
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
    const detail = body?.detail;
    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail
              .map((item) => item?.msg)
              .filter(Boolean)
              .join(" ")
          : "";
    throw new Error(message || `Friend request failed (${response.status}).`);
  }
  return response.json();
}

export async function listFriendConnections(): Promise<AccountFriendConnection[]> {
  return friendResponse(await authenticatedFetch(`${API_URL}/friends`));
}

export async function addFriendByEmail(email: string): Promise<AccountFriendConnection[]> {
  return friendResponse(
    await authenticatedFetch(`${API_URL}/friends`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    }),
  );
}

export async function acceptFriendRequest(relationshipId: string): Promise<AccountFriendConnection[]> {
  return friendResponse(
    await authenticatedFetch(`${API_URL}/friends/${relationshipId}/accept`, {
      method: "POST",
    }),
  );
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

export async function createInterview(context: InterviewContext): Promise<Interview> {
  const response = await authenticatedFetch(`${API_URL}/interviews`, {
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
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);

    throw new Error(body?.detail ?? `Backend request failed with status ${response.status}`);
  }

  return response.json();
}

export async function submitInterviewAudio(
  interviewId: string,
  audio: Blob,
  voiceProvider: VoiceProviderId = "fish",
): Promise<InterviewTurnResponse> {
  const formData = new FormData();

  formData.append("audio", audio, `candidate-${Date.now()}.wav`);
  formData.append("voice_provider", voiceProvider);

  const response = await authenticatedFetch(`${API_URL}/interviews/${interviewId}/turns/audio`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);

    throw new Error(body?.detail ?? `Backend request failed with status ${response.status}`);
  }

  return response.json();
}

type ServerSentEvent = {
  event: string;
  data: unknown;
};

function parseServerSentEvent(block: string): ServerSentEvent | null {
  let event = "message";
  const dataLines: string[] = [];

  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (dataLines.length === 0) return null;
  const rawData = dataLines.join("\n");
  try {
    return { event, data: JSON.parse(rawData) };
  } catch {
    throw new Error("The live interview returned an invalid event.");
  }
}

function stringField(data: unknown, key: string): string {
  if (
    typeof data === "object" &&
    data !== null &&
    key in data &&
    typeof (data as Record<string, unknown>)[key] === "string"
  ) {
    return (data as Record<string, string>)[key];
  }
  return "";
}

function dispatchInterviewEvent(serverEvent: ServerSentEvent, handlers: InterviewStreamHandlers): boolean {
  const { event, data } = serverEvent;
  const phase = stringField(data, "phase") as InterviewPhase;

  switch (event) {
    case "status":
      handlers.onStatus?.(stringField(data, "stage") as InterviewStreamStage);
      break;
    case "transcript":
      handlers.onTranscript?.(stringField(data, "text"), phase);
      break;
    case "assistant_delta":
      handlers.onAssistantDelta?.(stringField(data, "text"));
      break;
    case "assistant_done":
      handlers.onAssistantDone?.(stringField(data, "text"), phase);
      break;
    case "audio":
      handlers.onAudio?.(stringField(data, "base64"), stringField(data, "content_type"));
      break;
    case "notice":
      handlers.onNotice?.(stringField(data, "message"));
      break;
    case "error":
      throw new Error(stringField(data, "message") || "The live interview could not finish this response.");
    case "done": {
      const notice = stringField(data, "service_notice") || null;
      handlers.onDone?.(phase, notice);
      return true;
    }
  }
  return false;
}

export async function submitInterviewAudioStream(
  interviewId: string,
  audio: Blob,
  handlers: InterviewStreamHandlers,
  signal?: AbortSignal,
  voiceProvider: VoiceProviderId = "fish",
): Promise<void> {
  const formData = new FormData();
  formData.append("audio", audio, `candidate-${Date.now()}.wav`);
  formData.append("voice_provider", voiceProvider);

  const response = await authenticatedFetch(`${API_URL}/interviews/${interviewId}/turns/audio/stream`, {
    method: "POST",
    body: formData,
    headers: { Accept: "text/event-stream" },
    signal,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    if ([404, 405, 406, 501].includes(response.status)) {
      throw new InterviewStreamUnavailableError(body?.detail ?? "Live interview streaming is unavailable.");
    }
    throw new Error(body?.detail ?? `Backend request failed with status ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("text/event-stream") || !response.body) {
    throw new InterviewStreamUnavailableError();
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = false;

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });

    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      const parsed = parseServerSentEvent(block);
      if (parsed) completed = dispatchInterviewEvent(parsed, handlers) || completed;
    }
    if (done) break;
  }

  if (buffer.trim()) {
    const parsed = parseServerSentEvent(buffer);
    if (parsed) completed = dispatchInterviewEvent(parsed, handlers) || completed;
  }
  if (!completed) {
    throw new Error("The live interview stream ended before completion.");
  }
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

export async function completeInterview(interviewId: string, durationSeconds: number): Promise<InterviewAssessment> {
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
