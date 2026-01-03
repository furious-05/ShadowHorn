import os
import json
import asyncio
import nest_asyncio
import datetime
import queue
import threading
from pathlib import Path
from flask import Flask, request, jsonify, make_response, Response
from flask_cors import CORS
from pymongo import MongoClient

# -----------------------------
# OSINT Collectors
# -----------------------------
from github_collector import collect_osint as github_osint
from twitter_collector import collect_osint as twitter_osint
from reddit_collector import collect_osint as reddit_osint
from medium_collector import collect_osint as medium_osint
from stackoverflow_collector import collect_osint as stackoverflow_osint
from snapchat_collector import collect_osint as snapchat_osint
from compromise_checker import check_user_compromise as compromise_osint
from breach_directory import fetch_breachdirectory
from profile_osint import ProfileOSINT
from duckduckgo_collector import collect_osint_sync

# -----------------------------
# AI Correlation Module
# -----------------------------
from openai_correlation import run_correlation, detect_backends, choose_backend, run_deep_clean_correlation  # AI correlation engines
from intel_report import generate_intel_report  # AI intelligence reporting
from comprehensive_report import generate_comprehensive_report  # Unified comprehensive report
from report_pdf import build_pdf_bytes

# -----------------------------
# Apply nest_asyncio
# -----------------------------
nest_asyncio.apply()

# -----------------------------
# Flask App
# -----------------------------
app = Flask(__name__)
CORS(app)

# -----------------------------
# MongoDB Connection
# -----------------------------
MONGO_URI = "mongodb://localhost:27017/"
client = MongoClient(MONGO_URI)

settings_db = client["settings_db"]
api_collection = settings_db["api_keys"]

data_db = client["data_db"]

collections = {
    "GitHub": data_db["github"],
    "Twitter": data_db["twitter"],
    "Reddit": data_db["reddit"],
    "Medium": data_db["medium"],
    "StackOverflow": data_db["stackoverflow"],
    "Snapchat": data_db["snapchat"],
    "ProfileOSINT": data_db["profile_osint"],
    "Search Engines": data_db["search_engines"],
    "BreachDirectory": data_db["breachdirectory"],
    "Compromise Check": data_db["compromise"]
}

# -----------------------------
# OSINT Results Folder
# -----------------------------
OSINT_RESULTS_DIR = Path("osint_results")
OSINT_RESULTS_DIR.mkdir(exist_ok=True)

# -----------------------------
# Platform Name Mapping (for query parsing)
# -----------------------------
PLATFORM_ALIASES = {
    "generic": "Generic",
    "github": "GitHub",
    "twitter": "Twitter",
    "reddit": "Reddit",
    "medium": "Medium",
    "stackoverflow": "StackOverflow",
    "snapchat": "Snapchat",
    "breachdirectory": "BreachDirectory",
    "breach": "BreachDirectory",
    "compromise": "Compromise Check",
    "compromisecheck": "Compromise Check",
    "searchengines": "Search Engines",
    "search": "Search Engines",
    "profileosint": "ProfileOSINT",
    "profile": "ProfileOSINT",
}

def parse_username_query(username_input: str) -> dict:
    """
    Parse username input which can be either:
    1. Simple username: "furious-05" -> {"Generic": "furious-05"}
    2. Query syntax: "Generic=user1;snapchat=user2;reddit=user3" -> {"Generic": "user1", "Snapchat": "user2", "Reddit": "user3"}
    
    Returns a dict mapping platform names to usernames.
    """
    username_input = username_input.strip()
    
    # Check if it's query syntax (contains = and ;)
    if "=" in username_input:
        result = {}
        # Split by semicolon, handle trailing semicolons
        parts = [p.strip() for p in username_input.split(";") if p.strip()]
        
        for part in parts:
            if "=" not in part:
                continue
            
            key, _, value = part.partition("=")
            key = key.strip().lower()
            value = value.strip()
            
            if not key or not value:
                continue
            
            # Map alias to canonical platform name
            platform = PLATFORM_ALIASES.get(key, key.title())
            
            # Support multiple usernames for same platform (comma-separated)
            if platform in result:
                existing = result[platform]
                if isinstance(existing, list):
                    existing.append(value)
                else:
                    result[platform] = [existing, value]
            else:
                result[platform] = value
        
        return result if result else {"Generic": username_input}
    
    # Simple username - use as Generic
    return {"Generic": username_input} if username_input else {}

