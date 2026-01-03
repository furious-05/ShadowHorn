/**
 * Best-effort normalisation of correlation payloads.
 *
 * Older documents / backends may nest the profile under
 * `result.result` or `result.profile`. Newer ones store
 * the canonical profile directly in `result`.
 */
const normaliseCorrelationResult = (correlationData) => {
  if (!correlationData) return null;

  let profile = correlationData.result || correlationData.profile || correlationData;

  // Unwrap common nested shapes: { result: {...} } or { profile: {...} }
  if (profile && typeof profile === "object") {
    if (profile.result && typeof profile.result === "object") {
      profile = profile.result;
    } else if (profile.profile && typeof profile.profile === "object") {
      profile = profile.profile;
    }
  }

  if (!profile || typeof profile !== "object") return null;

  return profile;
};

/**
 * Transform correlation data into graph nodes and edges
 * for force-directed graph visualization
 */

export const transformCorrelationToGraph = (correlationData) => {
  const result = normaliseCorrelationResult(correlationData);
  if (!result) {
    return { nodes: [], links: [] };
  }
  const nodes = [];
  const links = [];
  const nodeIds = new Set();

  // Helper to add unique node
  const addNode = (id, label, type, data = {}) => {
    if (!nodeIds.has(id)) {
      nodes.push({
        id,
        label,
        type,
        ...data,
      });
      nodeIds.add(id);
    }
  };

  // Helper to add link
  const addLink = (source, target, relationship) => {
    const linkKey = [source, target].sort().join("-");
    if (!links.some((l) => [l.source, l.target].sort().join("-") === linkKey)) {
      links.push({
        source,
        target,
        relationship,
      });
    }
  };

  // Main entity (user/profile)
  const mainId = result.name || result.identifier || "User";
  addNode(mainId, result.name || result.identifier || "Profile", "user", {
    bio: result.bio || "",
    location: result.primary_location || result.location || "",
    compromised: !!result.compromised,
  });

  // ==================== PRIMARY LOCATION ====================
  const primaryLocation = result.primary_location || result.location;
  if (primaryLocation) {
    const locId = `location-primary`;
    addNode(locId, primaryLocation, "location", {
      locationType: "primary",
      description: "Primary location",
      platform: "location"
    });
    addLink(mainId, locId, "located at");
  }

  // ==================== USERNAMES ====================
  if (result.usernames) {
    if (typeof result.usernames === "object" && !Array.isArray(result.usernames)) {
      // Object with platform keys
      Object.entries(result.usernames).forEach(([platform, usernameData]) => {
        const handle = usernameData.handle || usernameData;
        const uid = `username-${platform}-${handle}`;
        addNode(uid, `@${handle}`, "username", { 
          platform,
          url: usernameData.url 
        });
        addLink(mainId, uid, `uses on ${platform}`);
      });
    } else if (Array.isArray(result.usernames)) {
      result.usernames.forEach((username) => {
        const uid = `username-${username}`;
        addNode(uid, `@${username}`, "username", { platform: "various" });
        addLink(mainId, uid, "username");
      });
    }
  }

  // ==================== EMAILS ====================
  if (Array.isArray(result.emails)) {
    result.emails.forEach((email) => {
      const eid = `email-${email}`;
      addNode(eid, email, "email");
      addLink(mainId, eid, "email");
    });
  }

  // ==================== REPOSITORIES ====================
  if (Array.isArray(result.repositories)) {
    result.repositories.forEach((repo) => {
      const rid = `repo-${repo.name}`;
      addNode(rid, repo.name, "repository", {
        description: repo.description,
        stars: repo.stars,
        forks: repo.forks,
        url: repo.url,
      });
      addLink(mainId, rid, "owns repository");
    });
  }

  // ==================== POSTS/ACTIVITY ====================
  if (Array.isArray(result.posts)) {
    result.posts.forEach((post, idx) => {
      const pid = `post-${idx}`;
      const label = (post.title || post.content || `Post on ${post.platform}`).substring(0, 30);
      addNode(pid, label, "post", {
        platform: post.platform,
        date: post.date || post.created_at,
        url: post.url,
        metrics: post.metrics,
      });
      addLink(mainId, pid, "posted on");
    });
  }

  // ==================== INTERESTS ====================
  const interests = Array.isArray(result.possible_interests)
    ? result.possible_interests
    : Array.isArray(result.interests)
    ? result.interests
    : [];

  if (interests.length) {
    interests.forEach((interest, idx) => {
      const iid = `interest-${idx}`;
      addNode(iid, interest, "interest");
      addLink(mainId, iid, "interested in");
    });
  }

  // ==================== KEY TIMELINES ====================
  if (Array.isArray(result.key_timelines)) {
    result.key_timelines.slice(0, 5).forEach((timeline, idx) => {
      const tid = `timeline-${idx}`;
      // Extract date and event
      const parts = timeline.split(": ");
      const date = parts[0] || "Unknown";
      const event = parts[1] || timeline;
      const label = `${date}`;
      
      addNode(tid, label, "timeline", {
        date: date,
        description: event,
      });
      addLink(mainId, tid, "milestone");
    });
  }

  // ==================== CONNECTIONS/RELATIONSHIPS ====================
  if (Array.isArray(result.relationship_graph)) {
    result.relationship_graph.forEach((rel, idx) => {
      const relId = `connection-${idx}`;
      const username = rel.username || rel.handle || rel.name || "Unknown";
      const platform = rel.platform || "General";
      const type = rel.type || "connected";
      
      addNode(relId, username, "connection", {
        platform: platform,
        relationship: type,
      });
      addLink(mainId, relId, type);
    });
  }

  // ==================== BEHAVIORAL ANOMALIES ====================
  if (Array.isArray(result.behavioral_anomalies)) {
    result.behavioral_anomalies.slice(0, 3).forEach((anomaly, idx) => {
      const aid = `anomaly-${idx}`;
      const label = anomaly.substring(0, 30);
      addNode(aid, label, "activity", {
        description: anomaly,
      });
      addLink(mainId, aid, "exhibits");
    });
  }

  // ==================== ACTIVITY PATTERNS ====================
  if (result.activity_patterns) {
    const patterns = typeof result.activity_patterns === "string"
      ? result.activity_patterns
      : result.activity_patterns.toString();
    
    const apid = "activity-pattern";
    const label = patterns.substring(0, 40);
    addNode(apid, label, "activity", {
      description: patterns,
    });
    addLink(mainId, apid, "activity pattern");
  }

  // ==================== LINKS/PROFILES ====================
  if (result.links && typeof result.links === "object") {
    Object.entries(result.links).forEach(([platform, url]) => {
      const lid = `link-${platform}`;
      addNode(lid, platform.toUpperCase(), "source", {
        url: url,
        platform: platform,
      });
      addLink(mainId, lid, `profile on ${platform}`);
    });
  }

  // ==================== SNAPCHAT PROFILES ====================
  if (result.snapchat_profiles && Array.isArray(result.snapchat_profiles)) {
    result.snapchat_profiles.forEach((sc, idx) => {
      const scUsername = sc.username || sc.handle || `snapchat-${idx}`;
      const scId = `snapchat-profile-${scUsername}`;
      addNode(scId, sc.display_name || `@${scUsername}`, "source", {
        platform: "snapchat",
        url: `https://www.snapchat.com/add/${scUsername}`,
        bio: sc.bio || sc.description,
        verified: sc.is_verified || sc.verified,
        followers: sc.follower_count || sc.followers,
      });
      addLink(mainId, scId, "profile on Snapchat");

      // Add Snapchat highlights as posts
      if (sc.highlights && Array.isArray(sc.highlights)) {
        sc.highlights.slice(0, 5).forEach((highlight, hidx) => {
          const hid = `snapchat-highlight-${idx}-${hidx}`;
          const label = highlight.title || highlight.name || `Highlight ${hidx + 1}`;
          addNode(hid, label, "post", {
            platform: "snapchat",
            description: highlight.description,
            date: highlight.date || highlight.created_at,
          });
          addLink(scId, hid, "shared");
        });
      }
    });
  }

  // ==================== SNAPCHAT DATA (DIRECT) ====================
  if (result.snapchat) {
    const sc = result.snapchat;
    const scUsername = sc.username || sc.handle;
    if (scUsername) {
      const scId = `snapchat-${scUsername}`;
      addNode(scId, sc.display_name || `@${scUsername}`, "source", {
        platform: "snapchat",
        url: sc.url || `https://www.snapchat.com/add/${scUsername}`,
        bio: sc.bio || sc.description,
        verified: sc.is_verified || sc.verified,
        followers: sc.follower_count || sc.followers,
      });
      addLink(mainId, scId, "profile on Snapchat");

      // Snapchat highlights
      if (sc.highlights && Array.isArray(sc.highlights)) {
        sc.highlights.slice(0, 5).forEach((highlight, hidx) => {
          const hid = `snapchat-highlight-${hidx}`;
          const label = highlight.title || highlight.name || `Highlight ${hidx + 1}`;
          addNode(hid, label, "post", {
            platform: "snapchat",
            description: highlight.description,
          });
          addLink(scId, hid, "shared");
        });
      }
    }
  }

  // ==================== PLATFORM-SPECIFIC DATA NODES ====================
  // Handle platform_data object which may contain snapchat and other platforms
  if (result.platform_data && typeof result.platform_data === "object") {
    Object.entries(result.platform_data).forEach(([platform, data]) => {
      if (platform.toLowerCase() === "snapchat" && data) {
        const scUsername = data.username || data.handle;
        if (scUsername) {
          const scId = `snapchat-data-${scUsername}`;
          addNode(scId, data.display_name || `@${scUsername}`, "source", {
            platform: "snapchat",
            url: data.url || `https://www.snapchat.com/add/${scUsername}`,
            bio: data.bio,
            verified: data.is_verified,
            followers: data.follower_count,
          });
          addLink(mainId, scId, "profile on Snapchat");
        }
      }
    });
  }

  return { nodes, links };
};

/**
 * Get summary text from correlation result
 */
export const getCorrelationSummary = (correlationData) => {
  if (!correlationData || !correlationData.result) {
    return "No correlation data available";
  }

  const result = correlationData.result;
  return result.summary || "Correlation analysis complete";
};
