from dataclasses import dataclass


@dataclass(frozen=True)
class CompanyVoiceProfile:
    company_id: str
    company_name: str
    voice_name: str
    voice_gender: str
    reference_id: str
    interview_style: str


# Public, neutral English Fish Audio library models selected for professional
# characteristics. These IDs are server-owned and never accepted from clients.
COMPANY_VOICE_PROFILES: dict[str, CompanyVoiceProfile] = {
    "google": CompanyVoiceProfile(
        "google", "Google", "Developer default", "configured", "536d3a5e000945adb7038665781a4aca",
        "Probe decomposition, correctness, complexity, and edge cases.",
    ),
    "amazon": CompanyVoiceProfile(
        "amazon", "Amazon", "Jordan", "male", "79d0bd3e4e5444b18f7b6d89b5927bf1",
        "Ask for clear tradeoffs, ownership, testing, and concise behavioral evidence.",
    ),
    "meta": CompanyVoiceProfile(
        "meta", "Meta", "Paula", "female", "c2623f0c075b4492ac367989aee1576f",
        "Use a focused, measured pace and emphasize implementation clarity and completion.",
    ),
    "ibm": CompanyVoiceProfile(
        "ibm", "IBM", "Slax", "male", "c5f56a6cc2ec4fa8920cb4c5889a3fb7",
        "Emphasize fundamentals, maintainability, explanation, and practical tradeoffs.",
    ),
    "accenture": CompanyVoiceProfile(
        "accenture", "Accenture", "Laura", "female", "e3cd384158934cc9a01029cd7d278634",
        "Balance fundamentals, communication, implementation, and client-facing clarity.",
    ),
    "tcs": CompanyVoiceProfile(
        "tcs", "TCS", "Sarah", "female", "933563129e564b19a115bedd57b7406a",
        "Test core CS fundamentals, structured thinking, and implementation accuracy.",
    ),
    "hcltech": CompanyVoiceProfile(
        "hcltech", "HCLTech", "Adrian", "male", "bf322df2096a46f18c579d0baa36f41d",
        "Use a measured technical style focused on debugging and engineering fundamentals.",
    ),
    "american-express": CompanyVoiceProfile(
        "american-express", "American Express", "Hannah", "female", "9a9cf47702da476aa4629e2506d4a857",
        "Emphasize correctness, reliability, communication, and careful handling of edge cases.",
    ),
    "microsoft": CompanyVoiceProfile(
        "microsoft", "Microsoft", "Slax Host", "male", "9032b5f2e2554b5a957ad655c052af16",
        "Explore reasoning, collaboration, testing, and maintainable solution design.",
    ),
}


def company_voice_reference(company_id: str | None, google_override: str | None) -> str | None:
    if company_id == "google" and google_override:
        return google_override
    profile = COMPANY_VOICE_PROFILES.get(company_id or "")
    return profile.reference_id if profile else google_override


def company_interview_style(company_id: str | None) -> str:
    profile = COMPANY_VOICE_PROFILES.get(company_id or "")
    return profile.interview_style if profile else "Run a balanced software engineering interview."