# -----------------------------
# Load API Keys
# -----------------------------
def get_saved_keys():
    doc = api_collection.find_one()
    if not doc:
        return {
            "twitter": "",
            "github": "",
            "breachDirectory": "",
            "openRouter": "",       # <-- new key
            "correlationModel": ""  # <-- optional: lets you store model choice
        }
    # Ensure defaults if some keys are missing
    return {
        "twitter": doc.get("twitter", ""),
        "github": doc.get("github", ""),
        "breachDirectory": doc.get("breachDirectory", ""),
        "openRouter": doc.get("openRouter", ""),
        "correlationModel": doc.get("correlationModel", "")
    }


# -----------------------------
# Save JSON to Folder
# -----------------------------
def save_platform_json(identifier, platform, data):
    timestamp = int(datetime.datetime.utcnow().timestamp())
    file_path = OSINT_RESULTS_DIR / f"{identifier}_{platform}_{timestamp}.json"
    try:
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=4)
        print(f"Saved {platform} JSON for {identifier} at {file_path}")
    except Exception as e:
        print(f"Failed to save {platform} JSON: {e}")
    return file_path

# -----------------------------
# Async OSINT Collector
# -----------------------------
async def collect_async(username, full_name, keyword, selected_platforms, api_keys, mode="fast", prompt=None, platform_usernames=None):
    """
    Collect OSINT data from multiple platforms.
    
    Args:
        username: Default/fallback username (for backward compatibility)
        full_name: Full name for profile-based searches
        keyword: Additional keyword for searches
        selected_platforms: List of platforms to query
        api_keys: Dict of API keys
        mode: Collection mode (fast/deep/self)
        prompt: Custom prompt for self mode
        platform_usernames: Dict mapping platform names to specific usernames
                           e.g., {"GitHub": "user1", "Snapchat": "user2"}
                           If not provided, falls back to `username` for all platforms.
    """
    results = {}
    identifier = username or full_name
    tasks = []
    
    # Helper to get username for a specific platform
    def get_username_for(platform_name):
        if platform_usernames:
            # Check for platform-specific username
            if platform_name in platform_usernames:
                return platform_usernames[platform_name]
            # Check for Generic fallback
            if "Generic" in platform_usernames:
                return platform_usernames["Generic"]
        return username

    async def run_sync(platform_name, func):
        try:
            res = await asyncio.to_thread(func)
            results[platform_name] = res
        except Exception as e:
            results[platform_name] = {"error": str(e)}
            print(f"{platform_name} collector error: {e}")

    # GitHub
    gh_user = get_username_for("GitHub")
    if gh_user and ("GitHub" in selected_platforms or not selected_platforms):
        token = api_keys.get("github", "")
        tasks.append(run_sync(
            "GitHub",
            lambda u=gh_user: github_osint(u, token) if token else {"error": "GitHub token missing"}
        ))

    # Twitter
    tw_user = get_username_for("Twitter")
    if tw_user and ("Twitter" in selected_platforms or not selected_platforms):
        token = api_keys.get("twitter", "")
        tasks.append(run_sync(
            "Twitter",
            lambda u=tw_user: twitter_osint(u, token) if token else {"error": "Twitter token missing"}
        ))

    # Reddit
    rd_user = get_username_for("Reddit")
    if rd_user and ("Reddit" in selected_platforms or not selected_platforms):
        tasks.append(run_sync("Reddit", lambda u=rd_user: reddit_osint(u)))

    # Medium (supports either explicit Medium username or discovery via full name)
    md_user = get_username_for("Medium")
    if (md_user or full_name) and ("Medium" in selected_platforms or not selected_platforms):
        tasks.append(run_sync("Medium", lambda u=md_user: medium_osint(username=u, full_name=full_name)))

    # StackOverflow
    so_user = get_username_for("StackOverflow")
    if so_user and ("StackOverflow" in selected_platforms or not selected_platforms):
        tasks.append(run_sync("StackOverflow", lambda u=so_user: stackoverflow_osint(u)))

    # Snapchat
    sc_user = get_username_for("Snapchat")
    if sc_user and ("Snapchat" in selected_platforms or not selected_platforms):
        tasks.append(run_sync(
            "Snapchat",
            lambda u=sc_user: snapchat_osint(u, str(OSINT_RESULTS_DIR))
        ))

    # BreachDirectory
    bd_user = get_username_for("BreachDirectory") or identifier
    if bd_user and ("BreachDirectory" in selected_platforms or not selected_platforms):
        bd_key = api_keys.get("breachDirectory", "")
        tasks.append(run_sync(
            "BreachDirectory",
            lambda u=bd_user: fetch_breachdirectory(u, bd_key) if bd_key else {"error": "BreachDirectory token missing"}
        ))

    # Compromise Check
    cc_user = get_username_for("Compromise Check") or identifier
    if cc_user and ("Compromise Check" in selected_platforms or not selected_platforms):
        tasks.append(run_sync("Compromise Check", lambda u=cc_user: compromise_osint(u)))

    # ProfileOSINT (async)
    if full_name and ("ProfileOSINT" in selected_platforms or not selected_platforms):
        async def profile_task():
            try:
                tool = ProfileOSINT()
                filepath = await tool.collect_osint(full_name, keyword)
                with open(filepath, "r", encoding="utf-8") as f:
                    results["ProfileOSINT"] = json.load(f)
                    if mode == "self" and prompt:
                        results["ProfileOSINT"]["notes"] = f"Self-defined correlation applied with prompt: {prompt}"
            except Exception as e:
                results["ProfileOSINT"] = {"error": str(e)}
                print(f"ProfileOSINT error: {e}")
        tasks.append(profile_task())

    # Search Engines
    if full_name and ("Search Engines" in selected_platforms or not selected_platforms):
        tasks.append(run_sync(
            "Search Engines",
            lambda: collect_osint_sync(full_name, keyword)
        ))

    await asyncio.gather(*tasks)
    return results

