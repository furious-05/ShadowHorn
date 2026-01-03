# Profile Collection - Query-Based Multi-Username Feature

## Overview

ShadowHorn supports flexible username input for OSINT collection. You can use a single username for all platforms, or specify different usernames for each platform using query syntax.

---

## Input Modes

### 1. Simple Mode (Single Username)

Use the same username across all selected platforms.

```
furious-05
```

This will search for `furious-05` on GitHub, Twitter, Reddit, Snapchat, etc.

---

### 2. Query Mode (Platform-Specific Usernames)

Specify different usernames for different platforms using the query syntax:

```
platform1=username1;platform2=username2;platform3=username3
```

**Example:**
```
github=octocat;snapchat=kyliejenner;reddit=spez;twitter=elonmusk
```

This will:
- Search GitHub for `octocat`
- Search Snapchat for `kyliejenner`
- Search Reddit for `spez`
- Search Twitter for `elonmusk`

---

## Supported Platform Keys

| Key | Platform | Description |
|-----|----------|-------------|
| `generic` | Default/Fallback | Used for any platform not explicitly specified |
| `github` | GitHub | GitHub profile and repositories |
| `twitter` | Twitter/X | Twitter profile and tweets |
| `reddit` | Reddit | Reddit user profile and posts |
| `medium` | Medium | Medium articles and profile |
| `stackoverflow` | StackOverflow | StackOverflow profile and answers |
| `snapchat` | Snapchat | Snapchat public profile |
| `breachdirectory` or `breach` | BreachDirectory | Data breach lookups |
| `compromise` or `compromisecheck` | Compromise Check | Account compromise checks |
| `searchengines` or `search` | Search Engines | Web search results |
| `profileosint` or `profile` | ProfileOSINT | General profile discovery |

---

## Query Syntax Rules

1. **Format:** `platform=username`
2. **Separator:** Use semicolon `;` between entries
3. **Case-insensitive:** Platform keys are case-insensitive (`GitHub` = `github` = `GITHUB`)
4. **Order doesn't matter:** Platforms can be in any order
5. **Trailing semicolons:** Optional, will be ignored
6. **Spaces:** Trimmed automatically

---

## Examples

### Example 1: Single Username (All Platforms)
```
johndoe
```
Uses `johndoe` for all platforms.

---

### Example 2: Different Usernames Per Platform
```
generic=johndoe;github=john-dev;twitter=johntweeter;snapchat=johnnys
```
- GitHub → `john-dev`
- Twitter → `johntweeter`
- Snapchat → `johnnys`
- All other platforms → `johndoe` (generic fallback)

---

### Example 3: Only Specific Platforms
```
github=torvalds;stackoverflow=jon-skeet
```
- GitHub → `torvalds`
- StackOverflow → `jon-skeet`
- Other platforms → skipped (no generic fallback)

---

### Example 4: Mixed with Generic Fallback
```
generic=mainuser;snapchat=sc_user;reddit=rd_user
```
- Snapchat → `sc_user`
- Reddit → `rd_user`
- GitHub, Twitter, Medium, etc. → `mainuser`

---

### Example 5: Real-World OSINT Investigation
```
generic=target123;github=target-dev;twitter=target_official;snapchat=targetsnaps;reddit=target_throwaway
```
Collects OSINT from multiple platforms where the target uses different handles.

---

## How It Works (Technical)

### Backend Flow

1. **Input Parsing:** The `parse_username_query()` function in `app.py` detects whether input is simple or query-based.

2. **Username Mapping:** Creates a dictionary mapping platform names to usernames:
   ```python
   {
       "Generic": "mainuser",
       "GitHub": "john-dev",
       "Snapchat": "johnnys"
   }
   ```

3. **Platform-Specific Collection:** The `collect_async()` function uses `get_username_for(platform)` to retrieve the correct username for each collector.

4. **Fallback Logic:**
   - First checks for platform-specific username
   - Falls back to `Generic` if not found
   - Uses empty string if neither exists (platform skipped)

---

## Database Storage

When using query syntax, the parsed usernames are stored alongside collected data:

```json
{
    "identifier": "mainuser",
    "collected_at": "2026-01-02T12:00:00Z",
    "data": { ... },
    "query_usernames": {
        "Generic": "mainuser",
        "GitHub": "john-dev",
        "Snapchat": "johnnys"
    }
}
```

---

## Frontend UI

The Data Collection page includes:

1. **Updated placeholder text** showing query syntax example
2. **Help hint** below the username field explaining the feature
3. **Support for both modes** - no special toggle needed

---

## API Endpoint

**POST** `/api/collect-profile`

**Request Body:**
```json
{
    "username": "github=octocat;snapchat=kyliejenner",
    "email": "",
    "fullname": "",
    "keyword": "",
    "platforms": ["GitHub", "Snapchat", "Twitter"]
}
```

**Response:**
```json
{
    "status": "success",
    "results": {
        "GitHub": { ... },
        "Snapchat": { ... },
        "Twitter": { "error": "No username provided" }
    }
}
```

---

## Tips & Best Practices

1. **Use Generic for common username:** If most platforms share the same username, set it as `generic` and only specify exceptions.

2. **Selective Profiling:** Combine with Selective Profiling tab to only query platforms you have usernames for.

3. **Case sensitivity:** Usernames are passed as-is to collectors. Platform keys are normalized automatically.

4. **Special characters:** Usernames can contain special characters. Just avoid `=` and `;` in usernames.

5. **Validation:** The system validates that at least one username or identifier is provided.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Platform not collecting | Check if username is provided for that platform or generic fallback exists |
| Wrong username used | Verify platform key spelling (use lowercase) |
| No results | Ensure the username exists on the target platform |
| Query not parsed | Check for proper `=` and `;` syntax |

---

## Version History

- **v1.0** (January 2026): Initial implementation of query-based multi-username support
