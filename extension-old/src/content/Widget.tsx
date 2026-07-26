import {
    useEffect,
    useRef,
    useState,
    type PointerEvent as ReactPointerEvent,
} from "react";

import type { Session } from "@supabase/supabase-js";

import { createInterview } from "../services/api-client";
import { supabase } from "../services/supabase";
import { LeetCodeAdapter } from "../platforms/leetcode";

type WidgetStatus = "idle" | "starting" | "running" | "error";

interface Position {
    x: number;
    y: number;
}

const adapter = new LeetCodeAdapter();

export default function Widget() {
    const [session, setSession] = useState<Session | null>(null);
    const [status, setStatus] = useState<WidgetStatus>("idle");
    const [settingsOpen, setSettingsOpen] = useState(false);

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);

    const [seconds, setSeconds] = useState(0);
    const [interviewId, setInterviewId] = useState<string | null>(null);

    const [position, setPosition] = useState<Position>({
        x: Math.max(20, window.innerWidth - 260),
        y: Math.max(100, window.innerHeight - 220),
    });

    const dragOffset = useRef<Position>({ x: 0, y: 0 });
    const dragging = useRef(false);

    useEffect(() => {
        void loadSession();

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, nextSession) => {
            setSession(nextSession);
        });

        return () => subscription.unsubscribe();
    }, []);

    useEffect(() => {
        if (status !== "running") {
            return;
        }

        const timer = window.setInterval(() => {
            setSeconds((value) => value + 1);
        }, 1000);

        return () => window.clearInterval(timer);
    }, [status]);

    async function loadSession(): Promise<void> {
        const {
            data: { session: currentSession },
        } = await supabase.auth.getSession();

        setSession(currentSession);
    }

    async function signIn(): Promise<void> {
        setError(null);

        if (!email.trim() || !password) {
            setError("Enter email and password.");
            return;
        }

        const { error: signInError } =
            await supabase.auth.signInWithPassword({
                email: email.trim(),
                password,
            });

        if (signInError) {
            setError(signInError.message);
            return;
        }

        setPassword("");
    }

    async function signOut(): Promise<void> {
        await supabase.auth.signOut();

        setStatus("idle");
        setSeconds(0);
        setInterviewId(null);
    }

    async function startInterview(): Promise<void> {
        setError(null);

        if (!session) {
            setSettingsOpen(true);
            setError("Sign in first.");
            return;
        }

        if (!adapter.isSupportedPage()) {
            setError("Open a LeetCode problem page.");
            return;
        }

        try {
            setStatus("starting");

            const context = adapter.getContext();
            const interview = await createInterview(context);

            setInterviewId(interview.id);
            setSeconds(0);
            setStatus("running");
        } catch (requestError) {
            setStatus("error");

            setError(
                requestError instanceof Error
                    ? requestError.message
                    : "Unable to start interview.",
            );
        }
    }

    function endInterview(): void {
        setStatus("idle");
        setSeconds(0);
        setInterviewId(null);
    }

    function formatTime(value: number): string {
        const minutes = Math.floor(value / 60);
        const remainingSeconds = value % 60;

        return `${String(minutes).padStart(2, "0")}:${String(
            remainingSeconds,
        ).padStart(2, "0")}`;
    }

    function handlePointerDown(
        event: ReactPointerEvent<HTMLDivElement>,
    ): void {
        const target = event.target as HTMLElement;

        if (target.closest("button") || target.closest("input")) {
            return;
        }

        dragging.current = true;

        dragOffset.current = {
            x: event.clientX - position.x,
            y: event.clientY - position.y,
        };

        event.currentTarget.setPointerCapture(event.pointerId);
    }

    function handlePointerMove(
        event: ReactPointerEvent<HTMLDivElement>,
    ): void {
        if (!dragging.current) {
            return;
        }

        const nextX = Math.max(
            8,
            Math.min(
                window.innerWidth - 230,
                event.clientX - dragOffset.current.x,
            ),
        );

        const nextY = Math.max(
            8,
            Math.min(
                window.innerHeight - 150,
                event.clientY - dragOffset.current.y,
            ),
        );

        setPosition({
            x: nextX,
            y: nextY,
        });
    }

    function handlePointerUp(
        event: ReactPointerEvent<HTMLDivElement>,
    ): void {
        dragging.current = false;

        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
    }

    const isRunning = status === "running";
    const isStarting = status === "starting";

    return (
        <div
            className="leetally-shell"
            style={{
                left: `${position.x}px`,
                top: `${position.y}px`,
            }}
        >
            {settingsOpen && (
                <section className="leetally-panel">
                    <div className="leetally-panel-header">
                        <span>LeetAlly</span>

                        <button
                            type="button"
                            className="leetally-close"
                            onClick={() => setSettingsOpen(false)}
                        >
                            ×
                        </button>
                    </div>

                    {error && (
                        <div className="leetally-error">
                            {error}
                        </div>
                    )}

                    {!session ? (
                        <>
                            <input
                                className="leetally-input"
                                type="email"
                                placeholder="Email"
                                value={email}
                                onChange={(event) => {
                                    setEmail(event.target.value);
                                }}
                            />

                            <input
                                className="leetally-input"
                                type="password"
                                placeholder="Password"
                                value={password}
                                onChange={(event) => {
                                    setPassword(event.target.value);
                                }}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                        void signIn();
                                    }
                                }}
                            />

                            <button
                                type="button"
                                className="leetally-login"
                                onClick={() => {
                                    void signIn();
                                }}
                            >
                                Sign in
                            </button>
                        </>
                    ) : (
                        <>
                            <div className="leetally-account">
                                {session.user.email}
                            </div>

                            {interviewId && (
                                <div className="leetally-session">
                                    Session {interviewId.slice(0, 8)}
                                </div>
                            )}

                            <button
                                type="button"
                                className="leetally-logout"
                                disabled={isRunning}
                                onClick={() => {
                                    void signOut();
                                }}
                            >
                                Logout
                            </button>
                        </>
                    )}
                </section>
            )}

            <div
                className={`leetally-duck ${isRunning ? "active" : ""}`}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
            >
                <div className="leetally-beak" />
                <div className="leetally-eye leetally-eye-left" />
                <div className="leetally-eye leetally-eye-right" />
                <div className="leetally-wing" />
            </div>

            <div className="leetally-controls">
                {!isRunning ? (
                    <button
                        type="button"
                        className="leetally-circle-button"
                        disabled={isStarting}
                        title="Start interview"
                        onClick={() => {
                            void startInterview();
                        }}
                    >
                        {isStarting ? "…" : "▶"}
                    </button>
                ) : (
                    <button
                        type="button"
                        className="leetally-circle-button leetally-end-button"
                        title="End interview"
                        onClick={endInterview}
                    >
                        ■
                    </button>
                )}

                <div className="leetally-time">
                    {formatTime(seconds)}
                </div>

                <button
                    type="button"
                    className="leetally-circle-button"
                    title="Settings"
                    onClick={() => {
                        setSettingsOpen((value) => !value);
                    }}
                >
                    ⚙
                </button>
            </div>
        </div>
    );
}