# -----------------------------
# Collect Profile Route
# -----------------------------
@app.route("/api/collect-profile", methods=["POST"])
def collect_profile_route():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400

    username_input = data.get("username", "").strip()
    email = data.get("email", "").strip()
    full_name = data.get("fullname", "").strip()
    keyword = data.get("keyword", "").strip()
    selected_platforms = data.get("platforms", [])
    mode = data.get("mode", "fast")
    prompt = data.get("prompt")

    api_keys = get_saved_keys()
    
    # Parse username input for query-based syntax
    # Supports: "username" OR "Generic=user1;snapchat=user2;reddit=user3"
    platform_usernames = parse_username_query(username_input)
    
    # For backward compatibility, extract a default username
    username = platform_usernames.get("Generic", "")
    if not username and platform_usernames:
        # Use first available username as fallback
        username = next(iter(platform_usernames.values()), "")
        if isinstance(username, list):
            username = username[0] if username else ""
    
    identifier = email or username or full_name

    if not identifier and not platform_usernames:
        return jsonify({"error": "Provide at least username, email, or fullname"}), 400
    
    # If no identifier but we have platform-specific usernames, use a combined identifier
    if not identifier and platform_usernames:
        identifier = "_".join([f"{k}_{v}" if isinstance(v, str) else f"{k}_{v[0]}" 
                               for k, v in list(platform_usernames.items())[:3]])

    results = asyncio.run(
        collect_async(
            username, 
            full_name, 
            keyword, 
            selected_platforms, 
            api_keys, 
            mode=mode, 
            prompt=prompt,
            platform_usernames=platform_usernames
        )
    )

    # Save JSON files and MongoDB
    for platform, result in results.items():
        save_platform_json(identifier, platform, result)
        try:
            # Store platform-specific username info along with results
            doc_data = {
                "identifier": identifier,
                "collected_at": datetime.datetime.utcnow(),
                "data": result,
                "query_usernames": platform_usernames  # Store the parsed usernames
            }
            collections[platform].update_one(
                {"identifier": identifier},
                {"$set": doc_data},
                upsert=True
            )
        except Exception as e:
            print(f"MongoDB save error for {platform}: {e}")

    return jsonify({"status": "success", "results": results})

