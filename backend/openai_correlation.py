# openai_correlation.py
import os
import json
import re
import time
from typing import Optional, Dict, Any, List
from urllib.parse import urlparse
from openai import APIError, OpenAI

# ==========================
# Configuration
# ==========================
# model can be overridden via env CORRELATION_MODEL (used as first preference)
MODEL = os.getenv("CORRELATION_MODEL", "tngtech/deepseek-r1t2-chimera:free")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://openrouter.ai/api/v1")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")  # optional: can be provided via env or MongoDB

# Backend selection: "openrouter", "local_flan" or "auto" (preferred default)
# If CORRELATION_BACKEND is not set, we use automatic detection with local_flan
# preferred when available, otherwise openrouter.
CORRELATION_BACKEND = os.getenv("CORRELATION_BACKEND", "auto").lower()
LOCAL_FLAN_MODEL = os.getenv("LOCAL_CORRELATION_MODEL", "google/flan-t5-small")

# Timeout / retry config
MAX_RETRIES = 3
INITIAL_BACKOFF = 0.8  # seconds
BACKOFF_FACTOR = 2.0

# Ordered list of preferred OpenRouter models for correlation.
# We will try the preferred model first (UI/env), then fall back through this list.
OPENROUTER_MODEL_PRIORITY: List[str] = [
    "nex-agi/deepseek-v3.1-nex-n1:free",
    "tngtech/deepseek-r1t2-chimera:free",
    "tngtech/deepseek-r1t-chimera:free",
    "deepseek/deepseek-r1-0528:free",
    "openai/gpt-oss-20b:free",
    "openai/gpt-oss-120b:free",
]

# Safety keywords used to detect OSINT-related custom prompts
SAFE_KEYWORDS = {
    "osint", "correlation", "profile", "user", "social media", "github",
    "twitter", "reddit", "account", "username", "analysis", "breach", "compromise",
    "leak", "email", "repository", "repos", "post", "posts", "timeline", "timeline"
}

# ==========================
# Optional local FLAN model (lazy-loaded)
# ==========================
_flan_tokenizer = None
_flan_model = None


def _ensure_flan_loaded():
    """Load flan-t5-small (or configured LOCAL_FLAN_MODEL) lazily when local backend is used."""
    global _flan_tokenizer, _flan_model
    if _flan_tokenizer is not None and _flan_model is not None:
        return

    from transformers import AutoTokenizer, AutoModelForSeq2SeqLM

    _flan_tokenizer = AutoTokenizer.from_pretrained(LOCAL_FLAN_MODEL)
    _flan_model = AutoModelForSeq2SeqLM.from_pretrained(LOCAL_FLAN_MODEL)


def _call_local_flan(prompt: str, max_new_tokens: int = 1024) -> str:
    """Generate a response using a local FLAN model instead of OpenRouter."""
    _ensure_flan_loaded()

    import torch

    inputs = _flan_tokenizer(
        prompt,
        return_tensors="pt",
        truncation=True,
        max_length=1024,
    )

    with torch.no_grad():
        outputs = _flan_model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            do_sample=False,
            num_beams=3,
            length_penalty=0.9,
        )

    return _flan_tokenizer.decode(outputs[0], skip_special_tokens=True)


def _build_structured_from_flan(cleaned: str) -> Dict[str, Any]:
    """Heuristically build a minimal structured correlation result from free-form FLAN text.

    This is used when FLAN does not return strict JSON. We try to extract:
    - name (from a "title" field if present)
    - primary profile link (LinkedIn/GitHub/Twitter/Reddit/YouTube) from the first URL
    and always include a summary + compromised flag.
    """
    result: Dict[str, Any] = {
        "summary": cleaned,
        "compromised": False,
    }

    # Extract first URL
    url_match = re.search(r"https?://\S+", cleaned)
    url = url_match.group(0).rstrip('"') if url_match else None

    # Map URL host to platform key
    platform = None
    if url:
        lower = url.lower()
        if "linkedin.com" in lower:
            platform = "linkedin"
        elif "github.com" in lower:
            platform = "github"
        elif "twitter.com" in lower or "x.com" in lower:
            platform = "twitter"
        elif "reddit.com" in lower:
            platform = "reddit"
        elif "youtube.com" in lower or "youtu.be" in lower:
            platform = "youtube"

    if url and platform:
        result["links"] = {platform: url}

    # Try to extract a title -> use as name
    # Pattern like: "title": "Muhammad Munib Nawaz - Cyber Security - LinkedIn"
    title_match = re.search(r'"title"\s*:\s*"([^"]+)"', cleaned)
    if title_match:
        title = title_match.group(1)
        # Use the part before first dash as name if present
        name_part = title.split("-")[0].strip()
        if name_part:
            result["name"] = name_part

    return result


def detect_backends(mongo_uri: str = "mongodb://localhost:27017/") -> Dict[str, Dict[str, bool]]:
    """Return a simple capability map for available correlation backends.

    - local_flan: True when transformers/torch can be imported (weights may still need download).
    - openrouter: True when an API key is available via env or MongoDB.
    """
    # local_flan: check if dependencies are importable (do not force model download here)
    local_ok = False
    try:
        import transformers  # noqa: F401
        import torch  # noqa: F401
        local_ok = True
    except Exception:
        local_ok = False

    # openrouter: check if we can obtain an API key
    remote_ok = bool(get_openrouter_key_from_db(mongo_uri=mongo_uri))

    return {
        "local_flan": {"configured": local_ok},
        "openrouter": {"configured": remote_ok},
    }


def choose_backend(preferred: Optional[str] = None, mongo_uri: str = "mongodb://localhost:27017/") -> Optional[str]:
    """Decide which backend to use.

    Priority:
    1. Explicit preferred argument (if configured).
    2. CORRELATION_BACKEND env (if not "auto" and configured).
    3. Auto: prefer local_flan if available, else openrouter, else None.
    """
    status = detect_backends(mongo_uri=mongo_uri)

    def is_configured(name: str) -> bool:
        return bool(status.get(name, {}).get("configured"))

    # 1) Explicit per-call preference
    if preferred and preferred != "auto" and is_configured(preferred):
        return preferred

    # 2) Environment preference (backwards compatible)
    env_choice = CORRELATION_BACKEND
    if env_choice and env_choice != "auto" and is_configured(env_choice):
        return env_choice

    # 3) Automatic: prefer local, else remote
    if is_configured("local_flan"):
        return "local_flan"
    if is_configured("openrouter"):
        return "openrouter"

    return None

# ==========================
# Helper: obtain API key (env OR from MongoDB)
# ==========================
def get_openrouter_key_from_db(mongo_uri: str = "mongodb://localhost:27017/") -> Optional[str]:
    """Try environment first, then fall back to reading `openRouter` from the `api_keys` collection."""
    # Prefer explicit env var
    if OPENAI_API_KEY:
        return OPENAI_API_KEY

    try:
        from pymongo import MongoClient
        client = MongoClient(mongo_uri)
        settings_db = client["settings_db"]
        api_collection = settings_db["api_keys"]
        doc = api_collection.find_one() or {}
        return doc.get("openRouter") or doc.get("openrouter")
    except Exception:
        return None

# ==========================
# Utility: load OSINT JSON files
# (kept minimal — same as your current approach)
# ==========================
def load_osint_files(folder_path: str = "osint_results") -> str:
    """Return a JSON string containing all files found in folder_path"""
    all_data = []
    if not os.path.exists(folder_path):
        return json.dumps([])

    for filename in sorted(os.listdir(folder_path)):
        if filename.endswith(".json"):
            file_path = os.path.join(folder_path, filename)
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    all_data.append(json.load(f))
            except Exception as e:
                # keep going — skip corrupted files
                print(f"[WARN] Skipping corrupted file: {filename} ({e})")

    return json.dumps(all_data, indent=2)

# ==========================
# Helpers: prompt building and safety checks
# ==========================

