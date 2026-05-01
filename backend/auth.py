import os
import base64
import hashlib
import hmac
import json
import time
import secrets
from functools import wraps
from flask import request, jsonify, g
from pymongo import MongoClient

JWT_SECRET = os.environ.get("JWT_SECRET", secrets.token_hex(32))
TOKEN_EXPIRY = 86400  # 24 hours

DEFAULT_USERNAME = "shadowhorn"
DEFAULT_PASSWORD = "ShadowHorn@2026"

MONGO_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27017/")


def _get_mongo_client():
    return MongoClient(MONGO_URI)


def get_auth_collection():
    client = _get_mongo_client()
    db = client["settings_db"]
    return db["users"]


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100000)
    return f"{salt}${h.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, h = stored.split("$", 1)
        computed = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100000)
        return hmac.compare_digest(computed.hex(), h)
    except (ValueError, AttributeError):
        return False


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_decode(s: str) -> bytes:
    s += "=" * (4 - len(s) % 4)
    return base64.urlsafe_b64decode(s)


def _sign(signing_input: str) -> str:
    sig = hmac.new(
        JWT_SECRET.encode(), signing_input.encode(), hashlib.sha256
    ).digest()
    return _b64url_encode(sig)


def create_token(username: str, must_change: bool = False) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "sub": username,
        "iat": int(time.time()),
        "exp": int(time.time()) + TOKEN_EXPIRY,
        "must_change_password": must_change,
    }
    h_enc = _b64url_encode(json.dumps(header, separators=(",", ":")).encode())
    p_enc = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode())
    signing_input = f"{h_enc}.{p_enc}"
    signature = _sign(signing_input)
    return f"{signing_input}.{signature}"


def decode_token(token: str) -> dict | None:
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None

        signing_input = f"{parts[0]}.{parts[1]}"
        expected_sig = _sign(signing_input)

        if not hmac.compare_digest(parts[2], expected_sig):
            return None

        payload_raw = _b64url_decode(parts[1])
        payload = json.loads(payload_raw)

        if payload.get("exp", 0) < time.time():
            return None

        return payload
    except Exception:
        return None


def ensure_default_user():
    """Create default user if no users exist in the database."""
    coll = get_auth_collection()
    coll.create_index("username", unique=True)
    if coll.count_documents({}) == 0:
        try:
            coll.insert_one({
                "username": DEFAULT_USERNAME,
                "password": hash_password(DEFAULT_PASSWORD),
                "must_change_password": True,
                "created_at": int(time.time()),
            })
        except Exception:
            pass


def require_auth(f):
    """Decorator to protect routes with JWT authentication."""
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "Authentication required"}), 401

        token = auth_header[7:]
        payload = decode_token(token)
        if not payload:
            return jsonify({"error": "Invalid or expired token"}), 401

        g.current_user = payload.get("sub")
        g.must_change_password = payload.get("must_change_password", False)
        return f(*args, **kwargs)
    return decorated


def register_auth_routes(app):
    """Register authentication endpoints on the Flask app."""

    @app.route("/api/auth/login", methods=["POST"])
    def auth_login():
        data = request.get_json() or {}
        username = (data.get("username") or "").strip()
        password = data.get("password") or ""

        if not username or not password:
            return jsonify({"error": "Username and password required"}), 400

        coll = get_auth_collection()
        user = coll.find_one({"username": username})

        if not user or not verify_password(password, user["password"]):
            return jsonify({"error": "Invalid credentials"}), 401

        must_change = user.get("must_change_password", False)
        token = create_token(username, must_change=must_change)

        return jsonify({
            "token": token,
            "username": username,
            "must_change_password": must_change,
        }), 200

    @app.route("/api/auth/change-password", methods=["POST"])
    @require_auth
    def auth_change_password():
        data = request.get_json() or {}
        current_password = data.get("current_password") or ""
        new_password = data.get("new_password") or ""

        if not current_password or not new_password:
            return jsonify({"error": "Current and new password required"}), 400

        if len(new_password) < 8:
            return jsonify({"error": "New password must be at least 8 characters"}), 400

        coll = get_auth_collection()
        user = coll.find_one({"username": g.current_user})

        if not user or not verify_password(current_password, user["password"]):
            return jsonify({"error": "Current password is incorrect"}), 401

        coll.update_one(
            {"username": g.current_user},
            {"$set": {
                "password": hash_password(new_password),
                "must_change_password": False,
            }}
        )

        token = create_token(g.current_user, must_change=False)
        return jsonify({
            "message": "Password changed successfully",
            "token": token,
        }), 200

    @app.route("/api/auth/verify", methods=["GET"])
    @require_auth
    def auth_verify():
        return jsonify({
            "valid": True,
            "username": g.current_user,
            "must_change_password": g.must_change_password,
        }), 200