# -----------------------------
# Run-Correlation Route (AI)
# -----------------------------
@app.route("/api/run-correlation", methods=["POST"])
def run_correlation_route():
    """
    Frontend POSTs JSON:
    {
        "mode": "fast" | "deep" | "self",
        "prompt": "custom instruction for self mode"  <- optional
    }
    """
    data = request.get_json() or {}
    mode = data.get("mode", "fast")
    custom_prompt = data.get("prompt", "")
    # Optional backend hint from UI: "auto" | "local_flan" | "openrouter"
    backend_hint = (data.get("backend") or "auto").strip().lower()
    # Accept `identifier`, or fall back to `username`, then `email` (email treated as identifier)
    identifier = (data.get("identifier") or data.get("username") or data.get("email") or "").strip()
    overwrite = bool(data.get("overwrite", False))

    if not identifier:
        return jsonify({"status": "error", "error": "Provide `identifier` (email, username, or fullname) in request body — or include `username` matching the data collection username."}), 400

    # If identifier provided, ensure there is collected data with that key in data_db (optional check)
    # This helps ensure correlation runs on existing collected data. If no data exists, caller may still proceed.
    try:
        found_any = False
        for coll in collections.values():
            if coll.find_one({"identifier": identifier}):
                found_any = True
                break
        if not found_any:
            print(f"[WARN] No collected data found in data_db for identifier: {identifier}")
    except Exception:
        pass

    # Prepare correlation storage collection
    corr_db = client.get_database("data_correlation")
    corr_collection = corr_db.get_collection("correlations")

    # If existing data exists and overwrite not requested, inform caller
    existing = corr_collection.find_one({"identifier": identifier})
    if existing and not overwrite:
        return jsonify({
            "status": "exists",
            "message": "Correlation data already exists for this identifier. Set 'overwrite': true to replace it.",
            "existing_collected_at": existing.get("collected_at")
        }), 200

    # If overwrite requested, remove previous documents for this identifier
    if existing and overwrite:
        try:
            corr_collection.delete_many({"identifier": identifier})
        except Exception as e:
            print(f"Failed to remove existing correlation docs for {identifier}: {e}")

    try:
        status = detect_backends()

        # -----------------------------
        # Backend strategy by hint
        # -----------------------------
        def run_single(backend_name: str):
            return run_correlation(
                mode=mode,
                custom_prompt=custom_prompt,
                identifier=identifier,
                backend=backend_name,
                include_backend=True,
                preferred_model=data.get("model"),
            )

        chosen_hint = backend_hint or "auto"

        # 1) Explicit local FLAN: no fallback
        if chosen_hint == "local_flan":
            if not status.get("local_flan", {}).get("configured"):
                return jsonify({
                    "status": "error",
                    "error": "Local correlation engine (FLAN) is not configured on this system.",
                    "primary_backend": "local_flan",
                }), 500

            result = run_single("local_flan")
            if isinstance(result, dict) and result.get("error"):
                return jsonify({
                    "status": "error",
                    "error": result.get("error"),
                    "primary_backend": "local_flan",
                    "primary_error": result.get("error"),
                }), 500

        # 2) Explicit OpenRouter: ask UI before falling back
        elif chosen_hint == "openrouter":
            if not status.get("openrouter", {}).get("configured"):
                return jsonify({
                    "status": "error",
                    "error": "OpenRouter is not configured.",
                    "primary_backend": "openrouter",
                }), 500

            result = run_single("openrouter")
            if isinstance(result, dict) and result.get("error"):
                # Return explicit error for OpenRouter without falling back to local,
                # but include any diagnostic fields from the correlation module
                # such as raw_response or cleaned_attempt.
                resp = {
                    "status": "error",
                    "error": result.get("error"),
                    "primary_backend": "openrouter",
                    "primary_error": result.get("error"),
                }
                for key in ("raw_response", "cleaned_attempt", "model_used", "models_tried"):
                    if key in result:
                        resp[key] = result[key]
                return jsonify(resp), 500

        # 3) Auto: try OpenRouter first, then local, silently
        else:  # auto or unknown
            ordered = []
            if status.get("openrouter", {}).get("configured"):
                ordered.append("openrouter")
            if status.get("local_flan", {}).get("configured"):
                ordered.append("local_flan")

            if not ordered:
                return jsonify({
                    "status": "error",
                    "error": "No correlation backend is configured (OpenRouter or local).",
                    "backends": status,
                }), 500

            last_error = None
            last_backend = None
            result = None
            for b in ordered:
                candidate = run_single(b)
                if isinstance(candidate, dict) and not candidate.get("error"):
                    result = candidate
                    break
                last_error = candidate.get("error") if isinstance(candidate, dict) else str(candidate)
                last_backend = b

            if result is None:
                return jsonify({
                    "status": "error",
                    "error": last_error or "All correlation backends failed.",
                    "primary_backend": ordered[0],
                    "primary_error": last_error,
                }), 500

        # Store result under same identifier key as data_db
        doc = {
            "identifier": identifier,
            "mode": mode,
            "prompt": custom_prompt,
            "collected_at": datetime.datetime.utcnow(),
            "result": result
        }
        corr_collection.update_one({"identifier": identifier}, {"$set": doc}, upsert=True)

        return jsonify({"status": "success", "result": result}), 200
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500