# Canonical correlation schema description used in prompts.
SCHEMA_DESCRIPTION = """
The JSON object MUST use exactly the following top-level schema:
- "name": string or null – real name or primary identifier.
- "profile_type": string or null – short label such as "developer", "influencer", "executive", "organization", "researcher", or "individual".
- "about": string or null – 1–3 sentence description of who this profile appears to be.
- "usernames": object – keys are platform names (github, twitter, reddit, linkedin, etc.) and values are objects of the form {"handle": string or null, "url": string or null, "bio": string or null}.
- "bio": string or null – concise primary bio text if available.
- "emails": array of strings – unique email addresses or empty array.
- "primary_location": string or null – city/country or best-effort location.
- "posts": array of objects – each with {"platform": string or null, "title": string or null, "url": string or null, "date": string or null, "metrics": object or null}.
- "repositories": array of objects – each with {"name": string or null, "url": string or null, "description": string or null, "language": string or null, "stars": integer or null, "forks": integer or null, "last_updated": string or null}.
- "activity_patterns": string or null – short summary of observed posting or coding behaviour.
- "possible_interests": array of strings – topics, technologies, or communities inferred from data.
- "relationship_graph": array of objects – each with {"username": string or null, "platform": string or null, "type": string or null, "url": string or null}.
- "behavioral_anomalies": array of strings – unusual patterns, red flags, or anomalies.
- "key_timelines": array of strings – important dated events in free-text form.
- "links": object – keys are labels (github, twitter, linkedin, website, etc.) and values are URL strings.
- "compromised": boolean – true if there is credible evidence of compromise, otherwise false.
- "summary": string or null – machine-friendly one-paragraph summary of the profile.
- "llm_analysis": string or null – optional longer narrative; may be null.

Rules:
- Do NOT add or remove top-level keys. Always include all of them.
- When you have no confident value for a field, set it to null (for strings) or an empty array/object of the correct type.
- The output must be a single JSON object compatible with Python json.loads(), with no text before or after it.
"""


def is_osint_prompt(text: str, threshold: int = 1) -> bool:
    """Return True if the custom prompt contains at least `threshold` safe keywords."""
    if not text:
        return False
    lower = text.lower()
    found = sum(1 for kw in SAFE_KEYWORDS if kw in lower)
    return found >= threshold


def build_prompt(mode: str, osint_data: str, custom_prompt: str = "") -> str:
    """Return the final prompt string to send to the LLM.

    Strict instructions: ONLY output valid JSON parseable by Python's json.loads(),
    using the canonical ShadowHorn correlation schema.
    """
    # Base instruction that applies to all modes
    base_instruction = f"""
You are the ShadowHorn OSINT & Threat Intelligence AI assistant.
Your job is to analyze the provided OSINT JSON data and output a single VALID JSON object (no prose, no markdown, no code fences).
The JSON must be parseable by Python's json.loads() — return only the JSON object.

Context:
- The input is OSINT data collected from multiple sources (social media, code repos, breach lookups).
- Produce structured intelligence suitable for automated reports and downstream processing.
- Use the exact correlation schema described below so downstream systems can rely on it.
- If a user appears compromised and it is not a clear false positive, set "compromised": true; otherwise set "compromised": false.
- Always include links to supporting evidence where available.
- Include platform-level details (GitHub repos, Twitter posts, Reddit posts) when present.
- Include a short machine-friendly summary field named "summary".

Required JSON schema:
{SCHEMA_DESCRIPTION}

OSINT data:
{osint_data}
"""

    # Mode-specific additions
    if mode == "fast":
        addition = """
Mode: FAST correlation.
Instructions:
- Prioritize speed and high-confidence, easy-to-derive signals.
- At minimum, fill these fields as well as possible: name, profile_type, about, usernames, emails, primary_location, links, compromised, summary.
- For remaining fields you may leave them null or empty if data is not obvious, but the keys MUST still exist.
- Keep the output compact but fully valid JSON using the required schema.
"""
        return base_instruction + addition

    if mode == "deep":
        addition = """
Mode: DEEP correlation.
Instructions:
- Perform comprehensive correlation across all available platform data.
- Populate as many fields in the required schema as possible, including:
  identity (name, profile_type, about, primary_location),
  usernames and links across platforms,
  detailed posts and repositories,
  activity_patterns, possible_interests, relationship_graph, behavioral_anomalies, key_timelines,
  compromise assessment and a high-quality summary and llm_analysis.
- Output complete JSON only. Do not include any text outside the JSON object.
"""
        return base_instruction + addition

    # Self mode: enforce OSINT-related prompt, otherwise return explicit error instructing user
    if mode == "self":
        # If user-supplied prompt isn't clearly OSINT-related, return early instructions (the caller will treat it as an error)
        if not custom_prompt or not is_osint_prompt(custom_prompt):
            # Return a special response that the caller can detect
            # We intentionally instruct the model to return a tiny JSON with an error message
            return json.dumps({
                "error": "Invalid custom prompt. For self mode, provide an OSINT-related instruction (e.g., 'Correlate GitHub, Twitter and Reddit for user X and list repos, posts, links, and compromised indicators')."
            })
        addition = f"""
Mode: SELF-defined correlation (user instruction).
User instruction:
{custom_prompt}

Instructions:
- Follow the user's OSINT-related intent, but ALWAYS use the exact JSON schema described above.
- Do not change top-level key names or types; fill them as best as possible from the data.
- Output a valid JSON object only, parseable by Python.
"""
        return base_instruction + addition

    # fallback
    return base_instruction + "\nInstructions: Output valid JSON only using the required schema."


# ==========================
# DEEP CLEAN: Platform-by-platform data extraction
# ==========================

# Prompts for cleaning each platform's data
PLATFORM_CLEAN_PROMPTS = {
    "github": """Extract all structured information from this GitHub data and return as JSON:
{
  "username": "string",
  "name": "string or null",
  "bio": "string or null",
  "email": "string or null", 
  "location": "string or null",
  "company": "string or null",
  "website": "string or null",
  "created_at": "date string or null",
  "followers_count": number,
  "following_count": number,
  "public_repos_count": number,
  "repositories": [{"name": "string", "description": "string", "stars": number, "forks": number, "language": "string", "url": "string", "updated_at": "string"}],
  "top_languages": ["string"],
  "organizations": ["string"],
  "followers_sample": [{"username": "string", "url": "string"}],
  "following_sample": [{"username": "string", "url": "string"}],
  "profile_url": "string"
}
Extract as much as possible. Return only valid JSON.""",

    "twitter": """Extract all structured information from this Twitter/X data and return as JSON:
{
  "username": "string",
  "name": "string or null",
  "bio": "string or null",
  "location": "string or null",
  "website": "string or null",
  "created_at": "date string or null",
  "followers_count": number,
  "following_count": number,
  "tweets_count": number,
  "verified": boolean,
  "recent_tweets": [{"text": "string", "date": "string", "likes": number, "retweets": number, "url": "string"}],
  "hashtags_used": ["string"],
  "mentions": ["string"],
  "profile_url": "string"
}
Extract as much as possible. Return only valid JSON.""",

    "reddit": """Extract all structured information from this Reddit data and return as JSON:
{
  "username": "string",
  "karma_post": number,
  "karma_comment": number,
  "created_at": "date string or null",
  "verified_email": boolean,
  "subreddits_active": ["string"],
  "recent_posts": [{"title": "string", "subreddit": "string", "score": number, "url": "string", "date": "string"}],
  "recent_comments": [{"text": "string", "subreddit": "string", "score": number, "date": "string"}],
  "profile_url": "string"
}
Extract as much as possible. Return only valid JSON.""",

    "snapchat": """Extract all structured information from this Snapchat data and return as JSON:
{
  "username": "string",
  "display_name": "string or null",
  "bio": "string or null",
  "location": "string or null",
  "follower_count": number or null,
  "verified": boolean,
  "interests": ["string"],
  "external_sites": ["string"],
  "spotlight_videos": [{"title": "string", "url": "string", "views": number, "likes": number}],
  "profile_url": "string"
}
Extract as much as possible. Return only valid JSON.""",

    "stackoverflow": """Extract all structured information from this StackOverflow data and return as JSON:
{
  "username": "string",
  "user_id": number,
  "location": "string or null",
  "website": "string or null",
  "reputation": number,
  "badges": {"gold": number, "silver": number, "bronze": number},
  "top_tags": [{"name": "string", "answer_count": number, "question_count": number}],
  "created_at": "date string or null",
  "profile_url": "string"
}
Extract as much as possible. Return only valid JSON.""",

    "linkedin": """Extract all structured information from this LinkedIn data and return as JSON:
{
  "username": "string or null",
  "name": "string",
  "headline": "string or null",
  "location": "string or null",
  "about": "string or null",
  "current_company": "string or null",
  "current_position": "string or null",
  "experience": [{"title": "string", "company": "string", "duration": "string"}],
  "education": [{"school": "string", "degree": "string", "field": "string"}],
  "skills": ["string"],
  "certifications": ["string"],
  "profile_url": "string"
}
Extract as much as possible. Return only valid JSON.""",

    "profile_osint": """Extract all structured information from this profile/OSINT data and return as JSON:
{
  "emails_found": ["string"],
  "usernames_found": ["string"],
  "names_found": ["string"],
  "locations_found": ["string"],
  "phones_found": ["string"],
  "social_profiles": [{"platform": "string", "url": "string", "username": "string"}],
  "websites": ["string"],
  "other_info": ["string"]
}
Extract as much as possible. Return only valid JSON.""",

    "search_engines": """Extract all structured information from this search engine results and return as JSON:
{
  "total_results": number,
  "notable_links": [{"title": "string", "url": "string", "snippet": "string", "source": "string"}],
  "social_profiles_found": [{"platform": "string", "url": "string"}],
  "news_mentions": [{"title": "string", "url": "string", "date": "string"}],
  "other_appearances": ["string"]
}
Extract as much as possible. Return only valid JSON.""",

    "breachdirectory": """Extract all structured information from this breach data and return as JSON:
{
  "email_searched": "string",
  "found_in_breaches": boolean,
  "breaches": [{"source": "string", "date": "string", "data_types": ["string"]}],
  "passwords_exposed": boolean,
  "total_breach_count": number
}
Extract as much as possible. Return only valid JSON.""",

    "compromise": """Extract all structured information from this compromise check data and return as JSON:
{
  "identifier_checked": "string",
  "is_compromised": boolean,
  "breach_sources": ["string"],
  "exposed_data_types": ["string"],
  "last_breach_date": "string or null",
  "risk_level": "string (low/medium/high/critical)"
}
Extract as much as possible. Return only valid JSON.""",
}