# -----------------------------
# Deep Clean Correlation Route (SSE for real-time progress)
# -----------------------------
@app.route("/api/run-deep-clean", methods=["POST"])
def run_deep_clean_route():
    """
    Deep Clean Correlation Mode with real-time progress via Server-Sent Events.
    
    Frontend POSTs JSON:
    {
        "identifier": "username or email",
        "model": "optional preferred model"
    }
    
    Returns SSE stream with progress updates, then final result.
    """
    data = request.get_json() or {}
    identifier = (data.get("identifier") or data.get("username") or "").strip()
    preferred_model = data.get("model")
    overwrite = bool(data.get("overwrite", False))
    
    if not identifier:
        return jsonify({"status": "error", "error": "Identifier is required"}), 400
    
    # Queue for progress messages
    progress_queue = queue.Queue()
    result_holder = {"result": None, "error": None}
    
    def progress_callback(step: str, platform: str, status: str):
        """Called by run_deep_clean_correlation to report progress."""
        progress_queue.put({
            "type": "progress",
            "step": step,
            "platform": platform,
            "status": status,
        })
    
    def run_deep_clean_thread():
        """Run the deep clean in a separate thread."""
        try:
            result = run_deep_clean_correlation(
                identifier=identifier,
                mongo_uri=MONGO_URI,
                preferred_model=preferred_model,
                progress_callback=progress_callback,
            )
            result_holder["result"] = result
        except Exception as e:
            result_holder["error"] = str(e)
        finally:
            progress_queue.put({"type": "done"})
    
    def generate_sse():
        """Generator for SSE stream."""
        # Start the deep clean in a thread
        thread = threading.Thread(target=run_deep_clean_thread)
        thread.start()
        
        # Stream progress events
        while True:
            try:
                msg = progress_queue.get(timeout=120)  # 2 min timeout
                
                if msg["type"] == "done":
                    # Send final result
                    if result_holder["error"]:
                        final = {"status": "error", "error": result_holder["error"]}
                    else:
                        final = {"status": "success", "result": result_holder["result"]}
                    
                    # Store the result in data_correlation DB
                    if result_holder["result"] and not result_holder["error"]:
                        try:
                            corr_db = client.get_database("data_correlation")
                            corr_collection = corr_db.get_collection("correlations")
                            
                            # Remove existing if overwrite
                            if overwrite:
                                corr_collection.delete_many({"identifier": identifier})
                            
                            doc = {
                                "identifier": identifier,
                                "mode": "deep_clean",
                                "collected_at": datetime.datetime.utcnow(),
                                "result": result_holder["result"]
                            }
                            corr_collection.update_one(
                                {"identifier": identifier}, 
                                {"$set": doc}, 
                                upsert=True
                            )
                        except Exception as e:
                            print(f"Failed to store deep clean result: {e}")
                    
                    yield f"data: {json.dumps(final)}\n\n"
                    break
                else:
                    # Send progress event
                    yield f"data: {json.dumps(msg)}\n\n"
                    
            except queue.Empty:
                # Timeout - send heartbeat
                yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
        
        thread.join(timeout=5)
    
    return Response(
        generate_sse(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )

# -----------------------------
# API Key Routes
# -----------------------------
@app.route("/api/get-keys", methods=["GET"])
def get_keys():
    return jsonify(get_saved_keys()), 200


@app.route("/api/status", methods=["GET"])
def api_status():
    """Return API key presence and MongoDB connectivity status."""
    keys = get_saved_keys()
    status = {
        "twitter": bool(keys.get("twitter")),
        "github": bool(keys.get("github")),
        "breachDirectory": bool(keys.get("breachDirectory")),
        "openRouter": bool(keys.get("openRouter"))
    }
    # MongoDB ping
    mongo_ok = False
    try:
        client.admin.command('ping')
        mongo_ok = True
    except Exception:
        mongo_ok = False

    return jsonify({"apis": status, "mongodb": mongo_ok}), 200


@app.route("/api/correlation/backends", methods=["GET"])
def correlation_backends_status():
    """Expose correlation backend capabilities and default selection for the UI."""
    try:
        status = detect_backends()
        default_backend = choose_backend()
        return jsonify({
            "backends": status,
            "default_backend": default_backend,
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/dashboard-summary", methods=["GET"])
def dashboard_summary():
    """Provide counts and last-collected identifiers across main collections and correlation info."""
    try:
        summary = {}
        # counts per collection in data_db
        for name, coll in collections.items():
            try:
                count = coll.count_documents({})
            except Exception:
                count = 0
            # last document by collected_at
            last = None
            try:
                doc = coll.find_one(sort=[("collected_at", -1)])
                if doc:
                    last = {"identifier": doc.get("identifier"), "collected_at": doc.get("collected_at")}
            except Exception:
                last = None
            summary[name] = {"count": count, "last": last}

        # correlation collection
        corr_db = client.get_database("data_correlation")
        corr_coll = corr_db.get_collection("correlations")
        try:
            corr_count = corr_coll.count_documents({})
            corr_last_doc = corr_coll.find_one(sort=[("collected_at", -1)])
            corr_last = {"identifier": corr_last_doc.get("identifier"), "collected_at": corr_last_doc.get("collected_at")} if corr_last_doc else None
        except Exception:
            corr_count = 0
            corr_last = None

        return jsonify({"collections": summary, "correlation": {"count": corr_count, "last": corr_last}}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/trends", methods=["GET"])
def api_trends():
    """Return per-day counts for the last N days for each collection and correlations."""
    try:
        days = int(request.args.get("days", 14))
        now = datetime.datetime.utcnow()
        dates = []
        counts = {}
        for i in range(days - 1, -1, -1):
            d = (now - datetime.timedelta(days=i)).date()
            dates.append(d.isoformat())

        # initialize counts per collection
        for name in collections.keys():
            counts[name] = [0] * days

        # correlations
        counts["Correlation"] = [0] * days

        # populate counts
        for idx, day in enumerate(dates):
            day_start = datetime.datetime.fromisoformat(day + "T00:00:00")
            day_end = day_start + datetime.timedelta(days=1)
            for name, coll in collections.items():
                try:
                    c = coll.count_documents({"collected_at": {"$gte": day_start, "$lt": day_end}})
                except Exception:
                    c = 0
                counts[name][idx] = c

            # correlations
            try:
                corr_db = client.get_database("data_correlation")
                corr_coll = corr_db.get_collection("correlations")
                c = corr_coll.count_documents({"collected_at": {"$gte": day_start, "$lt": day_end}})
            except Exception:
                c = 0
            counts["Correlation"][idx] = c

        return jsonify({"dates": dates, "counts": counts}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/profiles", methods=["GET"])
def api_profiles():
    """Return aggregated list of collected profiles (identifiers) with platforms and extracted usernames/handles."""
    try:
        profiles = {}
        for name, coll in collections.items():
            try:
                cursor = coll.find({}, {"identifier": 1, "data": 1, "collected_at": 1})
            except Exception:
                continue

            for doc in cursor:
                ident = doc.get("identifier")
                if not ident:
                    continue
                entry = profiles.setdefault(ident, {"identifier": ident, "platforms": set(), "usernames": set(), "last_collected": None})
                entry["platforms"].add(name)

                data = doc.get("data") or {}

                def add_if_str(val):
                    if isinstance(val, str) and val.strip():
                        entry["usernames"].add(val.strip())

                if isinstance(data, dict):
                    # common username-like fields
                    for key in ("login", "username", "screen_name", "handle", "name"):
                        v = data.get(key)
                        if isinstance(v, dict):
                            add_if_str(v.get("login") or v.get("username") or v.get("screen_name") or v.get("handle") or v.get("name"))
                        else:
                            add_if_str(v)

                    # lists of items or results
                    for arr_key in ("items", "results"):
                        arr = data.get(arr_key)
                        if isinstance(arr, list):
                            for it in arr:
                                if isinstance(it, dict):
                                    for k in ("login", "username", "screen_name", "handle", "name", "title", "url"):
                                        add_if_str(it.get(k))
                                elif isinstance(it, str):
                                    add_if_str(it)

                    # profile osint specific entries
                    results = data.get("results")
                    if isinstance(results, list):
                        for r in results:
                            if isinstance(r, dict):
                                add_if_str(r.get("title") or r.get("url") or r.get("snippet"))
                                plat = r.get("platform")
                                if plat:
                                    entry["platforms"].add(plat)

                # update last_collected
                cc = doc.get("collected_at")
                if cc:
                    if not entry["last_collected"] or cc > entry["last_collected"]:
                        entry["last_collected"] = cc

        out = []
        for ident, info in profiles.items():
            out.append({
                "identifier": ident,
                "platforms": sorted(list(info["platforms"])),
                "usernames": sorted(list(info["usernames"]))[:10],
                "last_collected": info["last_collected"]
            })

        out.sort(key=lambda x: x["last_collected"] or "", reverse=True)
        return jsonify({"profiles": out, "total": len(out)}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/recent-top", methods=["GET"])
def api_recent_top():
    """Return recent correlation docs and top identifiers across collections."""
    try:
        limit = int(request.args.get("limit", 10))
        # recent correlations
        corr_db = client.get_database("data_correlation")
        corr_coll = corr_db.get_collection("correlations")
        recent = []
        try:
            for doc in corr_coll.find().sort("collected_at", -1).limit(limit):
                recent.append({"identifier": doc.get("identifier"), "collected_at": doc.get("collected_at")})
        except Exception:
            recent = []

        # top identifiers by total docs across collections
        counts = {}
        for name, coll in collections.items():
            try:
                pipeline = [{"$group": {"_id": "$identifier", "cnt": {"$sum": 1}}}]
                for r in coll.aggregate(pipeline):
                    ident = r.get("_id")
                    if not ident:
                        continue
                    counts[ident] = counts.get(ident, 0) + r.get("cnt", 0)
            except Exception:
                continue

        top = sorted([{"identifier": k, "count": v} for k, v in counts.items()], key=lambda x: x["count"], reverse=True)[:limit]

        return jsonify({"recent_correlations": recent, "top_identifiers": top}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/save-keys", methods=["POST"])
def save_keys():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400

    # Remove _id if it exists
    if "_id" in data:
        del data["_id"]

    # Upsert document including new keys
    api_collection.update_one(
        {},
        {"$set": {
            "twitter": data.get("twitter", ""),
            "github": data.get("github", ""),
            "breachDirectory": data.get("breachDirectory", ""),
            "openRouter": data.get("openRouter", ""),           # <-- new
            "correlationModel": data.get("correlationModel", "")  # <-- new
        }},
        upsert=True
    )
    return jsonify({"message": "API keys saved successfully"}), 200


# -----------------------------
# Node Visualization API Routes
# -----------------------------
@app.route("/api/list-identifiers", methods=["GET"])
def list_identifiers():
    """Return list of all identifiers with their collection history."""
    try:
        identifiers = {}
        for name, coll in collections.items():
            try:
                cursor = coll.find({}, {"identifier": 1, "collected_at": 1})
                for doc in cursor:
                    ident = doc.get("identifier")
                    if not ident:
                        continue
                    if ident not in identifiers:
                        identifiers[ident] = {"platforms": [], "last_collected": None}
                    identifiers[ident]["platforms"].append(name)
                    cc = doc.get("collected_at")
                    if cc and (not identifiers[ident]["last_collected"] or cc > identifiers[ident]["last_collected"]):
                        identifiers[ident]["last_collected"] = cc
            except Exception:
                continue

        result = []
        for ident, info in identifiers.items():
            result.append({
                "identifier": ident,
                "platforms": info["platforms"],
                "last_collected": info["last_collected"]
            })
        result.sort(key=lambda x: x["last_collected"] or "", reverse=True)
        return jsonify({"identifiers": result}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/get-correlation/<identifier>", methods=["GET"])
def get_correlation(identifier):
    """Fetch correlation data for a specific identifier."""
    try:
        corr_db = client.get_database("data_correlation")
        corr_coll = corr_db.get_collection("correlations")
        doc = corr_coll.find_one({"identifier": identifier})
        
        if not doc:
            return jsonify({"error": "No correlation data found for this identifier. Run correlation first."}), 404
        
        # Return correlation result and metadata
        return jsonify({
            "identifier": identifier,
            "mode": doc.get("mode"),
            "collected_at": doc.get("collected_at"),
            "result": doc.get("result"),
            "prompt": doc.get("prompt")
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/get-osint-data/<identifier>", methods=["GET"])
def get_osint_data(identifier):
    """Fetch raw OSINT collection data for visualization."""
    try:
        osint_data = {}
        for name, coll in collections.items():
            try:
                doc = coll.find_one({"identifier": identifier})
                if doc and doc.get("data"):
                    osint_data[name] = {
                        "data": doc.get("data"),
                        "collected_at": doc.get("collected_at")
                    }
            except Exception:
                continue
        
        if not osint_data:
            return jsonify({"error": "No OSINT data found for this identifier"}), 404
        
        return jsonify({
            "identifier": identifier,
            "sources": osint_data
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/report/pdf", methods=["POST"])
def api_report_pdf():
    """Generate a professional PDF from a provided report JSON structure.
    Expected body: { "report": {..}, "filename": "optional" }
    """
    try:
        payload = request.get_json() or {}
        report = payload.get("report")
        if not report:
            return jsonify({"error": "Missing 'report' payload"}), 400

        pdf_bytes = build_pdf_bytes(report)
        # Build filename: username_dept_random.pdf
        meta = report.get("meta", {})
        ident = (meta.get("identifier") or meta.get("name") or "report").replace(" ", "_")
        dept = (meta.get("department") or "report").replace(" ", "_").lower()
        import random
        rand = random.randint(100000, 999999)
        filename = f"{ident}_{dept}_{rand}.pdf"

        resp = make_response(pdf_bytes)
        resp.headers.set('Content-Type', 'application/pdf')
        resp.headers.set('Content-Disposition', 'attachment', filename=filename)
        return resp
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/report/intel", methods=["POST"])
def api_report_intel():
  """Generate an AI-powered intelligence narrative for the report page.

  Expects JSON body:
  {
      "identifier": "...",            # required, must already have correlation
      "department": "osint|threat-intel|pentesting|malware-rev",  # optional, default osint
      "backend": "auto|local_flan|openrouter"  # optional hint
  }

  This does not re-run correlation; it loads the existing correlation document and asks
  the configured AI backend to produce a department-focused prose brief. For this route
  we prefer the local FLAN engine first, then fall back to OpenRouter/DeepSeek.
  """
  try:
      payload = request.get_json() or {}
      identifier = (payload.get("identifier") or "").strip()
      department = (payload.get("department") or "osint").strip()
      backend_hint = (payload.get("backend") or "auto").strip().lower()

      if not identifier:
          return jsonify({"error": "Missing 'identifier' in request body"}), 400

      result = generate_intel_report(
          identifier=identifier,
          department=department,
          backend=backend_hint,
          mongo_uri=MONGO_URI,
      )

      if isinstance(result, dict) and result.get("error"):
          return jsonify({"error": result.get("error"), "backend_used": result.get("backend_used")}), 500

      return jsonify({
          "status": "success",
          "identifier": identifier,
          "department": department,
          "backend_used": result.get("backend_used"),
          "narrative": result.get("narrative", ""),
      }), 200
  except Exception as e:
      return jsonify({"error": str(e)}), 500


@app.route("/api/report/comprehensive", methods=["POST"])
def api_report_comprehensive():
  """Generate a single comprehensive intelligence report.

  This endpoint generates a complete, unified report after correlation.
  No department selection needed - the report includes all intelligence aspects.

  Expects JSON body:
  {
      "identifier": "..."  # required, must already have correlation
  }

  Returns:
  {
      "status": "success",
      "report": { ... complete report object ... }
  }
  """
  try:
      payload = request.get_json() or {}
      identifier = (payload.get("identifier") or "").strip()

      if not identifier:
          return jsonify({"error": "Missing 'identifier' in request body"}), 400

      result = generate_comprehensive_report(
          identifier=identifier,
          mongo_uri=MONGO_URI,
      )

      if isinstance(result, dict) and result.get("error"):
          return jsonify({"error": result.get("error")}), 500

      return jsonify({
          "status": "success",
          "identifier": identifier,
          "report": result,
      }), 200
  except Exception as e:
      return jsonify({"error": str(e)}), 500


@app.route("/api/cleanup", methods=["POST"])
def api_cleanup():
    """Clean collected OSINT data and/or correlation data.

    Expected JSON body:
    {
        "collections": true|false,   # clean OSINT collections in data_db
        "correlations": true|false, # clean correlation results
        "files": true|false,        # clean JSON files in osint_results
        "identifier": "..."        # optional, limit cleanup to this identifier
    }
    """
    try:
        payload = request.get_json() or {}
        clear_collections = bool(payload.get("collections"))
        clear_correlations = bool(payload.get("correlations"))
        clear_files = bool(payload.get("files"))
        identifier = (payload.get("identifier") or "").strip()

        if not (clear_collections or clear_correlations or clear_files):
            return jsonify({"error": "Select at least one data type to clean."}), 400

        result = {"collections": {}, "correlations": 0, "files_removed": 0}

        # Clean Mongo collections in data_db
        if clear_collections:
            for name, coll in collections.items():
                try:
                    if identifier:
                        res = coll.delete_many({"identifier": identifier})
                    else:
                        res = coll.delete_many({})
                    result["collections"][name] = res.deleted_count
                except Exception as e:
                    result["collections"][name] = f"error: {e}"

        # Clean correlation results
        if clear_correlations:
            try:
                corr_db = client.get_database("data_correlation")
                corr_coll = corr_db.get_collection("correlations")
                if identifier:
                    res = corr_coll.delete_many({"identifier": identifier})
                else:
                    res = corr_coll.delete_many({})
                result["correlations"] = res.deleted_count
            except Exception as e:
                result["correlations"] = f"error: {e}"

        # Clean OSINT result files on disk
        if clear_files:
            try:
                count = 0
                if OSINT_RESULTS_DIR.exists():
                    pattern = f"{identifier}_*.json" if identifier else "*.json"
                    for f in OSINT_RESULTS_DIR.glob(pattern):
                        try:
                            f.unlink()
                            count += 1
                        except Exception:
                            continue
                result["files_removed"] = count
            except Exception as e:
                result["files_removed"] = f"error: {e}"

        return jsonify({"status": "success", "details": result}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# -----------------------------
# Run Server
# -----------------------------
if __name__ == "__main__":
    app.run(port=5000, debug=True)