def _clean_single_platform(
    platform: str,
    raw_data: Any,
    mongo_uri: str = "mongodb://localhost:27017/",
    preferred_model: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Clean/extract structured data from a single platform's raw OSINT using LLM.
    Returns the cleaned structured data or an error dict.
    """
    # Get the cleaning prompt for this platform
    base_prompt = PLATFORM_CLEAN_PROMPTS.get(platform, PLATFORM_CLEAN_PROMPTS.get("profile_osint"))
    
    # Prepare the data as JSON string (truncate if too long)
    try:
        data_str = json.dumps(raw_data, indent=2, default=str)
        # Limit to ~15000 chars to avoid token limits
        if len(data_str) > 15000:
            data_str = data_str[:15000] + "\n... [truncated]"
    except Exception:
        data_str = str(raw_data)[:15000]
    
    full_prompt = f"{base_prompt}\n\nRAW DATA:\n{data_str}"
    
    # Try to use OpenRouter for cleaning (better results)
    api_key = get_openrouter_key_from_db(mongo_uri)
    if not api_key:
        # Fall back to rule-based extraction
        return {"error": "No API key available", "raw_preserved": raw_data}
    
    client = OpenAI(base_url=OPENAI_BASE_URL, api_key=api_key)
    models_to_try = _build_openrouter_model_list(preferred_model)
    
    for model_id in models_to_try[:3]:  # Try up to 3 models
        try:
            resp = client.chat.completions.create(
                model=model_id,
                messages=[{"role": "user", "content": full_prompt}],
                temperature=0.1,  # Low temperature for structured extraction
            )
            raw_content = resp.choices[0].message.content
            cleaned = clean_model_text(raw_content)
            
            try:
                parsed = json.loads(cleaned)
                parsed["_cleaned_by"] = model_id
                parsed["_platform"] = platform
                return parsed
            except json.JSONDecodeError:
                continue
        except Exception as e:
            continue
    
    # If all models fail, return raw data preserved
    return {"error": "Failed to clean data", "raw_preserved": raw_data, "_platform": platform}


def _correlate_cleaned_data(cleaned_results: List[Dict[str, Any]], identifier: str) -> Dict[str, Any]:
    """
    Correlate cleaned/structured platform data into a unified profile.
    This function understands the cleaned data format from _clean_single_platform.
    """
    base_profile: Dict[str, Any] = {
        "name": identifier or "",
        "profile_type": None,
        "about": None,
        "usernames": {},
        "bio": "",
        "emails": [],
        "primary_location": "",
        "posts": [],
        "repositories": [],
        "activity_patterns": "",
        "possible_interests": [],
        "relationship_graph": [],
        "behavioral_anomalies": [],
        "key_timelines": [],
        "links": {},
        "compromised": False,
        "summary": "",
        "llm_analysis": None,
    }
    
    emails = set()
    interests = set()
    links: Dict[str, str] = {}
    posts: List[Dict] = []
    repos: List[Dict] = []
    key_events: List[tuple] = []
    locations_found: List[str] = []
    names_found: List[str] = []
    bios_found: List[str] = []
    compromised = False
    compromise_notes: List[str] = []
    
    for entry in cleaned_results:
        platform = (entry.get("collection") or entry.get("platform") or "").lower()
        data = entry.get("data") or entry.get("cleaned_data") or {}
        
        if data.get("error"):
            continue  # Skip failed cleanings
        
        # ========== GITHUB ==========
        if platform == "github":
            if data.get("name"):
                names_found.append(data["name"])
            if data.get("username"):
                base_profile["usernames"]["github"] = {
                    "handle": data["username"],
                    "url": data.get("profile_url") or f"https://github.com/{data['username']}",
                }
                links["github"] = data.get("profile_url") or f"https://github.com/{data['username']}"
            if data.get("bio"):
                bios_found.append(data["bio"])
            if data.get("email"):
                emails.add(data["email"])
            if data.get("location"):
                locations_found.append(data["location"])
            if data.get("website"):
                links.setdefault("website", data["website"])
            if data.get("company"):
                interests.add(f"Works at {data['company']}")
            if data.get("created_at"):
                key_events.append((data["created_at"], "GitHub account created"))
            
            # Repositories
            for repo in data.get("repositories") or []:
                repos.append({
                    "name": repo.get("name"),
                    "url": repo.get("url"),
                    "description": repo.get("description"),
                    "stars": repo.get("stars"),
                    "forks": repo.get("forks"),
                    "language": repo.get("language"),
                })
            
            # Languages as interests
            for lang in data.get("top_languages") or []:
                interests.add(f"Programming: {lang}")
            
            # Organizations
            for org in data.get("organizations") or []:
                interests.add(f"GitHub Org: {org}")
            
            # Followers/Following as relationships
            for f in data.get("followers_sample") or []:
                base_profile["relationship_graph"].append({
                    "username": f.get("username"),
                    "platform": "GitHub",
                    "type": "follower",
                    "url": f.get("url"),
                })
            for f in data.get("following_sample") or []:
                base_profile["relationship_graph"].append({
                    "username": f.get("username"),
                    "platform": "GitHub",
                    "type": "following",
                    "url": f.get("url"),
                })
        
        # ========== TWITTER ==========
        elif platform == "twitter":
            if data.get("name"):
                names_found.append(data["name"])
            if data.get("username"):
                url = f"https://twitter.com/{data['username']}"
                base_profile["usernames"]["twitter"] = {"handle": data["username"], "url": url}
                links["twitter"] = url
            if data.get("bio"):
                bios_found.append(data["bio"])
            if data.get("location"):
                locations_found.append(data["location"])
            if data.get("website"):
                links.setdefault("website", data["website"])
            if data.get("created_at"):
                key_events.append((data["created_at"], "Twitter account created"))
            if data.get("verified"):
                interests.add("Verified Twitter account")
            
            # Activity metrics
            followers = data.get("followers_count", 0)
            if followers:
                interests.add(f"Twitter: {followers:,} followers")
            
            # Tweets as posts
            for tweet in data.get("recent_tweets") or []:
                posts.append({
                    "platform": "Twitter",
                    "title": (tweet.get("text") or "")[:120],
                    "url": tweet.get("url"),
                    "date": tweet.get("date"),
                    "metrics": {"likes": tweet.get("likes"), "retweets": tweet.get("retweets")},
                })
            
            # Hashtags as interests
            for tag in data.get("hashtags_used") or []:
                interests.add(f"#{tag}")
        
        # ========== REDDIT ==========
        elif platform == "reddit":
            if data.get("username"):
                url = f"https://reddit.com/user/{data['username']}"
                base_profile["usernames"]["reddit"] = {"handle": data["username"], "url": url}
                links["reddit"] = url
            if data.get("created_at"):
                key_events.append((data["created_at"], "Reddit account created"))
            
            # Karma as activity indicator
            karma = (data.get("karma_post") or 0) + (data.get("karma_comment") or 0)
            if karma:
                interests.add(f"Reddit karma: {karma:,}")
            
            # Subreddits as interests
            for sub in data.get("subreddits_active") or []:
                interests.add(f"r/{sub}")
            
            # Posts
            for post in data.get("recent_posts") or []:
                posts.append({
                    "platform": "Reddit",
                    "title": post.get("title"),
                    "url": post.get("url"),
                    "date": post.get("date"),
                    "metrics": {"score": post.get("score"), "subreddit": post.get("subreddit")},
                })
            
            # Comments as posts
            for comment in data.get("recent_comments") or []:
                posts.append({
                    "platform": "Reddit",
                    "title": (comment.get("text") or "")[:100],
                    "date": comment.get("date"),
                    "metrics": {"score": comment.get("score"), "subreddit": comment.get("subreddit")},
                })
        
        # ========== SNAPCHAT ==========
        elif platform == "snapchat":
            if data.get("display_name"):
                names_found.append(data["display_name"])
            if data.get("username"):
                url = f"https://www.snapchat.com/add/{data['username']}"
                base_profile["usernames"]["snapchat"] = {"handle": data["username"], "url": url}
                links["snapchat"] = url
            if data.get("bio"):
                bios_found.append(data["bio"])
            if data.get("location"):
                locations_found.append(data["location"])
            if data.get("verified"):
                interests.add("Verified Snapchat account")
            
            # Follower count
            if data.get("follower_count"):
                interests.add(f"Snapchat: {data['follower_count']:,} followers")
            
            # Interests
            for interest in data.get("interests") or []:
                interests.add(interest)
            
            # External sites
            for site in data.get("external_sites") or []:
                if site and "website" not in links:
                    links["website"] = site if site.startswith("http") else f"https://{site}"
            
            # Spotlight videos as posts
            for video in data.get("spotlight_videos") or []:
                posts.append({
                    "platform": "Snapchat",
                    "title": video.get("title") or "Spotlight Video",
                    "url": video.get("url"),
                    "metrics": {"views": video.get("views"), "likes": video.get("likes")},
                })
            
            # Highlights as posts
            for highlight in data.get("highlights") or []:
                posts.append({
                    "platform": "Snapchat",
                    "title": highlight.get("title") or highlight.get("name") or "Story Highlight",
                    "url": highlight.get("url"),
                    "date": highlight.get("date") or highlight.get("created_at"),
                })
            
            # Stories as posts
            for story in data.get("stories") or []:
                posts.append({
                    "platform": "Snapchat",
                    "title": story.get("title") or "Story",
                    "url": story.get("url"),
                    "date": story.get("date") or story.get("posted_at"),
                    "metrics": {"views": story.get("views")},
                })
            
            # Public stories
            for story in data.get("public_stories") or []:
                posts.append({
                    "platform": "Snapchat",
                    "title": story.get("title") or "Public Story",
                    "url": story.get("url"),
                    "date": story.get("date"),
                })
        
        # ========== STACKOVERFLOW ==========
        elif platform == "stackoverflow":
            if data.get("username"):
                url = data.get("profile_url") or f"https://stackoverflow.com/users/{data.get('user_id')}"
                base_profile["usernames"]["stackoverflow"] = {"handle": data["username"], "url": url}
                links["stackoverflow"] = url
                if not names_found:
                    names_found.append(data["username"])
            if data.get("location"):
                locations_found.append(data["location"])
            if data.get("website"):
                links.setdefault("website", data["website"])
            if data.get("created_at"):
                key_events.append((data["created_at"], "StackOverflow account created"))
            
            # Reputation
            if data.get("reputation"):
                interests.add(f"StackOverflow: {data['reputation']:,} reputation")
            
            # Badges
            badges = data.get("badges") or {}
            if badges:
                interests.add(f"SO Badges: {badges.get('gold', 0)}🥇 {badges.get('silver', 0)}🥈 {badges.get('bronze', 0)}🥉")
            
            # Top tags as interests/skills
            for tag in data.get("top_tags") or []:
                tag_name = tag.get("name") if isinstance(tag, dict) else tag
                if tag_name:
                    interests.add(f"Tech: {tag_name}")
        
        # ========== LINKEDIN ==========
        elif platform == "linkedin":
            if data.get("name"):
                names_found.append(data["name"])
            if data.get("username"):
                url = f"https://linkedin.com/in/{data['username']}"
                base_profile["usernames"]["linkedin"] = {"handle": data["username"], "url": url}
                links["linkedin"] = url
            if data.get("headline"):
                bios_found.append(data["headline"])
            if data.get("about"):
                bios_found.append(data["about"])
            if data.get("location"):
                locations_found.append(data["location"])
            
            # Current position
            if data.get("current_company") and data.get("current_position"):
                interests.add(f"{data['current_position']} at {data['current_company']}")
            elif data.get("current_company"):
                interests.add(f"Works at {data['current_company']}")
            
            # Skills
            for skill in data.get("skills") or []:
                interests.add(f"Skill: {skill}")
            
            # Experience as timeline
            for exp in data.get("experience") or []:
                if exp.get("title") and exp.get("company"):
                    key_events.append((exp.get("duration") or "Past", f"{exp['title']} at {exp['company']}"))
            
            # Education
            for edu in data.get("education") or []:
                if edu.get("school"):
                    interests.add(f"Education: {edu['school']}")
        
        # ========== PROFILE OSINT ==========
        elif platform == "profile_osint":
            for email in data.get("emails_found") or []:
                emails.add(email)
            for name in data.get("names_found") or []:
                names_found.append(name)
            for loc in data.get("locations_found") or []:
                locations_found.append(loc)
            for profile in data.get("social_profiles") or []:
                plat = profile.get("platform", "").lower()
                if plat and profile.get("url"):
                    links.setdefault(plat, profile["url"])
                    if profile.get("username") and plat not in base_profile["usernames"]:
                        base_profile["usernames"][plat] = {"handle": profile["username"], "url": profile["url"]}
        
        # ========== SEARCH ENGINES ==========
        elif platform == "search_engines":
            for link in data.get("notable_links") or []:
                if link.get("title") and link.get("url"):
                    posts.append({
                        "platform": "Web",
                        "title": link["title"],
                        "url": link["url"],
                        "description": link.get("snippet"),
                    })
            for profile in data.get("social_profiles_found") or []:
                plat = profile.get("platform", "").lower()
                if plat and profile.get("url"):
                    links.setdefault(plat, profile["url"])
        
        # ========== BREACH DIRECTORY ==========
        elif platform == "breachdirectory":
            if data.get("found_in_breaches"):
                compromised = True
                for breach in data.get("breaches") or []:
                    source = breach.get("source") or "Unknown"
                    date = breach.get("date") or "Unknown date"
                    compromise_notes.append(f"Found in {source} breach ({date})")
                    key_events.append((date, f"Data breach: {source}"))
            if data.get("passwords_exposed"):
                compromise_notes.append("⚠️ Passwords exposed in breaches")
        
        # ========== COMPROMISE CHECK ==========
        elif platform == "compromise":
            if data.get("is_compromised"):
                compromised = True
                for source in data.get("breach_sources") or []:
                    compromise_notes.append(f"Compromised via: {source}")
                if data.get("risk_level"):
                    compromise_notes.append(f"Risk level: {data['risk_level'].upper()}")
    
    # ========== BUILD FINAL PROFILE ==========
    
    # Name: Use most common or first found
    if names_found:
        # Use the longest name (often most complete)
        base_profile["name"] = max(names_found, key=len)
    
    # Bio: Combine unique bios
    if bios_found:
        unique_bios = list(dict.fromkeys(bios_found))
        base_profile["bio"] = " | ".join(unique_bios[:3])
    
    # Location: Use first found
    if locations_found:
        base_profile["primary_location"] = locations_found[0]
    
    # Emails
    base_profile["emails"] = list(emails)
    
    # Links
    base_profile["links"] = links
    
    # Posts (deduplicate by title)
    seen_titles = set()
    unique_posts = []
    for post in posts:
        title = post.get("title") or ""
        if title and title not in seen_titles:
            seen_titles.add(title)
            unique_posts.append(post)
    base_profile["posts"] = unique_posts[:50]  # Limit to 50 posts
    
    # Repositories
    base_profile["repositories"] = repos
    
    # Interests (deduplicate and limit)
    base_profile["possible_interests"] = list(interests)[:30]
    
    # Key timelines
    key_events.sort(key=lambda x: x[0] if x[0] else "")
    base_profile["key_timelines"] = [f"{date}: {event}" for date, event in key_events[:20]]
    
    # Compromise status
    base_profile["compromised"] = compromised
    if compromise_notes:
        base_profile["behavioral_anomalies"] = compromise_notes
    
    # Profile type
    platform_count = len(base_profile["usernames"])
    if platform_count >= 4:
        base_profile["profile_type"] = "comprehensive"
    elif platform_count >= 2:
        base_profile["profile_type"] = "moderate"
    else:
        base_profile["profile_type"] = "limited"
    
    # About
    platforms_str = ", ".join(base_profile["usernames"].keys()) if base_profile["usernames"] else "unknown platforms"
    repo_count = len(repos)
    post_count = len(unique_posts)
    about_parts = [f"{base_profile['name']} is active on {platforms_str}"]
    if repo_count:
        about_parts.append(f"with {repo_count} repositories")
    if post_count:
        about_parts.append(f"and {post_count} posts/activities found")
    if base_profile["primary_location"]:
        about_parts.append(f"based in {base_profile['primary_location']}")
    base_profile["about"] = ". ".join(about_parts) + "."
    
    # Summary
    compromise_str = "COMPROMISED" if compromised else "NO"
    base_profile["summary"] = f"Profile: {base_profile['name']} | Platforms: {platform_count} | Repos: {repo_count} | Posts: {post_count} | Compromised: {compromise_str}"
    
    return base_profile


def run_deep_clean_correlation(
    identifier: str,
    mongo_uri: str = "mongodb://localhost:27017/",
    preferred_model: Optional[str] = None,
    progress_callback: Optional[callable] = None,
) -> Dict[str, Any]:
    """
    Deep Clean Correlation Mode:
    1. Load all platform data for the identifier
    2. Clean each platform's data one by one using LLM
    3. Store cleaned data in data_db.cleaned_data collection
    4. Run correlation on the cleaned data
    5. Return the final correlation result
    
    progress_callback: Optional function(step: str, platform: str, status: str)
                      to report progress in real-time
    """
    from pymongo import MongoClient
    
    def report(step: str, platform: str = "", status: str = ""):
        if progress_callback:
            progress_callback(step, platform, status)
    
    report("init", "", "Starting deep clean correlation...")
    
    try:
        client_db = MongoClient(mongo_uri)
        data_db = client_db.get_database("data_db")
        
        # Collection to store cleaned data
        cleaned_coll = data_db.get_collection("cleaned_data")
        
        # All platform collections to process
        platform_collections = [
            "github", "twitter", "reddit", "snapchat", "stackoverflow",
            "linkedin", "profile_osint", "search_engines", 
            "breachdirectory", "compromise"
        ]
        
        cleaned_results = []
        platforms_found = []
        
        report("loading", "", "Loading collected data...")
        
        # Step 1: Load and clean each platform's data
        for platform in platform_collections:
            try:
                coll = data_db.get_collection(platform)
                doc = coll.find_one({"identifier": identifier})
                
                if not doc or not doc.get("data"):
                    continue
                
                platforms_found.append(platform)
                raw_data = doc.get("data")
                
                report("cleaning", platform, f"Cleaning {platform.upper()} data...")
                
                # Clean this platform's data
                cleaned = _clean_single_platform(
                    platform=platform,
                    raw_data=raw_data,
                    mongo_uri=mongo_uri,
                    preferred_model=preferred_model,
                )
                
                # Store cleaned data
                cleaned_doc = {
                    "identifier": identifier,
                    "platform": platform,
                    "cleaned_data": cleaned,
                    "original_collected_at": doc.get("collected_at"),
                    "cleaned_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                }
                
                # Upsert the cleaned data
                cleaned_coll.update_one(
                    {"identifier": identifier, "platform": platform},
                    {"$set": cleaned_doc},
                    upsert=True
                )
                
                cleaned_results.append({
                    "collection": platform,
                    "identifier": identifier,
                    "data": cleaned,
                })
                
                report("cleaned", platform, f"✓ {platform.upper()} cleaned successfully")
                
            except Exception as e:
                report("error", platform, f"Error cleaning {platform}: {str(e)}")
                continue
        
        if not cleaned_results:
            return {
                "error": f"No data found to clean for identifier: {identifier}",
                "platforms_checked": platform_collections,
            }
        
        report("correlating", "", f"Starting correlation with {len(cleaned_results)} cleaned sources...")
        
        # Step 2: Run correlation on cleaned data using the new correlator
        correlation_result = _correlate_cleaned_data(cleaned_results, identifier)
        
        # Add metadata about the deep clean process
        correlation_result["_deep_clean_meta"] = {
            "platforms_processed": platforms_found,
            "platforms_cleaned": len(cleaned_results),
            "cleaned_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "mode": "deep_clean",
        }
        
        # Coerce to canonical schema
        correlation_result = _coerce_profile_schema(correlation_result)
        
        report("complete", "", "Deep clean correlation complete!")
        
        return correlation_result
        
    except Exception as e:
        report("error", "", f"Deep clean failed: {str(e)}")
        return {"error": f"Deep clean correlation failed: {str(e)}"}


# ==========================
# Helpers: clean & extract JSON
# ==========================
def clean_model_text(text: str) -> str:
    """
    Clean common wrappers (code fences, leading labels, markdown).
    Then attempt to find the first JSON object in the text and return it.
    """
    if not text:
        return ""

    # Remove common code fences and their language tags
    text = re.sub(r"```(?:json|js|text)?\s*", "", text)
    text = text.replace("```", "")
    # Remove common leading/trailing whitespace and > quote characters
    text = text.strip()

    # If the assistant returned an inline explanation followed by JSON, try to extract the JSON object
    # Find the first { and last } that likely form a JSON object.
    # This is greedy but helps recover if the model prints commentary + JSON.
    first_brace = text.find("{")
    last_brace = text.rfind("}")
    if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
        candidate = text[first_brace:last_brace + 1]
        return candidate.strip()

    # As a fallback, return whole cleaned text
    return text


def _rule_based_correlation(structured_osint: Any, identifier: Optional[str] = None) -> Dict[str, Any]:
    """Local correlation without any LLM.

    Uses the structured OSINT documents already stored in MongoDB (GitHub, Twitter,
    Reddit, ProfileOSINT, Search Engines, BreachDirectory, Compromise Check) to
    build a clean, deterministic profile JSON.
    """
    base_profile: Dict[str, Any] = {
        "name": identifier or "",
        "profile_type": None,
        "about": None,
        "usernames": {},  # platform -> { handle, url }
        "bio": "",
        "emails": [],
        "primary_location": "",
        "posts": [],
        "repositories": [],
        "activity_patterns": "",
        "possible_interests": [],
        "relationship_graph": [],
        "behavioral_anomalies": [],
        "key_timelines": [],
        "links": {},
        "compromised": False,
        "summary": "",
        "llm_analysis": None,
    }

    if not isinstance(structured_osint, list) or not structured_osint:
        base_profile["summary"] = "No OSINT data available for this identifier yet. Run data collection first."
        return base_profile

    emails = set()
    interests = set()
    links: Dict[str, str] = {}
    posts: list = []
    repos: list = []
    compromised = False
    compromise_notes = []
    key_events = []  # for key_timelines

    # ---------------- GitHub ----------------
    for entry in structured_osint:
        coll = (entry.get("collection") or "").lower()
        data = entry.get("data") or {}

        if coll == "github":
            gh_root = data.get("data") or data
            user = gh_root.get("user") or {}
            gh_login = user.get("login")
            if user.get("name") and not base_profile["name"]:
                base_profile["name"] = user["name"]
            if gh_login:
                base_profile["usernames"]["github"] = {
                    "handle": gh_login,
                    "url": user.get("html_url") or f"https://github.com/{gh_login}",
                }
            if user.get("bio") and not base_profile["bio"]:
                base_profile["bio"] = user["bio"]
            if user.get("email"):
                emails.add(user["email"])
            if user.get("location") and not base_profile["primary_location"]:
                base_profile["primary_location"] = user["location"]
            if user.get("created_at"):
                key_events.append((user["created_at"], "GitHub account created"))
            if user.get("blog"):
                links.setdefault("website", user["blog"])

            for r in gh_root.get("repos", []) or []:
                repos.append({
                    "name": r.get("name"),
                    "url": r.get("html_url"),
                    "description": r.get("description"),
                    "stars": r.get("stargazers_count"),
                    "forks": r.get("forks_count"),
                    "last_updated": r.get("updated_at"),
                })

            # GitHub followers/following as relationships
            for f in gh_root.get("followers_sample", []) or []:
                if f.get("login"):
                    base_profile["relationship_graph"].append({
                        "username": f.get("login"),
                        "platform": "GitHub",
                        "type": "follower",
                        "url": f.get("html_url"),
                    })
            for f in gh_root.get("following_sample", []) or []:
                if f.get("login"):
                    base_profile["relationship_graph"].append({
                        "username": f.get("login"),
                        "platform": "GitHub",
                        "type": "following",
                        "url": f.get("html_url"),
                    })

    # ---------------- Twitter ----------------
    for entry in structured_osint:
        coll = (entry.get("collection") or "").lower()
        data = entry.get("data") or {}

        if coll == "twitter":
            tw_root = data
            user = tw_root.get("user") or {}
            handle = user.get("username")
            if user.get("name") and not base_profile["name"]:
                base_profile["name"] = user["name"]
            if handle:
                url = f"https://twitter.com/{handle}"
                base_profile["usernames"]["twitter"] = {"handle": handle, "url": url}
                links.setdefault("twitter", url)
            if user.get("description") and not base_profile["bio"]:
                base_profile["bio"] = user["description"]
            if user.get("location") and not base_profile["primary_location"]:
                base_profile["primary_location"] = user["location"]
            if user.get("created_at"):
                key_events.append((user["created_at"], "Twitter account created"))
            if user.get("url"):
                links.setdefault("website", user["url"])

            tweets = tw_root.get("tweets") or []
            if isinstance(tweets, dict):
                tweet_list = tweets.get("data", [])
            else:
                tweet_list = tweets
            for t in tweet_list or []:
                posts.append({
                    "platform": "Twitter",
                    "title": (t.get("text") or "").strip()[:120],
                    "url": f"https://twitter.com/{handle}/status/{t.get('id')}" if handle and t.get("id") else None,
                    "date": t.get("created_at"),
                    "metrics": t.get("public_metrics"),
                })

            # Twitter followers/following as relationships
            followers = tw_root.get("followers") or {}
            fl_data = followers.get("data") if isinstance(followers, dict) else followers
            for f in fl_data or []:
                if f.get("username"):
                    base_profile["relationship_graph"].append({
                        "username": f.get("username"),
                        "platform": "Twitter",
                        "type": "follower",
                        "url": f"https://twitter.com/{f.get('username')}",
                    })
            following = tw_root.get("following") or {}
            fo_data = following.get("data") if isinstance(following, dict) else following
            for f in fo_data or []:
                if f.get("username"):
                    base_profile["relationship_graph"].append({
                        "username": f.get("username"),
                        "platform": "Twitter",
                        "type": "following",
                        "url": f"https://twitter.com/{f.get('username')}",
                    })

    # ---------------- Snapchat ----------------
    for entry in structured_osint:
        coll = (entry.get("collection") or "").lower()
        data = entry.get("data") or {}

        if coll == "snapchat":
            sc_root = data
            profile = sc_root.get("profile_info") or {}
            account = sc_root.get("account_details") or {}
            
            sc_username = profile.get("username") or sc_root.get("normalized_username")
            if sc_username:
                url = f"https://www.snapchat.com/add/{sc_username}"
                base_profile["usernames"]["snapchat"] = {
                    "handle": sc_username,
                    "url": url,
                    "bio": profile.get("bio"),
                }
                links.setdefault("snapchat", url)
            
            # Name and bio
            if profile.get("display_name") and not base_profile["name"]:
                base_profile["name"] = profile["display_name"]
            if profile.get("bio") and not base_profile["bio"]:
                base_profile["bio"] = profile["bio"]
            
            # Location from profile
            if profile.get("location") and not base_profile["primary_location"]:
                base_profile["primary_location"] = profile["location"]
            
            # Follower count as activity pattern
            follower_count = sc_root.get("follower_count") or account.get("follower_count")
            if follower_count:
                interests.add(f"Snapchat influencer ({follower_count:,} followers)")
            
            # External sites (linked websites)
            external_sites = sc_root.get("external_sites") or []
            for site in external_sites:
                if site and "website" not in links:
                    links["website"] = site if site.startswith("http") else f"https://{site}"
            
            # Interests from profile
            sc_interests = profile.get("interests") or []
            for interest in sc_interests[:15]:  # Limit to 15
                if interest:
                    interests.add(interest)
            
            # Spotlight videos as posts
            spotlight = sc_root.get("spotlight_videos") or []
            for video in spotlight[:5]:  # Limit to 5 spotlight videos
                posts.append({
                    "platform": "Snapchat",
                    "title": video.get("title") or "Spotlight Video",
                    "url": video.get("url"),
                    "date": video.get("upload_date"),
                    "metrics": {
                        "views": video.get("watch_count"),
                        "likes": video.get("like_count"),
                        "comments": video.get("comment_count"),
                    },
                })
            
            # Highlights as posts
            highlights = sc_root.get("highlights") or []
            for highlight in highlights[:5]:
                posts.append({
                    "platform": "Snapchat",
                    "title": highlight.get("title") or highlight.get("name") or "Story Highlight",
                    "url": highlight.get("url"),
                    "date": highlight.get("date") or highlight.get("created_at"),
                })
            
            # Stories as posts
            stories = sc_root.get("stories") or sc_root.get("public_stories") or []
            for story in stories[:5]:
                posts.append({
                    "platform": "Snapchat",
                    "title": story.get("title") or "Story",
                    "url": story.get("url"),
                    "date": story.get("date") or story.get("posted_at"),
                    "metrics": {"views": story.get("views")},
                })
            
            # Account creation date
            if sc_root.get("account_created"):
                key_events.append((sc_root["account_created"], "Snapchat account created"))
            
            # Verification status
            if profile.get("verified"):
                interests.add("Verified Snapchat account")

    # ---------------- StackOverflow ----------------
    for entry in structured_osint:
        coll = (entry.get("collection") or "").lower()
        data = entry.get("data") or {}

        if coll == "stackoverflow":
            so_root = data
            users = so_root.get("users") or []
            
            for user in users:
                so_username = user.get("display_name")
                so_user_id = user.get("user_id")
                
                if so_username and so_user_id:
                    url = user.get("link") or f"https://stackoverflow.com/users/{so_user_id}"
                    base_profile["usernames"]["stackoverflow"] = {
                        "handle": so_username,
                        "url": url,
                    }
                    links.setdefault("stackoverflow", url)
                
                # Name fallback
                if so_username and not base_profile["name"]:
                    base_profile["name"] = so_username
                
                # Location
                if user.get("location") and not base_profile["primary_location"]:
                    base_profile["primary_location"] = user["location"]
                
                # Reputation and badges as activity indicators
                reputation = user.get("reputation")
                if reputation:
                    interests.add(f"StackOverflow expert (rep: {reputation:,})")
                
                # Badge counts
                badges = user.get("badge_counts") or {}
                gold = badges.get("gold", 0)
                silver = badges.get("silver", 0)
                bronze = badges.get("bronze", 0)
                if gold or silver or bronze:
                    interests.add(f"SO badges: {gold}🥇 {silver}🥈 {bronze}🥉")
                
                # Account creation
                creation_date = user.get("creation_date")
                if creation_date:
                    try:
                        from datetime import datetime
                        dt_str = datetime.fromtimestamp(creation_date).strftime("%Y-%m-%d")
                        key_events.append((dt_str, "StackOverflow account created"))
                    except:
                        pass
                
                # Website link
                if user.get("website_url"):
                    links.setdefault("website", user["website_url"])
                
                # Top tags as skills/interests
                top_tags = user.get("top_tags") or []
                for tag in top_tags[:10]:
                    tag_name = tag.get("tag_name")
                    if tag_name:
                        interests.add(tag_name)
                
                # Only process first matching user
                break

    # ---------------- Reddit ----------------
    for entry in structured_osint:
        coll = (entry.get("collection") or "").lower()
        data = entry.get("data") or {}

        if coll == "reddit":
            rd_root = data
            user_info = rd_root.get("user_info") or {}
            username = user_info.get("username")
            if username:
                url = f"https://reddit.com/user/{username}"
                base_profile["usernames"]["reddit"] = {"handle": username, "url": url}
                links.setdefault("reddit", url)

            if user_info.get("account_creation_date"):
                key_events.append((user_info["account_creation_date"], "Reddit account created"))

            posts_list = rd_root.get("posts") or []
            for p in posts_list:
                posts.append({
                    "platform": "Reddit",
                    "title": p.get("title"),
                    "url": p.get("url"),
                    "date": p.get("timestamp"),
                    "metrics": {"upvotes": p.get("upvotes"), "downvotes": p.get("downvotes")},
                })

            activity = rd_root.get("activity_metrics") or {}
            subs = activity.get("most_active_subreddits") or []
            for name, _count in subs:
                if name:
                    interests.add(f"r/{name}")

    # ---------------- ProfileOSINT & Search Engines (links) ----------------
    for entry in structured_osint:
        coll = (entry.get("collection") or "").lower()
        data = entry.get("data") or {}

        if coll in {"profile_osint", "search_engines"}:
            results = data.get("results") or []
            for r in results:
                url = r.get("url")
                platform = (r.get("platform") or "Other").lower()
                if not url:
                    continue

                # Infer platform from URL host as well (handles regional subdomains
                # like pk.linkedin.com, www.github.com, etc.)
                try:
                    host = urlparse(url).netloc.lower()
                except Exception:
                    host = ""

                inferred = None
                if "linkedin.com" in host:
                    inferred = "linkedin"
                elif "github.com" in host:
                    inferred = "github"
                elif "twitter.com" in host or "x.com" in host:
                    inferred = "twitter"
                elif "reddit.com" in host:
                    inferred = "reddit"
                elif "youtube.com" in host or "youtu.be" in host:
                    inferred = "youtube"

                if platform == "other" and inferred:
                    platform = inferred

                # Only keep first URL per platform to avoid noise
                if platform == "github" and "github" not in links:
                    links["github"] = url
                elif platform in {"linkedin", "twitter", "reddit", "youtube"} and platform not in links:
                    links[platform] = url

                snippet = r.get("snippet") or ""
                for ent in r.get("entities") or []:
                    if ent.get("type") == "EMAIL":
                        emails.add(ent.get("text"))
                    if ent.get("type") == "NAME" and not base_profile["name"]:
                        base_profile["name"] = ent.get("text")

    # ---------------- BreachDirectory ----------------
    for entry in structured_osint:
        coll = (entry.get("collection") or "").lower()
        data = entry.get("data") or {}

        if coll == "breachdirectory":
            found = data.get("found") or 0
            if found > 0:
                compromised = True
                compromise_notes.append(f"BreachDirectory reports {found} leaked records.")

    # ---------------- Compromise Check ----------------
    for entry in structured_osint:
        coll = (entry.get("collection") or "").lower()
        data = entry.get("data") or {}

        if coll == "compromise":
            status = (data.get("status") or "").upper()
            if status in {"COMPROMISED", "AT RISK"}:
                compromised = True
                compromise_notes.append(f"HudsonRock/COMB status: {status} (score {data.get('compromise_score')}).")

    # Finalize fields
    base_profile["emails"] = sorted(e for e in emails if e)
    base_profile["possible_interests"] = sorted(interests)
    base_profile["links"] = links
    base_profile["repositories"] = repos
    base_profile["posts"] = posts
    base_profile["compromised"] = compromised

    # Activity + summary
    platforms = sorted(base_profile["usernames"].keys())
    total_repos = len(repos)
    total_posts = len(posts)
    summary_bits = []
    if base_profile["name"]:
        summary_bits.append(f"Profile: {base_profile['name']}")
    if platforms:
        summary_bits.append("Platforms: " + ", ".join(platforms))
    if total_repos:
        summary_bits.append(f"GitHub repositories: {total_repos}")
    if total_posts:
        summary_bits.append(f"Social posts collected: {total_posts}")
    summary_bits.append("Compromised: YES" if compromised else "Compromised: NO")
    if compromise_notes:
        summary_bits.append("; ".join(compromise_notes))

    base_profile["summary"] = " | ".join(summary_bits)

    # Key timelines (sorted by date string where possible)
    try:
        key_events_sorted = sorted(key_events, key=lambda x: x[0])
    except Exception:
        key_events_sorted = key_events
    base_profile["key_timelines"] = [f"{d}: {label}" for d, label in key_events_sorted]

    # Simple activity pattern string
    platform_counts = {}
    for p in posts:
        plat = (p.get("platform") or "").lower()
        if plat:
            platform_counts[plat] = platform_counts.get(plat, 0) + 1
    parts = []
    if platform_counts:
        parts.append("Activity: " + ", ".join(f"{k}={v} posts" for k, v in platform_counts.items()))
    if repos:
        parts.append(f"GitHub repos observed: {len(repos)}")
    if parts:
        base_profile["activity_patterns"] = " | ".join(parts)

    # Simple deterministic profile_type/about classification for local engine
    base_profile = _ensure_profile_classification(base_profile)

    return base_profile


# ==========================
# Schema coercion & classification helpers
# ==========================

CANONICAL_KEYS: Dict[str, Any] = {
    "name": None,
    "profile_type": None,
    "about": None,
    "usernames": {},
    "bio": None,
    "emails": [],
    "primary_location": None,
    "posts": [],
    "repositories": [],
    "activity_patterns": None,
    "possible_interests": [],
    "relationship_graph": [],
    "behavioral_anomalies": [],
    "key_timelines": [],
    "links": {},
    "compromised": False,
    "summary": None,
    "llm_analysis": None,
}


def _normalize_list(value: Any) -> List[Any]:
    if isinstance(value, list):
        return value
    return []


def _coerce_profile_schema(raw: Any) -> Dict[str, Any]:
    """Coerce arbitrary model output into the canonical correlation schema.

    This makes sure all expected keys exist with sensible default types so
    downstream reporting can rely on a stable structure.
    """
    # Unwrap common wrappers like {"result": {...}} or {"profile": {...}}
    profile = raw
    if isinstance(raw, dict):
        if isinstance(raw.get("profile"), dict):
            profile = raw["profile"]
        elif isinstance(raw.get("result"), dict):
            profile = raw["result"]

    result: Dict[str, Any] = {}
    src = profile if isinstance(profile, dict) else {}

    for key, default in CANONICAL_KEYS.items():
        val = src.get(key) if isinstance(src, dict) else None

        if key in {"emails", "possible_interests", "behavioral_anomalies", "key_timelines"}:
            items = _normalize_list(val)
            result[key] = [str(x) for x in items]
        elif key in {"usernames", "links"}:
            result[key] = val if isinstance(val, dict) else {}
        elif key in {"posts", "repositories", "relationship_graph"}:
            result[key] = _normalize_list(val)
        elif key == "compromised":
            if isinstance(val, bool):
                result[key] = val
            elif isinstance(val, str):
                lowered = val.strip().lower()
                result[key] = lowered in {"yes", "true", "1", "compromised"}
            elif isinstance(val, (int, float)):
                result[key] = bool(val)
            else:
                result[key] = bool(default)
        else:
            # scalar fields (strings or optional narrative)
            if val is None:
                result[key] = None
            else:
                result[key] = str(val)

    # Normalise username entries to the expected inner shape
    usernames = result.get("usernames") or {}
    if isinstance(usernames, dict):
        normalised = {}
        for platform, data in usernames.items():
            if isinstance(data, dict):
                handle = data.get("handle") or data.get("username")
                normalised[platform] = {
                    "handle": handle if handle is not None else None,
                    "url": data.get("url"),
                    "bio": data.get("bio"),
                }
            else:
                # treat plain string as handle with unknown URL
                normalised[platform] = {
                    "handle": str(data) if data is not None else None,
                    "url": None,
                    "bio": None,
                }
        result["usernames"] = normalised

    # Ensure classification fields are reasonable
    result = _ensure_profile_classification(result)
    return result


def _ensure_profile_classification(profile: Dict[str, Any]) -> Dict[str, Any]:
    """Derive a simple profile_type/about if the model or rule-based logic
    did not provide them.
    """
    profile_type = profile.get("profile_type")
    about = profile.get("about")

    usernames = profile.get("usernames") or {}
    repos = profile.get("repositories") or []
    platforms = sorted(usernames.keys()) if isinstance(usernames, dict) else []

    # Derive a basic profile_type when missing
    if not profile_type:
        if "github" in platforms and repos:
            profile_type = "developer"
        elif "linkedin" in platforms:
            profile_type = "professional"
        elif "twitter" in platforms or "reddit" in platforms:
            profile_type = "individual"
        elif platforms:
            profile_type = "online_profile"
        else:
            profile_type = "unknown"

    # Derive a short about line if missing
    if not about:
        name = profile.get("name") or "This subject"
        footprint = ", ".join(p.capitalize() for p in platforms) if platforms else "limited visible platforms"
        repo_count = len(repos) if isinstance(repos, list) else 0
        repo_phrase = "with public GitHub repositories" if repo_count else "with minimal code exposure"
        about = f"{name} appears to be a {profile_type} active on {footprint} {repo_phrase}.".strip()

    profile["profile_type"] = profile_type
    profile["about"] = about
    return profile


def _build_openrouter_model_list(preferred: Optional[str] = None) -> List[str]:
    """Return an ordered, de-duplicated list of OpenRouter model ids.

    Order of preference:
    1. Explicit preferred model from the caller (UI) when provided.
    2. MODEL from env (CORRELATION_MODEL) if set.
    3. Static OPENROUTER_MODEL_PRIORITY list.
    """
    ordered: List[str] = []

    def add_if_valid(model_id: Optional[str]):
        mid = (model_id or "").strip()
        if not mid:
            return
        if mid not in ordered:
            ordered.append(mid)

    add_if_valid(preferred)
    add_if_valid(MODEL)
    for mid in OPENROUTER_MODEL_PRIORITY:
        add_if_valid(mid)

    return ordered

# ==========================
# Core: run_correlation with retries
# ==========================
def run_correlation(
    mode: str = "fast",
    custom_prompt: str = "",
    identifier: Optional[str] = None,
    mongo_uri: str = "mongodb://localhost:27017/",
    backend: Optional[str] = None,
    include_backend: bool = False,
    preferred_model: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Run the correlation model. Returns a Python dict (parsed JSON) or an error structure.
    Retries on transient errors (e.g., 503). Tries to clean model output and extract JSON.
    """
    # Prefer database-stored OSINT when identifier provided; otherwise fall back to files
    osint_data = None
    structured_osint: Any = None
    if identifier:
        try:
            from pymongo import MongoClient
            client = MongoClient(mongo_uri)
            db = client.get_database("data_db")
            all_data = []
            # iterate over known collections and pull the `data` field for the identifier
            coll_names = ["github", "twitter", "reddit", "profile_osint", "search_engines", "breachdirectory", "compromise"]
            for name in coll_names:
                try:
                    coll = db.get_collection(name)
                    doc = coll.find_one({"identifier": identifier})
                    if doc and doc.get("data") is not None:
                        entry = {"collection": name, "identifier": identifier, "collected_at": str(doc.get("collected_at")), "data": doc.get("data")}
                        all_data.append(entry)
                except Exception:
                    # skip missing collections
                    continue
            # If we found DB data, use it; otherwise fall back to files
            if all_data:
                structured_osint = all_data
                osint_data = json.dumps(all_data, indent=2)
        except Exception:
            osint_data = None

    if osint_data is None:
        osint_data = load_osint_files()
    prompt = build_prompt(mode, osint_data, custom_prompt)

    # If build_prompt returned a JSON error string (for invalid self prompt), detect and return
    try:
        maybe_json = json.loads(prompt)
        # This occurs when prompt is a JSON error message
        if isinstance(maybe_json, dict) and maybe_json.get("error"):
            return {"error": maybe_json.get("error")}
    except Exception:
        # Not JSON — proceed
        pass

    # Decide which backend to use for this call
    chosen_backend = choose_backend(preferred=backend, mongo_uri=mongo_uri)
    if not chosen_backend:
        return {"error": "No correlation backend is configured (local_flan or openrouter)"}

    # Local backend: run fully offline using deterministic correlation,
    # optionally enriched with a natural-language FLAN analysis paragraph.
    if chosen_backend == "local_flan":
        # If we have structured OSINT from Mongo, use it. Otherwise return a clear message.
        if structured_osint is None:
            try:
                structured_osint = json.loads(osint_data) if osint_data else []
            except Exception:
                structured_osint = []

        result = _rule_based_correlation(structured_osint, identifier)

        # Optional: use local FLAN only to generate a readable analyst-style note,
        # without relying on it for JSON formatting.
        try:
            analysis_prompt = (
                "You are a senior cyber threat intelligence analyst. "
                "Given the following JSON profile, write a clear, concise 5-8 sentence "
                "assessment of this user's online presence, exposure, and compromise risk. "
                "Focus on platforms, notable repositories or posts, and any breach signals. "
                "Respond with plain text only, no JSON, no bullet points.\n\n" \
                + json.dumps(result, indent=2)
            )
            narrative = _call_local_flan(analysis_prompt, max_new_tokens=512)
            if narrative and isinstance(result, dict):
                result["llm_analysis"] = narrative.strip()
        except Exception:
            # If FLAN is unavailable or fails, ignore and keep deterministic result
            pass
        # Ensure result conforms to canonical schema
        if isinstance(result, dict):
            result = _coerce_profile_schema(result)
            if include_backend:
                result.setdefault("backend_used", chosen_backend)
        return result

    # Remote OpenRouter backend with multi-model fallback
    # Create AI client at call time using env or DB-stored key
    api_key = get_openrouter_key_from_db()
    if not api_key:
        result = {"error": "OpenRouter/OpenAI API key not found in environment or database (api_keys.openRouter)"}
        if include_backend:
            result.setdefault("backend_used", chosen_backend)
        return result

    client = OpenAI(base_url=OPENAI_BASE_URL, api_key=api_key)

    models_to_try = _build_openrouter_model_list(preferred_model)
    last_error: Optional[str] = None
    first_model: Optional[str] = models_to_try[0] if models_to_try else None

    for model_id in models_to_try:
        attempt = 0
        backoff = INITIAL_BACKOFF
        while attempt < MAX_RETRIES:
            attempt += 1
            try:
                resp = client.chat.completions.create(
                    model=model_id,
                    messages=[{"role": "user", "content": prompt}]
                )
                # Attempt to extract text content from response
                raw_content = None
                try:
                    raw_content = resp.choices[0].message.content
                except Exception:
                    # some providers return different shapes; stringify resp if needed
                    raw_content = str(resp)

                cleaned = clean_model_text(raw_content)

                # final parse attempt
                try:
                    parsed = json.loads(cleaned)
                    result = parsed
                    if isinstance(result, dict):
                        result = _coerce_profile_schema(result)
                        if include_backend:
                            result.setdefault("backend_used", chosen_backend)
                            result.setdefault("model_used", model_id)
                            if first_model and first_model != model_id:
                                result.setdefault("fallback_from", first_model)
                    return result
                except json.JSONDecodeError:
                    # Return helpful error with raw + cleaned attempt so caller can debug
                    result = {
                        "error": "Model did not return valid JSON",
                        "raw_response": raw_content,
                        "cleaned_attempt": cleaned,
                        "model_used": model_id,
                    }
                    if include_backend:
                        result.setdefault("backend_used", chosen_backend)
                        if first_model and first_model != model_id:
                            result.setdefault("fallback_from", first_model)
                    return result

            except Exception as e:
                msg = str(e)
                last_error = msg

                # If this looks like a per-model capacity / rate limit issue, break to next model.
                if any(tok in msg for tok in ("429", "rate limit", "Rate limit", "overloaded", "capacity")):
                    break

                # Handle transient provider errors with retry/backoff for the same model
                if any(tok in msg for tok in ("503", "Service Unavailable", "No instances available", "timed out", "timeout")) and attempt < MAX_RETRIES:
                    time.sleep(backoff)
                    backoff *= BACKOFF_FACTOR
                    continue

                # Non-retryable exception for this model: break and try the next model
                break

    # If we exit all models without returning
    result = {
        "error": last_error or "Failed to get response from any OpenRouter model",
        "models_tried": models_to_try,
    }
    if include_backend:
        result.setdefault("backend_used", chosen_backend)
        if first_model:
            result.setdefault("model_used", first_model)
    return result
