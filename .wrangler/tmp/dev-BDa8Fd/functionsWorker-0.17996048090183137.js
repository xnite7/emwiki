var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/pages-0ICVPy/functionsWorker-0.17996048090183137.mjs
var __defProp2 = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
var __esm = /* @__PURE__ */ __name((fn, res) => /* @__PURE__ */ __name(function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
}, "__init"), "__esm");
var __export = /* @__PURE__ */ __name((target, all) => {
  for (var name in all)
    __defProp2(target, name, { get: all[name], enumerable: true });
}, "__export");
async function getUserFromToken(token, env) {
  if (!token) return null;
  const session = await env.DBA.prepare(
    "SELECT user_id FROM sessions WHERE token = ? AND expires_at > ?"
  ).bind(token, Date.now()).first();
  if (!session) return null;
  const user = await env.DBA.prepare(
    "SELECT user_id, username, display_name, role FROM users WHERE user_id = ?"
  ).bind(session.user_id).first();
  return user;
}
__name(getUserFromToken, "getUserFromToken");
function isAdmin(user) {
  if (!user || !user.role) return false;
  try {
    const roles = JSON.parse(user.role);
    return roles.includes("admin") || roles.includes("moderator");
  } catch {
    return false;
  }
}
__name(isAdmin, "isAdmin");
async function getLikeCount(commentId, env) {
  const result = await env.DBA.prepare(
    "SELECT COUNT(*) as count FROM forum_likes WHERE comment_id = ?"
  ).bind(commentId).first();
  return result?.count || 0;
}
__name(getLikeCount, "getLikeCount");
async function handlePost({ request, env, params }) {
  const path = params.path ? params.path.join("/") : "";
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  const user = await getUserFromToken(token, env);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }
  if (path.endsWith("/like")) {
    const commentId = parseInt(path.split("/")[0]);
    const existingLike = await env.DBA.prepare(
      "SELECT id FROM forum_likes WHERE comment_id = ? AND user_id = ?"
    ).bind(commentId, user.user_id).first();
    if (existingLike) {
      await env.DBA.prepare(
        "DELETE FROM forum_likes WHERE comment_id = ? AND user_id = ?"
      ).bind(commentId, user.user_id).run();
      const likeCount = await getLikeCount(commentId, env);
      return new Response(JSON.stringify({
        liked: false,
        like_count: likeCount
      }), {
        headers: { "Content-Type": "application/json" }
      });
    } else {
      await env.DBA.prepare(
        "INSERT INTO forum_likes (user_id, comment_id, created_at) VALUES (?, ?, ?)"
      ).bind(user.user_id, commentId, Math.floor(Date.now() / 1e3)).run();
      const likeCount = await getLikeCount(commentId, env);
      return new Response(JSON.stringify({
        liked: true,
        like_count: likeCount
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }
  }
  try {
    const data = await request.json();
    const { post_id, content, parent_comment_id } = data;
    if (!post_id || !content) {
      return new Response(JSON.stringify({
        error: "Missing required fields: post_id, content"
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    const post = await env.DBA.prepare(
      'SELECT * FROM forum_posts WHERE id = ? AND status = "active"'
    ).bind(post_id).first();
    if (!post) {
      return new Response(JSON.stringify({
        error: "Post not found or has been deleted"
      }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (post.is_locked) {
      return new Response(JSON.stringify({
        error: "This post is locked and cannot accept new comments"
      }), {
        status: 403,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (content.length > 2e3) {
      return new Response(JSON.stringify({
        error: "Comment too long (max 2000 characters)"
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    const result = await env.DBA.prepare(
      `INSERT INTO forum_comments (post_id, user_id, username, content, parent_comment_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      post_id,
      user.user_id,
      user.display_name || user.username,
      content,
      parent_comment_id || null,
      Math.floor(Date.now() / 1e3)
    ).run();
    const commentId = result.meta.last_row_id;
    const comment = await env.DBA.prepare(
      `SELECT c.*, u.role
       FROM forum_comments c
       LEFT JOIN users u ON c.user_id = u.user_id
       WHERE c.id = ?`
    ).bind(commentId).first();
    comment.like_count = 0;
    comment.user_has_liked = false;
    return new Response(JSON.stringify({
      success: true,
      comment,
      message: "Comment posted successfully!"
    }), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Failed to create comment: " + err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
__name(handlePost, "handlePost");
async function handlePut({ request, env, params }) {
  const path = params.path ? params.path.join("/") : "";
  const commentId = parseInt(path);
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  const user = await getUserFromToken(token, env);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }
  const comment = await env.DBA.prepare(
    "SELECT * FROM forum_comments WHERE id = ?"
  ).bind(commentId).first();
  if (!comment) {
    return new Response(JSON.stringify({ error: "Comment not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    });
  }
  if (comment.user_id !== user.user_id && !isAdmin(user)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 403,
      headers: { "Content-Type": "application/json" }
    });
  }
  try {
    const data = await request.json();
    const { content } = data;
    if (!content) {
      return new Response(JSON.stringify({
        error: "Missing required field: content"
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    await env.DBA.prepare(
      `UPDATE forum_comments
       SET content = ?, edited_at = ?
       WHERE id = ?`
    ).bind(content, Math.floor(Date.now() / 1e3), commentId).run();
    return new Response(JSON.stringify({
      success: true,
      message: "Comment updated successfully!"
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Failed to update comment: " + err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
__name(handlePut, "handlePut");
async function handleDelete({ request, env, params }) {
  const path = params.path ? params.path.join("/") : "";
  const commentId = parseInt(path);
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  const user = await getUserFromToken(token, env);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }
  const comment = await env.DBA.prepare(
    "SELECT * FROM forum_comments WHERE id = ?"
  ).bind(commentId).first();
  if (!comment) {
    return new Response(JSON.stringify({ error: "Comment not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    });
  }
  if (comment.user_id !== user.user_id && !isAdmin(user)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 403,
      headers: { "Content-Type": "application/json" }
    });
  }
  try {
    await env.DBA.prepare(
      'UPDATE forum_comments SET status = "deleted" WHERE id = ?'
    ).bind(commentId).run();
    return new Response(JSON.stringify({
      success: true,
      message: "Comment deleted successfully!"
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Failed to delete comment: " + err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
__name(handleDelete, "handleDelete");
async function onRequest(context) {
  const { request, env, params } = context;
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    let response;
    switch (request.method) {
      case "POST":
        response = await handlePost({ request, env, params });
        break;
      case "PUT":
        response = await handlePut({ request, env, params });
        break;
      case "DELETE":
        response = await handleDelete({ request, env, params });
        break;
      default:
        response = new Response(JSON.stringify({ error: "Method not allowed" }), {
          status: 405,
          headers: { "Content-Type": "application/json" }
        });
    }
    const newHeaders = new Headers(response.headers);
    Object.entries(corsHeaders).forEach(([key, value]) => {
      newHeaders.set(key, value);
    });
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}
__name(onRequest, "onRequest");
var init_path = __esm({
  "api/forum/comments/[[path]].js"() {
    init_functionsRoutes_0_10531370690170583();
    __name2(getUserFromToken, "getUserFromToken");
    __name2(isAdmin, "isAdmin");
    __name2(getLikeCount, "getLikeCount");
    __name2(handlePost, "handlePost");
    __name2(handlePut, "handlePut");
    __name2(handleDelete, "handleDelete");
    __name2(onRequest, "onRequest");
  }
});
async function createSession(name, secret) {
  const issued = Date.now();
  const payload = { name, issued };
  const encoded = btoa(JSON.stringify(payload));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encoded));
  const sigHex = [...new Uint8Array(sigBuffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${encoded}.${sigHex}`;
}
__name(createSession, "createSession");
async function verifySession(token, secret) {
  const [encoded, sigHex] = token.split(".");
  if (!encoded || !sigHex) return null;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encoded));
  const expectedHex = [...new Uint8Array(sigBuffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (expectedHex !== sigHex) return null;
  return JSON.parse(atob(encoded));
}
__name(verifySession, "verifySession");
var init_auth = __esm({
  "api/_utils/auth.js"() {
    init_functionsRoutes_0_10531370690170583();
    __name2(createSession, "createSession");
    __name2(verifySession, "verifySession");
  }
});
async function getUserFromToken2(token, env) {
  if (!token) return null;
  const session = await env.DBA.prepare(
    "SELECT user_id FROM sessions WHERE token = ? AND expires_at > ?"
  ).bind(token, Date.now()).first();
  if (!session) return null;
  const user = await env.DBA.prepare(
    "SELECT user_id, username, display_name, role FROM users WHERE user_id = ?"
  ).bind(session.user_id).first();
  return user;
}
__name(getUserFromToken2, "getUserFromToken2");
function isAdmin2(user) {
  if (!user || !user.role) return false;
  try {
    const roles = JSON.parse(user.role);
    return roles.includes("admin") || roles.includes("moderator");
  } catch {
    return false;
  }
}
__name(isAdmin2, "isAdmin2");
async function getCommentCount(postId, env) {
  const result = await env.DBA.prepare(
    'SELECT COUNT(*) as count FROM forum_comments WHERE post_id = ? AND status = "active"'
  ).bind(postId).first();
  return result?.count || 0;
}
__name(getCommentCount, "getCommentCount");
async function getLikeCount2(postId, env) {
  const result = await env.DBA.prepare(
    "SELECT COUNT(*) as count FROM forum_likes WHERE post_id = ?"
  ).bind(postId).first();
  return result?.count || 0;
}
__name(getLikeCount2, "getLikeCount2");
async function hasUserLiked(postId, userId, env) {
  if (!userId) return false;
  const result = await env.DBA.prepare(
    "SELECT id FROM forum_likes WHERE post_id = ? AND user_id = ?"
  ).bind(postId, userId).first();
  return !!result;
}
__name(hasUserLiked, "hasUserLiked");
async function handleGet({ request, env, params }) {
  const url = new URL(request.url);
  const path = params.path ? params.path.join("/") : "";
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  const user = token ? await getUserFromToken2(token, env) : null;
  if (path && path !== "" && !path.includes("/")) {
    const postId = parseInt(path);
    const post = await env.DBA.prepare(
      `SELECT p.*, u.role
       FROM forum_posts p
       LEFT JOIN users u ON p.user_id = u.user_id
       WHERE p.id = ? AND p.status = 'active'`
    ).bind(postId).first();
    if (!post) {
      return new Response(JSON.stringify({ error: "Post not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }
    const comments = await env.DBA.prepare(
      `SELECT c.*, u.role
       FROM forum_comments c
       LEFT JOIN users u ON c.user_id = u.user_id
       WHERE c.post_id = ? AND c.status = 'active'
       ORDER BY c.created_at ASC`
    ).bind(postId).all();
    post.like_count = await getLikeCount2(postId, env);
    post.user_has_liked = await hasUserLiked(postId, user?.user_id, env);
    for (const comment of comments.results || []) {
      comment.like_count = await getLikeCount2(null, env, comment.id);
      comment.user_has_liked = await hasUserLikedComment(comment.id, user?.user_id, env);
    }
    return new Response(JSON.stringify({
      post,
      comments: comments.results || []
    }), {
      headers: { "Content-Type": "application/json" }
    });
  }
  const category = url.searchParams.get("category");
  const limit = parseInt(url.searchParams.get("limit")) || 100;
  const offset = parseInt(url.searchParams.get("offset")) || 0;
  let query = `
    SELECT p.*, u.role
    FROM forum_posts p
    LEFT JOIN users u ON p.user_id = u.user_id
    WHERE p.status = 'active'
  `;
  const params_list = [];
  if (category && category !== "all") {
    query += " AND p.category = ?";
    params_list.push(category);
  }
  query += " ORDER BY p.is_pinned DESC, p.created_at DESC LIMIT ? OFFSET ?";
  params_list.push(limit, offset);
  const posts = await env.DBA.prepare(query).bind(...params_list).all();
  for (const post of posts.results || []) {
    post.comment_count = await getCommentCount(post.id, env);
    post.like_count = await getLikeCount2(post.id, env);
    post.user_has_liked = await hasUserLiked(post.id, user?.user_id, env);
  }
  return new Response(JSON.stringify({ posts: posts.results || [] }), {
    headers: { "Content-Type": "application/json" }
  });
}
__name(handleGet, "handleGet");
async function handlePost2({ request, env, params }) {
  const path = params.path ? params.path.join("/") : "";
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  const user = await getUserFromToken2(token, env);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }
  if (path.endsWith("/like")) {
    const postId = parseInt(path.split("/")[0]);
    const existingLike = await env.DBA.prepare(
      "SELECT id FROM forum_likes WHERE post_id = ? AND user_id = ?"
    ).bind(postId, user.user_id).first();
    if (existingLike) {
      await env.DBA.prepare(
        "DELETE FROM forum_likes WHERE post_id = ? AND user_id = ?"
      ).bind(postId, user.user_id).run();
      const likeCount = await getLikeCount2(postId, env);
      return new Response(JSON.stringify({
        liked: false,
        like_count: likeCount
      }), {
        headers: { "Content-Type": "application/json" }
      });
    } else {
      await env.DBA.prepare(
        "INSERT INTO forum_likes (user_id, post_id, created_at) VALUES (?, ?, ?)"
      ).bind(user.user_id, postId, Math.floor(Date.now() / 1e3)).run();
      const likeCount = await getLikeCount2(postId, env);
      return new Response(JSON.stringify({
        liked: true,
        like_count: likeCount
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }
  }
  if (path.endsWith("/view")) {
    const postId = parseInt(path.split("/")[0]);
    await env.DBA.prepare(
      "UPDATE forum_posts SET views = views + 1 WHERE id = ?"
    ).bind(postId).run();
    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" }
    });
  }
  try {
    const data = await request.json();
    const { category, title, content } = data;
    if (!category || !title || !content) {
      return new Response(JSON.stringify({
        error: "Missing required fields: category, title, content"
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    const validCategories = ["general", "trading", "updates", "guides", "feedback", "off-topic"];
    if (!validCategories.includes(category)) {
      return new Response(JSON.stringify({
        error: "Invalid category"
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (title.length > 200) {
      return new Response(JSON.stringify({
        error: "Title too long (max 200 characters)"
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (content.length > 5e3) {
      return new Response(JSON.stringify({
        error: "Content too long (max 5000 characters)"
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    const result = await env.DBA.prepare(
      `INSERT INTO forum_posts (user_id, username, title, content, category, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      user.user_id,
      user.display_name || user.username,
      title,
      content,
      category,
      Math.floor(Date.now() / 1e3)
    ).run();
    const postId = result.meta.last_row_id;
    const post = await env.DBA.prepare(
      "SELECT * FROM forum_posts WHERE id = ?"
    ).bind(postId).first();
    return new Response(JSON.stringify({
      success: true,
      post,
      message: "Post created successfully!"
    }), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Failed to create post: " + err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
__name(handlePost2, "handlePost2");
async function handlePut2({ request, env, params }) {
  const path = params.path ? params.path.join("/") : "";
  const postId = parseInt(path);
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  const user = await getUserFromToken2(token, env);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }
  const post = await env.DBA.prepare(
    "SELECT * FROM forum_posts WHERE id = ?"
  ).bind(postId).first();
  if (!post) {
    return new Response(JSON.stringify({ error: "Post not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    });
  }
  if (post.user_id !== user.user_id && !isAdmin2(user)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 403,
      headers: { "Content-Type": "application/json" }
    });
  }
  try {
    const data = await request.json();
    const { title, content } = data;
    if (!title || !content) {
      return new Response(JSON.stringify({
        error: "Missing required fields: title, content"
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    await env.DBA.prepare(
      `UPDATE forum_posts
       SET title = ?, content = ?, edited_at = ?
       WHERE id = ?`
    ).bind(title, content, Math.floor(Date.now() / 1e3), postId).run();
    return new Response(JSON.stringify({
      success: true,
      message: "Post updated successfully!"
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Failed to update post: " + err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
__name(handlePut2, "handlePut2");
async function handleDelete2({ request, env, params }) {
  const path = params.path ? params.path.join("/") : "";
  const postId = parseInt(path);
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  const user = await getUserFromToken2(token, env);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }
  const post = await env.DBA.prepare(
    "SELECT * FROM forum_posts WHERE id = ?"
  ).bind(postId).first();
  if (!post) {
    return new Response(JSON.stringify({ error: "Post not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    });
  }
  if (post.user_id !== user.user_id && !isAdmin2(user)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 403,
      headers: { "Content-Type": "application/json" }
    });
  }
  try {
    await env.DBA.prepare(
      'UPDATE forum_posts SET status = "deleted" WHERE id = ?'
    ).bind(postId).run();
    return new Response(JSON.stringify({
      success: true,
      message: "Post deleted successfully!"
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Failed to delete post: " + err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
__name(handleDelete2, "handleDelete2");
async function hasUserLikedComment(commentId, userId, env) {
  if (!userId) return false;
  const result = await env.DBA.prepare(
    "SELECT id FROM forum_likes WHERE comment_id = ? AND user_id = ?"
  ).bind(commentId, userId).first();
  return !!result;
}
__name(hasUserLikedComment, "hasUserLikedComment");
async function onRequest2(context) {
  const { request, env, params } = context;
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    let response;
    switch (request.method) {
      case "GET":
        response = await handleGet({ request, env, params });
        break;
      case "POST":
        response = await handlePost2({ request, env, params });
        break;
      case "PUT":
        response = await handlePut2({ request, env, params });
        break;
      case "DELETE":
        response = await handleDelete2({ request, env, params });
        break;
      default:
        response = new Response(JSON.stringify({ error: "Method not allowed" }), {
          status: 405,
          headers: { "Content-Type": "application/json" }
        });
    }
    const newHeaders = new Headers(response.headers);
    Object.entries(corsHeaders).forEach(([key, value]) => {
      newHeaders.set(key, value);
    });
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}
__name(onRequest2, "onRequest2");
var init_path2 = __esm({
  "api/forum/posts/[[path]].js"() {
    init_functionsRoutes_0_10531370690170583();
    init_auth();
    __name2(getUserFromToken2, "getUserFromToken");
    __name2(isAdmin2, "isAdmin");
    __name2(getCommentCount, "getCommentCount");
    __name2(getLikeCount2, "getLikeCount");
    __name2(hasUserLiked, "hasUserLiked");
    __name2(handleGet, "handleGet");
    __name2(handlePost2, "handlePost");
    __name2(handlePut2, "handlePut");
    __name2(handleDelete2, "handleDelete");
    __name2(hasUserLikedComment, "hasUserLikedComment");
    __name2(onRequest2, "onRequest");
  }
});
var helpers_exports = {};
__export(helpers_exports, {
  authenticateUser: /* @__PURE__ */ __name(() => authenticateUser, "authenticateUser"),
  createNotification: /* @__PURE__ */ __name(() => createNotification, "createNotification"),
  errorResponse: /* @__PURE__ */ __name(() => errorResponse, "errorResponse"),
  getUserWithStats: /* @__PURE__ */ __name(() => getUserWithStats, "getUserWithStats"),
  isAuthorized: /* @__PURE__ */ __name(() => isAuthorized, "isAuthorized"),
  parsePagination: /* @__PURE__ */ __name(() => parsePagination, "parsePagination"),
  parseSort: /* @__PURE__ */ __name(() => parseSort, "parseSort"),
  successResponse: /* @__PURE__ */ __name(() => successResponse, "successResponse"),
  updateUserStats: /* @__PURE__ */ __name(() => updateUserStats, "updateUserStats"),
  validateFields: /* @__PURE__ */ __name(() => validateFields, "validateFields")
});
async function authenticateUser(request, env) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.substring(7);
  const session = await verifySession(token, env.SESSION_SECRET);
  if (!session) {
    return null;
  }
  const user = await env.DBA.prepare(
    "SELECT user_id, username, display_name, avatar_url, roles FROM users WHERE user_id = ?"
  ).bind(session.name).first();
  return user;
}
__name(authenticateUser, "authenticateUser");
function isAuthorized(user) {
  if (!user) return false;
  const roles = typeof user.roles === "string" ? JSON.parse(user.roles) : user.roles;
  return !roles.includes("scammer");
}
__name(isAuthorized, "isAuthorized");
function errorResponse(message, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
__name(errorResponse, "errorResponse");
function successResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
__name(successResponse, "successResponse");
function validateFields(data, requiredFields) {
  const missing = requiredFields.filter((field) => !data[field]);
  if (missing.length > 0) {
    return `Missing required fields: ${missing.join(", ")}`;
  }
  return null;
}
__name(validateFields, "validateFields");
async function createNotification(env, userId, type, title, message, link = null) {
  await env.DBA.prepare(
    "INSERT INTO trade_notifications (user_id, type, title, message, link, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(userId, type, title, message, link, Date.now()).run();
}
__name(createNotification, "createNotification");
async function updateUserStats(env, userId) {
  const stats = await env.DBA.prepare(`
        SELECT
            COUNT(*) as total_trades,
            SUM(CASE WHEN seller_id = ? OR buyer_id = ? THEN 1 ELSE 0 END) as successful_trades
        FROM completed_trades
        WHERE seller_id = ? OR buyer_id = ?
    `).bind(userId, userId, userId, userId).first();
  const reviews = await env.DBA.prepare(`
        SELECT
            AVG(rating) as avg_rating,
            COUNT(*) as review_count
        FROM trade_reviews
        WHERE reviewed_user_id = ?
    `).bind(userId).first();
  await env.DBA.prepare(`
        INSERT INTO user_trade_stats (user_id, total_trades, successful_trades, average_rating, total_reviews, last_trade_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            total_trades = excluded.total_trades,
            successful_trades = excluded.successful_trades,
            average_rating = excluded.average_rating,
            total_reviews = excluded.total_reviews,
            last_trade_at = excluded.last_trade_at
    `).bind(
    userId,
    stats.total_trades || 0,
    stats.successful_trades || 0,
    reviews.avg_rating || 0,
    reviews.review_count || 0,
    Date.now()
  ).run();
}
__name(updateUserStats, "updateUserStats");
async function getUserWithStats(env, userId) {
  const user = await env.DBA.prepare(`
        SELECT
            u.user_id,
            u.username,
            u.display_name,
            u.avatar_url,
            u.roles,
            uts.total_trades,
            uts.successful_trades,
            uts.average_rating,
            uts.total_reviews,
            uts.last_trade_at
        FROM users u
        LEFT JOIN user_trade_stats uts ON u.user_id = uts.user_id
        WHERE u.user_id = ?
    `).bind(userId).first();
  if (user) {
    user.roles = typeof user.roles === "string" ? JSON.parse(user.roles) : user.roles;
  }
  return user;
}
__name(getUserWithStats, "getUserWithStats");
function parsePagination(url) {
  const params = new URL(url).searchParams;
  const limit = Math.min(parseInt(params.get("limit") || "20"), 100);
  const offset = parseInt(params.get("offset") || "0");
  return { limit, offset };
}
__name(parsePagination, "parsePagination");
function parseSort(url, allowedFields, defaultField = "created_at", defaultOrder = "DESC") {
  const params = new URL(url).searchParams;
  const sortBy = params.get("sort") || defaultField;
  const sortOrder = params.get("order")?.toUpperCase() === "ASC" ? "ASC" : "DESC";
  if (!allowedFields.includes(sortBy)) {
    return { sortBy: defaultField, sortOrder: defaultOrder };
  }
  return { sortBy, sortOrder };
}
__name(parseSort, "parseSort");
var init_helpers = __esm({
  "api/trades/_utils/helpers.js"() {
    init_functionsRoutes_0_10531370690170583();
    init_auth();
    __name2(authenticateUser, "authenticateUser");
    __name2(isAuthorized, "isAuthorized");
    __name2(errorResponse, "errorResponse");
    __name2(successResponse, "successResponse");
    __name2(validateFields, "validateFields");
    __name2(createNotification, "createNotification");
    __name2(updateUserStats, "updateUserStats");
    __name2(getUserWithStats, "getUserWithStats");
    __name2(parsePagination, "parsePagination");
    __name2(parseSort, "parseSort");
  }
});
async function handleGet2(request, env, path) {
  const url = new URL(request.url);
  if (!path || path === "") {
    const { limit, offset } = parsePagination(url);
    const { sortBy, sortOrder } = parseSort(url, ["created_at", "updated_at", "views"], "created_at", "DESC");
    const params = url.searchParams;
    const category = params.get("category");
    const userId = params.get("user_id");
    const status = params.get("status") || "active";
    const search = params.get("search");
    let query = "SELECT * FROM trade_listings WHERE 1=1";
    const bindings = [];
    if (status) {
      query += " AND status = ?";
      bindings.push(status);
    }
    if (category && category !== "all") {
      query += " AND category = ?";
      bindings.push(category);
    }
    if (userId) {
      query += " AND user_id = ?";
      bindings.push(userId);
    }
    if (search) {
      query += " AND (title LIKE ? OR description LIKE ?)";
      bindings.push(`%${search}%`, `%${search}%`);
    }
    query += ` ORDER BY ${sortBy} ${sortOrder} LIMIT ? OFFSET ?`;
    bindings.push(limit, offset);
    const { results } = await env.DBA.prepare(query).bind(...bindings).all();
    const listings = await Promise.all(results.map(async (listing) => {
      const user = await getUserWithStats(env, listing.user_id);
      return {
        ...listing,
        offering_items: JSON.parse(listing.offering_items),
        seeking_items: listing.seeking_items ? JSON.parse(listing.seeking_items) : null,
        user: {
          user_id: user.user_id,
          username: user.username,
          display_name: user.display_name,
          avatar_url: user.avatar_url,
          average_rating: user.average_rating || 0,
          total_trades: user.total_trades || 0
        }
      };
    }));
    return successResponse({ listings, limit, offset });
  }
  const listingId = path.split("/")[0];
  if (listingId) {
    const listing = await env.DBA.prepare(
      "SELECT * FROM trade_listings WHERE id = ?"
    ).bind(listingId).first();
    if (!listing) {
      return errorResponse("Listing not found", 404);
    }
    await env.DBA.prepare(
      "UPDATE trade_listings SET views = views + 1 WHERE id = ?"
    ).bind(listingId).run();
    const user = await getUserWithStats(env, listing.user_id);
    const offerCount = await env.DBA.prepare(
      "SELECT COUNT(*) as count FROM trade_offers WHERE listing_id = ?"
    ).bind(listingId).first();
    return successResponse({
      ...listing,
      offering_items: JSON.parse(listing.offering_items),
      seeking_items: listing.seeking_items ? JSON.parse(listing.seeking_items) : null,
      views: listing.views + 1,
      offer_count: offerCount.count,
      user: {
        user_id: user.user_id,
        username: user.username,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
        average_rating: user.average_rating || 0,
        total_trades: user.total_trades || 0,
        total_reviews: user.total_reviews || 0
      }
    });
  }
  return errorResponse("Invalid request", 400);
}
__name(handleGet2, "handleGet2");
async function handlePost3(request, env, path, user) {
  if (!user || !isAuthorized(user)) {
    return errorResponse("Unauthorized", 401);
  }
  if (!path || path === "") {
    const data = await request.json();
    const error = validateFields(data, ["offering_items"]);
    if (error) {
      return errorResponse(error);
    }
    const {
      title,
      description,
      category = "other",
      offering_items,
      seeking_items,
      expires_in_days = 30
    } = data;
    if (!Array.isArray(offering_items) || offering_items.length === 0) {
      return errorResponse("offering_items must be a non-empty array");
    }
    const validateItems = /* @__PURE__ */ __name2((items, fieldName) => {
      for (const item of items) {
        if (item.type === "robux") {
          const amount = parseInt(item.amount);
          if (isNaN(amount) || amount < 0 || amount > 1e6) {
            return `Invalid robux amount in ${fieldName}: must be between 0 and 1,000,000`;
          }
        } else if (item.type === "other-game") {
          if (!item.game_name || !item.item_name) {
            return `Invalid other-game item in ${fieldName}: game_name and item_name are required`;
          }
        } else if (item.type === "game-item") {
          if (!item.item_name) {
            return `Invalid game-item in ${fieldName}: item_name is required`;
          }
        }
      }
      return null;
    }, "validateItems");
    const offeringError = validateItems(offering_items, "offering_items");
    if (offeringError) {
      return errorResponse(offeringError);
    }
    if (seeking_items && Array.isArray(seeking_items)) {
      const seekingError = validateItems(seeking_items, "seeking_items");
      if (seekingError) {
        return errorResponse(seekingError);
      }
    }
    let finalTitle = title;
    if (!finalTitle) {
      const firstOffering = offering_items[0];
      let offeringText = "";
      if (firstOffering.type === "robux") {
        offeringText = `${firstOffering.amount} R$`;
      } else if (firstOffering.type === "other-game") {
        offeringText = `${firstOffering.game_name} ${firstOffering.item_name}`;
      } else {
        offeringText = firstOffering.item_name;
      }
      if (offering_items.length > 1) {
        offeringText += ` + ${offering_items.length - 1} more`;
      }
      if (seeking_items && seeking_items.length > 0) {
        const firstSeeking = seeking_items[0];
        let seekingText = "";
        if (firstSeeking.type === "robux") {
          seekingText = `${firstSeeking.amount} R$`;
        } else if (firstSeeking.type === "other-game") {
          seekingText = `${firstSeeking.game_name} ${firstSeeking.item_name}`;
        } else {
          seekingText = firstSeeking.item_name;
        }
        if (seeking_items.length > 1) {
          seekingText += ` + ${seeking_items.length - 1} more`;
        }
        finalTitle = `Trading ${offeringText} for ${seekingText}`;
      } else {
        finalTitle = `Trading ${offeringText}`;
      }
    }
    const now = Date.now();
    const expiresAt = now + expires_in_days * 24 * 60 * 60 * 1e3;
    const result = await env.DBA.prepare(
      `INSERT INTO trade_listings
            (user_id, title, description, category, status, offering_items, seeking_items, created_at, updated_at, expires_at)
            VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`
    ).bind(
      user.user_id,
      finalTitle,
      description || null,
      category,
      JSON.stringify(offering_items),
      seeking_items ? JSON.stringify(seeking_items) : null,
      now,
      now,
      expiresAt
    ).run();
    return successResponse({
      id: result.meta.last_row_id,
      message: "Listing created successfully"
    }, 201);
  }
  return errorResponse("Invalid request", 400);
}
__name(handlePost3, "handlePost3");
async function handlePut3(request, env, path, user) {
  if (!user || !isAuthorized(user)) {
    return errorResponse("Unauthorized", 401);
  }
  const listingId = path.split("/")[0];
  if (!listingId) {
    return errorResponse("Listing ID required", 400);
  }
  const listing = await env.DBA.prepare(
    "SELECT * FROM trade_listings WHERE id = ?"
  ).bind(listingId).first();
  if (!listing) {
    return errorResponse("Listing not found", 404);
  }
  if (listing.user_id !== user.user_id) {
    return errorResponse("You can only edit your own listings", 403);
  }
  const data = await request.json();
  const {
    title,
    description,
    category,
    offering_items,
    seeking_items,
    status
  } = data;
  const updates = [];
  const bindings = [];
  if (title !== void 0) {
    updates.push("title = ?");
    bindings.push(title);
  }
  if (description !== void 0) {
    updates.push("description = ?");
    bindings.push(description);
  }
  if (category !== void 0) {
    updates.push("category = ?");
    bindings.push(category);
  }
  if (offering_items !== void 0) {
    updates.push("offering_items = ?");
    bindings.push(JSON.stringify(offering_items));
  }
  if (seeking_items !== void 0) {
    updates.push("seeking_items = ?");
    bindings.push(JSON.stringify(seeking_items));
  }
  if (status !== void 0 && ["active", "cancelled", "completed"].includes(status)) {
    updates.push("status = ?");
    bindings.push(status);
  }
  if (updates.length === 0) {
    return errorResponse("No fields to update");
  }
  updates.push("updated_at = ?");
  bindings.push(Date.now());
  bindings.push(listingId);
  await env.DBA.prepare(
    `UPDATE trade_listings SET ${updates.join(", ")} WHERE id = ?`
  ).bind(...bindings).run();
  return successResponse({ message: "Listing updated successfully" });
}
__name(handlePut3, "handlePut3");
async function handleDelete3(request, env, path, user) {
  if (!user || !isAuthorized(user)) {
    return errorResponse("Unauthorized", 401);
  }
  const listingId = path.split("/")[0];
  if (!listingId) {
    return errorResponse("Listing ID required", 400);
  }
  const listing = await env.DBA.prepare(
    "SELECT * FROM trade_listings WHERE id = ?"
  ).bind(listingId).first();
  if (!listing) {
    return errorResponse("Listing not found", 404);
  }
  if (listing.user_id !== user.user_id) {
    return errorResponse("You can only delete your own listings", 403);
  }
  await env.DBA.prepare(
    "UPDATE trade_listings SET status = ?, updated_at = ? WHERE id = ?"
  ).bind("cancelled", Date.now(), listingId).run();
  return successResponse({ message: "Listing deleted successfully" });
}
__name(handleDelete3, "handleDelete3");
async function onRequest3(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const pathParts = url.pathname.split("/api/trades/listings/").filter(Boolean);
  const path = pathParts[0] || "";
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    let user = null;
    if (request.method !== "GET") {
      user = await authenticateUser(request, env);
    }
    let response;
    switch (request.method) {
      case "GET":
        response = await handleGet2(request, env, path);
        break;
      case "POST":
        response = await handlePost3(request, env, path, user);
        break;
      case "PUT":
      case "PATCH":
        response = await handlePut3(request, env, path, user);
        break;
      case "DELETE":
        response = await handleDelete3(request, env, path, user);
        break;
      default:
        response = errorResponse("Method not allowed", 405);
    }
    const headers = new Headers(response.headers);
    Object.entries(corsHeaders).forEach(([key, value]) => {
      headers.set(key, value);
    });
    return new Response(response.body, {
      status: response.status,
      headers
    });
  } catch (error) {
    console.error("Trade listings error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}
__name(onRequest3, "onRequest3");
var init_path3 = __esm({
  "api/trades/listings/[[path]].js"() {
    init_functionsRoutes_0_10531370690170583();
    init_helpers();
    __name2(handleGet2, "handleGet");
    __name2(handlePost3, "handlePost");
    __name2(handlePut3, "handlePut");
    __name2(handleDelete3, "handleDelete");
    __name2(onRequest3, "onRequest");
  }
});
async function handleGet3(request, env, path, user) {
  if (!user || !isAuthorized(user)) {
    return errorResponse("Unauthorized", 401);
  }
  const url = new URL(request.url);
  if (!path || path === "") {
    const listingId = url.searchParams.get("listing_id");
    const offerId = url.searchParams.get("offer_id");
    const withUserId = url.searchParams.get("with_user_id");
    let query = "SELECT * FROM trade_messages WHERE (from_user_id = ? OR to_user_id = ?)";
    const bindings = [user.user_id, user.user_id];
    if (listingId) {
      query += " AND listing_id = ?";
      bindings.push(listingId);
    }
    if (offerId) {
      query += " AND offer_id = ?";
      bindings.push(offerId);
    }
    if (withUserId) {
      query += " AND (from_user_id = ? OR to_user_id = ?)";
      bindings.push(withUserId, withUserId);
    }
    query += " ORDER BY created_at ASC";
    const { results } = await env.DBA.prepare(query).bind(...bindings).all();
    const messages = await Promise.all(results.map(async (msg) => {
      const fromUser = await getUserWithStats(env, msg.from_user_id);
      const toUser = await getUserWithStats(env, msg.to_user_id);
      return {
        ...msg,
        from_user: {
          user_id: fromUser.user_id,
          username: fromUser.username,
          display_name: fromUser.display_name,
          avatar_url: fromUser.avatar_url
        },
        to_user: {
          user_id: toUser.user_id,
          username: toUser.username,
          display_name: toUser.display_name,
          avatar_url: toUser.avatar_url
        }
      };
    }));
    if (messages.length > 0) {
      const messageIds = messages.filter((m) => m.to_user_id === user.user_id && !m.read).map((m) => m.id);
      if (messageIds.length > 0) {
        await env.DBA.prepare(
          `UPDATE trade_messages SET read = 1 WHERE id IN (${messageIds.join(",")})`
        ).run();
      }
    }
    return successResponse({ messages });
  }
  if (path === "unread") {
    const result = await env.DBA.prepare(
      "SELECT COUNT(*) as count FROM trade_messages WHERE to_user_id = ? AND read = 0"
    ).bind(user.user_id).first();
    return successResponse({ unread_count: result.count });
  }
  if (path === "conversations") {
    const { results } = await env.DBA.prepare(`
            SELECT
                CASE
                    WHEN from_user_id = ? THEN to_user_id
                    ELSE from_user_id
                END as other_user_id,
                listing_id,
                offer_id,
                MAX(created_at) as last_message_at,
                COUNT(CASE WHEN to_user_id = ? AND read = 0 THEN 1 END) as unread_count
            FROM trade_messages
            WHERE from_user_id = ? OR to_user_id = ?
            GROUP BY other_user_id, listing_id, offer_id
            ORDER BY last_message_at DESC
        `).bind(user.user_id, user.user_id, user.user_id, user.user_id).all();
    const conversations = await Promise.all(results.map(async (conv) => {
      const otherUser = await getUserWithStats(env, conv.other_user_id);
      let listingTitle = null;
      if (conv.listing_id) {
        const listing = await env.DBA.prepare(
          "SELECT title FROM trade_listings WHERE id = ?"
        ).bind(conv.listing_id).first();
        listingTitle = listing?.title;
      }
      return {
        other_user: {
          user_id: otherUser.user_id,
          username: otherUser.username,
          display_name: otherUser.display_name,
          avatar_url: otherUser.avatar_url,
          average_rating: otherUser.average_rating || 0
        },
        listing_id: conv.listing_id,
        listing_title: listingTitle,
        offer_id: conv.offer_id,
        last_message_at: conv.last_message_at,
        unread_count: conv.unread_count
      };
    }));
    return successResponse({ conversations });
  }
  return errorResponse("Invalid request", 400);
}
__name(handleGet3, "handleGet3");
async function handlePost4(request, env, path, user) {
  if (!user || !isAuthorized(user)) {
    return errorResponse("Unauthorized", 401);
  }
  if (!path || path === "") {
    const data = await request.json();
    const error = validateFields(data, ["to_user_id", "message"]);
    if (error) {
      return errorResponse(error);
    }
    const { to_user_id, message, listing_id, offer_id } = data;
    if (to_user_id === user.user_id) {
      return errorResponse("Cannot send message to yourself", 400);
    }
    const recipient = await env.DBA.prepare(
      "SELECT user_id FROM users WHERE user_id = ?"
    ).bind(to_user_id).first();
    if (!recipient) {
      return errorResponse("Recipient not found", 404);
    }
    if (listing_id) {
      const listing = await env.DBA.prepare(
        "SELECT user_id FROM trade_listings WHERE id = ?"
      ).bind(listing_id).first();
      if (!listing) {
        return errorResponse("Listing not found", 404);
      }
      const isListingOwner = listing.user_id === user.user_id;
      const hasOffer = await env.DBA.prepare(
        "SELECT id FROM trade_offers WHERE listing_id = ? AND (from_user_id = ? OR to_user_id = ?)"
      ).bind(listing_id, user.user_id, user.user_id).first();
      if (!isListingOwner && !hasOffer) {
        return errorResponse("You are not involved in this listing", 403);
      }
    }
    const now = Date.now();
    const result = await env.DBA.prepare(
      `INSERT INTO trade_messages
            (listing_id, offer_id, from_user_id, to_user_id, message, created_at)
            VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      listing_id || null,
      offer_id || null,
      user.user_id,
      to_user_id,
      message,
      now
    ).run();
    await createNotification(
      env,
      to_user_id,
      "new_message",
      "New Message",
      `${user.username} sent you a message`,
      listing_id ? `/trading/${listing_id}` : "/messages"
    );
    return successResponse({
      id: result.meta.last_row_id,
      message: "Message sent successfully"
    }, 201);
  }
  const parts = path.split("/");
  const messageId = parts[0];
  const action = parts[1];
  if (messageId && action === "read") {
    const message = await env.DBA.prepare(
      "SELECT * FROM trade_messages WHERE id = ?"
    ).bind(messageId).first();
    if (!message) {
      return errorResponse("Message not found", 404);
    }
    if (message.to_user_id !== user.user_id) {
      return errorResponse("You can only mark your own messages as read", 403);
    }
    await env.DBA.prepare(
      "UPDATE trade_messages SET read = 1 WHERE id = ?"
    ).bind(messageId).run();
    return successResponse({ message: "Message marked as read" });
  }
  return errorResponse("Invalid request", 400);
}
__name(handlePost4, "handlePost4");
async function onRequest4(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const pathParts = url.pathname.split("/api/trades/messages/").filter(Boolean);
  const path = pathParts[0] || "";
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const user = await authenticateUser(request, env);
    let response;
    switch (request.method) {
      case "GET":
        response = await handleGet3(request, env, path, user);
        break;
      case "POST":
        response = await handlePost4(request, env, path, user);
        break;
      default:
        response = errorResponse("Method not allowed", 405);
    }
    const headers = new Headers(response.headers);
    Object.entries(corsHeaders).forEach(([key, value]) => {
      headers.set(key, value);
    });
    return new Response(response.body, {
      status: response.status,
      headers
    });
  } catch (error) {
    console.error("Trade messages error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}
__name(onRequest4, "onRequest4");
var init_path4 = __esm({
  "api/trades/messages/[[path]].js"() {
    init_functionsRoutes_0_10531370690170583();
    init_helpers();
    __name2(handleGet3, "handleGet");
    __name2(handlePost4, "handlePost");
    __name2(onRequest4, "onRequest");
  }
});
async function handleGet4(request, env, path, user) {
  if (!user || !isAuthorized(user)) {
    return errorResponse("Unauthorized", 401);
  }
  const url = new URL(request.url);
  if (!path || path === "") {
    const unreadOnly = url.searchParams.get("unread_only") === "true";
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
    const offset = parseInt(url.searchParams.get("offset") || "0");
    let query = "SELECT * FROM trade_notifications WHERE user_id = ?";
    const bindings = [user.user_id];
    if (unreadOnly) {
      query += " AND read = 0";
    }
    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    bindings.push(limit, offset);
    const { results: notifications } = await env.DBA.prepare(query).bind(...bindings).all();
    return successResponse({ notifications, limit, offset });
  }
  if (path === "unread-count") {
    const result = await env.DBA.prepare(
      "SELECT COUNT(*) as count FROM trade_notifications WHERE user_id = ? AND read = 0"
    ).bind(user.user_id).first();
    return successResponse({ unread_count: result.count });
  }
  const notificationId = path.split("/")[0];
  if (notificationId) {
    const notification = await env.DBA.prepare(
      "SELECT * FROM trade_notifications WHERE id = ?"
    ).bind(notificationId).first();
    if (!notification) {
      return errorResponse("Notification not found", 404);
    }
    if (notification.user_id !== user.user_id) {
      return errorResponse("Unauthorized to view this notification", 403);
    }
    return successResponse({ notification });
  }
  return errorResponse("Invalid request", 400);
}
__name(handleGet4, "handleGet4");
async function handlePost5(request, env, path, user) {
  if (!user || !isAuthorized(user)) {
    return errorResponse("Unauthorized", 401);
  }
  const parts = path.split("/");
  const notificationId = parts[0];
  const action = parts[1];
  if (notificationId && action === "read") {
    const notification = await env.DBA.prepare(
      "SELECT * FROM trade_notifications WHERE id = ?"
    ).bind(notificationId).first();
    if (!notification) {
      return errorResponse("Notification not found", 404);
    }
    if (notification.user_id !== user.user_id) {
      return errorResponse("Unauthorized", 403);
    }
    await env.DBA.prepare(
      "UPDATE trade_notifications SET read = 1 WHERE id = ?"
    ).bind(notificationId).run();
    return successResponse({ message: "Notification marked as read" });
  }
  if (path === "read-all") {
    await env.DBA.prepare(
      "UPDATE trade_notifications SET read = 1 WHERE user_id = ? AND read = 0"
    ).bind(user.user_id).run();
    return successResponse({ message: "All notifications marked as read" });
  }
  return errorResponse("Invalid request", 400);
}
__name(handlePost5, "handlePost5");
async function handleDelete4(request, env, path, user) {
  if (!user || !isAuthorized(user)) {
    return errorResponse("Unauthorized", 401);
  }
  const notificationId = path.split("/")[0];
  if (!notificationId) {
    return errorResponse("Notification ID required", 400);
  }
  const notification = await env.DBA.prepare(
    "SELECT * FROM trade_notifications WHERE id = ?"
  ).bind(notificationId).first();
  if (!notification) {
    return errorResponse("Notification not found", 404);
  }
  if (notification.user_id !== user.user_id) {
    return errorResponse("Unauthorized", 403);
  }
  await env.DBA.prepare(
    "DELETE FROM trade_notifications WHERE id = ?"
  ).bind(notificationId).run();
  return successResponse({ message: "Notification deleted" });
}
__name(handleDelete4, "handleDelete4");
async function onRequest5(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const pathParts = url.pathname.split("/api/trades/notifications/").filter(Boolean);
  const path = pathParts[0] || "";
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const user = await authenticateUser(request, env);
    let response;
    switch (request.method) {
      case "GET":
        response = await handleGet4(request, env, path, user);
        break;
      case "POST":
        response = await handlePost5(request, env, path, user);
        break;
      case "DELETE":
        response = await handleDelete4(request, env, path, user);
        break;
      default:
        response = errorResponse("Method not allowed", 405);
    }
    const headers = new Headers(response.headers);
    Object.entries(corsHeaders).forEach(([key, value]) => {
      headers.set(key, value);
    });
    return new Response(response.body, {
      status: response.status,
      headers
    });
  } catch (error) {
    console.error("Trade notifications error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}
__name(onRequest5, "onRequest5");
var init_path5 = __esm({
  "api/trades/notifications/[[path]].js"() {
    init_functionsRoutes_0_10531370690170583();
    init_helpers();
    __name2(handleGet4, "handleGet");
    __name2(handlePost5, "handlePost");
    __name2(handleDelete4, "handleDelete");
    __name2(onRequest5, "onRequest");
  }
});
async function handleGet5(request, env, path, user) {
  if (!user || !isAuthorized(user)) {
    return errorResponse("Unauthorized", 401);
  }
  const url = new URL(request.url);
  if (!path || path === "") {
    const type = url.searchParams.get("type") || "all";
    const status = url.searchParams.get("status");
    let query = "SELECT o.*, l.title as listing_title FROM trade_offers o JOIN trade_listings l ON o.listing_id = l.id WHERE 1=1";
    const bindings = [];
    if (type === "sent") {
      query += " AND o.from_user_id = ?";
      bindings.push(user.user_id);
    } else if (type === "received") {
      query += " AND o.to_user_id = ?";
      bindings.push(user.user_id);
    } else {
      query += " AND (o.from_user_id = ? OR o.to_user_id = ?)";
      bindings.push(user.user_id, user.user_id);
    }
    if (status) {
      query += " AND o.status = ?";
      bindings.push(status);
    }
    query += " ORDER BY o.created_at DESC";
    const { results } = await env.DBA.prepare(query).bind(...bindings).all();
    const offers = await Promise.all(results.map(async (offer) => {
      const fromUser = await getUserWithStats(env, offer.from_user_id);
      const toUser = await getUserWithStats(env, offer.to_user_id);
      return {
        ...offer,
        offered_items: JSON.parse(offer.offered_items),
        from_user: {
          user_id: fromUser.user_id,
          username: fromUser.username,
          display_name: fromUser.display_name,
          avatar_url: fromUser.avatar_url,
          average_rating: fromUser.average_rating || 0
        },
        to_user: {
          user_id: toUser.user_id,
          username: toUser.username,
          display_name: toUser.display_name,
          avatar_url: toUser.avatar_url,
          average_rating: toUser.average_rating || 0
        }
      };
    }));
    return successResponse({ offers });
  }
  const offerId = path.split("/")[0];
  if (offerId) {
    const offer = await env.DBA.prepare(
      "SELECT o.*, l.title as listing_title, l.offering_items as listing_items FROM trade_offers o JOIN trade_listings l ON o.listing_id = l.id WHERE o.id = ?"
    ).bind(offerId).first();
    if (!offer) {
      return errorResponse("Offer not found", 404);
    }
    if (offer.from_user_id !== user.user_id && offer.to_user_id !== user.user_id) {
      return errorResponse("Unauthorized to view this offer", 403);
    }
    const fromUser = await getUserWithStats(env, offer.from_user_id);
    const toUser = await getUserWithStats(env, offer.to_user_id);
    return successResponse({
      ...offer,
      offered_items: JSON.parse(offer.offered_items),
      listing_items: JSON.parse(offer.listing_items),
      from_user: {
        user_id: fromUser.user_id,
        username: fromUser.username,
        display_name: fromUser.display_name,
        avatar_url: fromUser.avatar_url,
        average_rating: fromUser.average_rating || 0,
        total_trades: fromUser.total_trades || 0
      },
      to_user: {
        user_id: toUser.user_id,
        username: toUser.username,
        display_name: toUser.display_name,
        avatar_url: toUser.avatar_url,
        average_rating: toUser.average_rating || 0,
        total_trades: toUser.total_trades || 0
      }
    });
  }
  return errorResponse("Invalid request", 400);
}
__name(handleGet5, "handleGet5");
async function handlePost6(request, env, path, user) {
  if (!user || !isAuthorized(user)) {
    return errorResponse("Unauthorized", 401);
  }
  if (!path || path === "") {
    const data = await request.json();
    const error = validateFields(data, ["listing_id", "offered_items"]);
    if (error) {
      return errorResponse(error);
    }
    const { listing_id, offered_items, message } = data;
    const listing = await env.DBA.prepare(
      "SELECT * FROM trade_listings WHERE id = ? AND status = ?"
    ).bind(listing_id, "active").first();
    if (!listing) {
      return errorResponse("Listing not found or not active", 404);
    }
    if (listing.user_id === user.user_id) {
      return errorResponse("Cannot make offer on your own listing", 400);
    }
    if (!Array.isArray(offered_items) || offered_items.length === 0) {
      return errorResponse("offered_items must be a non-empty array");
    }
    const now = Date.now();
    const result = await env.DBA.prepare(
      `INSERT INTO trade_offers
            (listing_id, from_user_id, to_user_id, offered_items, message, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`
    ).bind(
      listing_id,
      user.user_id,
      listing.user_id,
      JSON.stringify(offered_items),
      message || null,
      now,
      now
    ).run();
    await createNotification(
      env,
      listing.user_id,
      "new_offer",
      "New Trade Offer",
      `${user.username} made an offer on your listing: ${listing.title}`,
      `/trading/${listing_id}`
    );
    return successResponse({
      id: result.meta.last_row_id,
      message: "Offer created successfully"
    }, 201);
  }
  const parts = path.split("/");
  const offerId = parts[0];
  const action = parts[1];
  if (offerId && action === "accept") {
    const offer = await env.DBA.prepare(
      "SELECT o.*, l.offering_items as listing_items FROM trade_offers o JOIN trade_listings l ON o.listing_id = l.id WHERE o.id = ?"
    ).bind(offerId).first();
    if (!offer) {
      return errorResponse("Offer not found", 404);
    }
    if (offer.to_user_id !== user.user_id) {
      return errorResponse("Only the listing owner can accept offers", 403);
    }
    if (offer.status !== "pending") {
      return errorResponse("Offer is not pending", 400);
    }
    const now = Date.now();
    await env.DBA.prepare(
      "UPDATE trade_offers SET status = ?, updated_at = ? WHERE id = ?"
    ).bind("accepted", now, offerId).run();
    await env.DBA.prepare(
      "UPDATE trade_listings SET status = ?, updated_at = ? WHERE id = ?"
    ).bind("completed", now, offer.listing_id).run();
    const tradeResult = await env.DBA.prepare(
      `INSERT INTO completed_trades
            (listing_id, offer_id, seller_id, buyer_id, seller_items, buyer_items, completed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      offer.listing_id,
      offerId,
      offer.to_user_id,
      offer.from_user_id,
      offer.listing_items,
      offer.offered_items,
      now
    ).run();
    await updateUserStats(env, offer.to_user_id);
    await updateUserStats(env, offer.from_user_id);
    await createNotification(
      env,
      offer.from_user_id,
      "offer_accepted",
      "Offer Accepted!",
      "Your trade offer was accepted!",
      `/trades/completed/${tradeResult.meta.last_row_id}`
    );
    await env.DBA.prepare(
      "UPDATE trade_offers SET status = ?, updated_at = ? WHERE listing_id = ? AND id != ? AND status = ?"
    ).bind("rejected", now, offer.listing_id, offerId, "pending").run();
    return successResponse({
      trade_id: tradeResult.meta.last_row_id,
      message: "Offer accepted successfully"
    });
  }
  if (offerId && action === "reject") {
    const offer = await env.DBA.prepare(
      "SELECT * FROM trade_offers WHERE id = ?"
    ).bind(offerId).first();
    if (!offer) {
      return errorResponse("Offer not found", 404);
    }
    if (offer.to_user_id !== user.user_id) {
      return errorResponse("Only the listing owner can reject offers", 403);
    }
    await env.DBA.prepare(
      "UPDATE trade_offers SET status = ?, updated_at = ? WHERE id = ?"
    ).bind("rejected", Date.now(), offerId).run();
    await createNotification(
      env,
      offer.from_user_id,
      "offer_rejected",
      "Offer Rejected",
      "Your trade offer was rejected",
      `/trading/${offer.listing_id}`
    );
    return successResponse({ message: "Offer rejected successfully" });
  }
  if (offerId && action === "cancel") {
    const offer = await env.DBA.prepare(
      "SELECT * FROM trade_offers WHERE id = ?"
    ).bind(offerId).first();
    if (!offer) {
      return errorResponse("Offer not found", 404);
    }
    if (offer.from_user_id !== user.user_id) {
      return errorResponse("You can only cancel your own offers", 403);
    }
    if (offer.status !== "pending") {
      return errorResponse("Can only cancel pending offers", 400);
    }
    await env.DBA.prepare(
      "UPDATE trade_offers SET status = ?, updated_at = ? WHERE id = ?"
    ).bind("cancelled", Date.now(), offerId).run();
    return successResponse({ message: "Offer cancelled successfully" });
  }
  return errorResponse("Invalid request", 400);
}
__name(handlePost6, "handlePost6");
async function onRequest6(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const pathParts = url.pathname.split("/api/trades/offers/").filter(Boolean);
  const path = pathParts[0] || "";
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const user = await authenticateUser(request, env);
    let response;
    switch (request.method) {
      case "GET":
        response = await handleGet5(request, env, path, user);
        break;
      case "POST":
        response = await handlePost6(request, env, path, user);
        break;
      default:
        response = errorResponse("Method not allowed", 405);
    }
    const headers = new Headers(response.headers);
    Object.entries(corsHeaders).forEach(([key, value]) => {
      headers.set(key, value);
    });
    return new Response(response.body, {
      status: response.status,
      headers
    });
  } catch (error) {
    console.error("Trade offers error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}
__name(onRequest6, "onRequest6");
var init_path6 = __esm({
  "api/trades/offers/[[path]].js"() {
    init_functionsRoutes_0_10531370690170583();
    init_helpers();
    __name2(handleGet5, "handleGet");
    __name2(handlePost6, "handlePost");
    __name2(onRequest6, "onRequest");
  }
});
async function handleGet6(request, env, path) {
  const url = new URL(request.url);
  if (!path || path === "") {
    const userId = url.searchParams.get("user_id");
    if (!userId) {
      return errorResponse("user_id parameter required");
    }
    const { results: reviews } = await env.DBA.prepare(`
            SELECT
                r.*,
                u.username as reviewer_username,
                u.display_name as reviewer_display_name,
                u.avatar_url as reviewer_avatar
            FROM trade_reviews r
            JOIN users u ON r.reviewer_id = u.user_id
            WHERE r.reviewed_user_id = ?
            ORDER BY r.created_at DESC
        `).bind(userId).all();
    const stats = await env.DBA.prepare(
      "SELECT * FROM user_trade_stats WHERE user_id = ?"
    ).bind(userId).first();
    return successResponse({
      reviews,
      stats: stats || {
        total_trades: 0,
        successful_trades: 0,
        average_rating: 0,
        total_reviews: 0
      }
    });
  }
  const reviewId = path.split("/")[0];
  if (reviewId) {
    const review = await env.DBA.prepare(`
            SELECT
                r.*,
                u1.username as reviewer_username,
                u1.display_name as reviewer_display_name,
                u1.avatar_url as reviewer_avatar,
                u2.username as reviewed_username,
                u2.display_name as reviewed_display_name,
                u2.avatar_url as reviewed_avatar
            FROM trade_reviews r
            JOIN users u1 ON r.reviewer_id = u1.user_id
            JOIN users u2 ON r.reviewed_user_id = u2.user_id
            WHERE r.id = ?
        `).bind(reviewId).first();
    if (!review) {
      return errorResponse("Review not found", 404);
    }
    return successResponse({ review });
  }
  return errorResponse("Invalid request", 400);
}
__name(handleGet6, "handleGet6");
async function handlePost7(request, env, path, user) {
  if (!user || !isAuthorized(user)) {
    return errorResponse("Unauthorized", 401);
  }
  if (!path || path === "") {
    const data = await request.json();
    const error = validateFields(data, ["trade_id", "rating"]);
    if (error) {
      return errorResponse(error);
    }
    const { trade_id, rating, comment } = data;
    if (rating < 1 || rating > 5) {
      return errorResponse("Rating must be between 1 and 5");
    }
    const trade = await env.DBA.prepare(
      "SELECT * FROM completed_trades WHERE id = ?"
    ).bind(trade_id).first();
    if (!trade) {
      return errorResponse("Trade not found", 404);
    }
    if (trade.seller_id !== user.user_id && trade.buyer_id !== user.user_id) {
      return errorResponse("You were not part of this trade", 403);
    }
    const reviewedUserId = trade.seller_id === user.user_id ? trade.buyer_id : trade.seller_id;
    const existingReview = await env.DBA.prepare(
      "SELECT id FROM trade_reviews WHERE trade_id = ? AND reviewer_id = ?"
    ).bind(trade_id, user.user_id).first();
    if (existingReview) {
      return errorResponse("You have already reviewed this trade", 400);
    }
    const now = Date.now();
    const result = await env.DBA.prepare(
      `INSERT INTO trade_reviews
            (trade_id, reviewer_id, reviewed_user_id, rating, comment, created_at)
            VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      trade_id,
      user.user_id,
      reviewedUserId,
      rating,
      comment || null,
      now
    ).run();
    await updateUserStats(env, reviewedUserId);
    const ratingText = rating === 5 ? "excellent" : rating === 4 ? "good" : rating === 3 ? "okay" : rating === 2 ? "poor" : "bad";
    await createNotification(
      env,
      reviewedUserId,
      "review_received",
      "New Review",
      `${user.username} gave you a ${ratingText} review (${rating}/5 stars)`,
      `/profile/${reviewedUserId}`
    );
    return successResponse({
      id: result.meta.last_row_id,
      message: "Review submitted successfully"
    }, 201);
  }
  return errorResponse("Invalid request", 400);
}
__name(handlePost7, "handlePost7");
async function handlePut4(request, env, path, user) {
  if (!user || !isAuthorized(user)) {
    return errorResponse("Unauthorized", 401);
  }
  const reviewId = path.split("/")[0];
  if (!reviewId) {
    return errorResponse("Review ID required", 400);
  }
  const review = await env.DBA.prepare(
    "SELECT * FROM trade_reviews WHERE id = ?"
  ).bind(reviewId).first();
  if (!review) {
    return errorResponse("Review not found", 404);
  }
  if (review.reviewer_id !== user.user_id) {
    return errorResponse("You can only edit your own reviews", 403);
  }
  const data = await request.json();
  const { rating, comment } = data;
  const updates = [];
  const bindings = [];
  if (rating !== void 0) {
    if (rating < 1 || rating > 5) {
      return errorResponse("Rating must be between 1 and 5");
    }
    updates.push("rating = ?");
    bindings.push(rating);
  }
  if (comment !== void 0) {
    updates.push("comment = ?");
    bindings.push(comment);
  }
  if (updates.length === 0) {
    return errorResponse("No fields to update");
  }
  bindings.push(reviewId);
  await env.DBA.prepare(
    `UPDATE trade_reviews SET ${updates.join(", ")} WHERE id = ?`
  ).bind(...bindings).run();
  await updateUserStats(env, review.reviewed_user_id);
  return successResponse({ message: "Review updated successfully" });
}
__name(handlePut4, "handlePut4");
async function handleDelete5(request, env, path, user) {
  if (!user || !isAuthorized(user)) {
    return errorResponse("Unauthorized", 401);
  }
  const reviewId = path.split("/")[0];
  if (!reviewId) {
    return errorResponse("Review ID required", 400);
  }
  const review = await env.DBA.prepare(
    "SELECT * FROM trade_reviews WHERE id = ?"
  ).bind(reviewId).first();
  if (!review) {
    return errorResponse("Review not found", 404);
  }
  const roles = typeof user.roles === "string" ? JSON.parse(user.roles) : user.roles;
  const isAdminOrMod = roles.includes("admin") || roles.includes("moderator");
  if (review.reviewer_id !== user.user_id && !isAdminOrMod) {
    return errorResponse("You can only delete your own reviews", 403);
  }
  const reviewedUserId = review.reviewed_user_id;
  await env.DBA.prepare(
    "DELETE FROM trade_reviews WHERE id = ?"
  ).bind(reviewId).run();
  await updateUserStats(env, reviewedUserId);
  return successResponse({ message: "Review deleted successfully" });
}
__name(handleDelete5, "handleDelete5");
async function onRequest7(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const pathParts = url.pathname.split("/api/trades/reviews/").filter(Boolean);
  const path = pathParts[0] || "";
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    let user = null;
    if (request.method !== "GET") {
      user = await authenticateUser(request, env);
    }
    let response;
    switch (request.method) {
      case "GET":
        response = await handleGet6(request, env, path);
        break;
      case "POST":
        response = await handlePost7(request, env, path, user);
        break;
      case "PUT":
      case "PATCH":
        response = await handlePut4(request, env, path, user);
        break;
      case "DELETE":
        response = await handleDelete5(request, env, path, user);
        break;
      default:
        response = errorResponse("Method not allowed", 405);
    }
    const headers = new Headers(response.headers);
    Object.entries(corsHeaders).forEach(([key, value]) => {
      headers.set(key, value);
    });
    return new Response(response.body, {
      status: response.status,
      headers
    });
  } catch (error) {
    console.error("Trade reviews error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}
__name(onRequest7, "onRequest7");
var init_path7 = __esm({
  "api/trades/reviews/[[path]].js"() {
    init_functionsRoutes_0_10531370690170583();
    init_helpers();
    __name2(handleGet6, "handleGet");
    __name2(handlePost7, "handlePost");
    __name2(handlePut4, "handlePut");
    __name2(handleDelete5, "handleDelete");
    __name2(onRequest7, "onRequest");
  }
});
async function onRequestPost({ request, env }) {
  try {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized - No token provided" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }
    const session = await env.DBA.prepare(`
      SELECT s.*, u.role FROM sessions s
      JOIN users u ON s.user_id = u.user_id
      WHERE s.token = ? AND s.expires_at > ?
    `).bind(token, Date.now()).first();
    if (!session) {
      return new Response(JSON.stringify({ error: "Unauthorized - Invalid session" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }
    let userRoles;
    try {
      userRoles = session.role ? JSON.parse(session.role) : ["user"];
    } catch (e) {
      userRoles = ["user"];
    }
    if (!userRoles.includes("admin") && !userRoles.includes("moderator")) {
      return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
        status: 403,
        headers: { "Content-Type": "application/json" }
      });
    }
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file) {
      return new Response(JSON.stringify({ error: "No file provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (!file.type.startsWith("image/")) {
      return new Response(JSON.stringify({ error: "File must be an image" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (file.size > 10 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: "File size must be less than 10MB" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    const accountId = env.CF_ACCOUNT_ID || "d9fecb3357660ea0fcfee5b23d5dd2f6";
    const accountHash = env.CF_ACCOUNT_HASH || "I2Jsf9fuZwSztWJZaX0DJA";
    const apiToken = env.CF_IMAGES_API_TOKEN;
    if (!accountId || !apiToken) {
      return new Response(JSON.stringify({
        error: "Cloudflare Images not configured. Please set CF_ACCOUNT_ID and CF_IMAGES_API_TOKEN environment variables."
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
    const cfFormData = new FormData();
    cfFormData.append("file", file);
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiToken}`
        },
        body: cfFormData
      }
    );
    if (!response.ok) {
      const errorData = await response.text();
      console.error("Cloudflare Images API error:", errorData);
      return new Response(JSON.stringify({
        error: "Failed to upload image to Cloudflare Images",
        details: errorData
      }), {
        status: response.status,
        headers: { "Content-Type": "application/json" }
      });
    }
    const data = await response.json();
    if (!data.success) {
      return new Response(JSON.stringify({
        error: "Upload failed",
        details: data.errors
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
    const imageId = data.result.id;
    const variants = data.result.variants || [];
    const publicVariant = variants.find((v) => v.includes("/public")) || variants[0] || "";
    const imageUrl = publicVariant || `https://imagedelivery.net/${accountHash}/${imageId}/public`;
    return new Response(JSON.stringify({
      success: true,
      id: imageId,
      url: imageUrl,
      variants
    }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
      }
    });
  } catch (error) {
    console.error("Image upload error:", error);
    return new Response(JSON.stringify({
      error: "Upload failed: " + error.message
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
__name(onRequestPost, "onRequestPost");
async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }
  });
}
__name(onRequestOptions, "onRequestOptions");
var init_upload = __esm({
  "api/images/upload.js"() {
    init_functionsRoutes_0_10531370690170583();
    __name2(onRequestPost, "onRequestPost");
    __name2(onRequestOptions, "onRequestOptions");
  }
});
async function onRequest8(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const providedSecret = url.searchParams.get("secret") || request.headers.get("X-Cron-Secret");
  if (env.CRON_SECRET && providedSecret !== env.CRON_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }
  const batchSize = parseInt(url.searchParams.get("batch") || "20");
  const maxBatch = Math.min(batchSize, 50);
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1e3;
  const { results: staleUsers } = await env.DBA.prepare(`
        SELECT user_id, username, display_name, avatar_url, avatar_cached_at
        FROM users
        WHERE avatar_cached_at IS NULL 
           OR avatar_cached_at < ?
        ORDER BY avatar_cached_at ASC NULLS FIRST
        LIMIT ?
    `).bind(oneDayAgo, maxBatch).all();
  if (!staleUsers || staleUsers.length === 0) {
    return new Response(JSON.stringify({
      success: true,
      message: "No stale users to refresh",
      updated: 0
    }), {
      headers: { "Content-Type": "application/json" }
    });
  }
  const results = {
    updated: 0,
    failed: 0,
    skipped: 0,
    details: []
  };
  const userIds = staleUsers.map((u) => u.user_id);
  let avatarMap = {};
  try {
    const avatarResponse = await fetch(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userIds.join(",")}&size=150x150&format=Png`
    );
    if (avatarResponse.ok) {
      const avatarData = await avatarResponse.json();
      for (const item of avatarData.data || []) {
        avatarMap[item.targetId] = item.imageUrl;
      }
    }
  } catch (e) {
    console.error("Failed to fetch avatars in bulk:", e);
  }
  let userInfoMap = {};
  try {
    const userInfoResponse = await fetch("https://users.roblox.com/v1/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIds: userIds.map((id) => parseInt(id)) })
    });
    if (userInfoResponse.ok) {
      const userInfoData = await userInfoResponse.json();
      for (const user of userInfoData.data || []) {
        userInfoMap[user.id] = {
          username: user.name,
          displayName: user.displayName
        };
      }
    }
  } catch (e) {
    console.error("Failed to fetch user info in bulk:", e);
  }
  const now = Date.now();
  for (const user of staleUsers) {
    const userId = user.user_id;
    const newAvatar = avatarMap[userId];
    const newInfo = userInfoMap[userId];
    if (!newAvatar && !newInfo) {
      results.skipped++;
      results.details.push({ userId, status: "skipped", reason: "No data from Roblox" });
      continue;
    }
    try {
      await env.DBA.prepare(`
                UPDATE users SET
                    avatar_url = COALESCE(?, avatar_url),
                    avatar_cached_at = ?,
                    username = COALESCE(?, username),
                    display_name = COALESCE(?, display_name)
                WHERE user_id = ?
            `).bind(
        newAvatar || null,
        now,
        newInfo?.username || null,
        newInfo?.displayName || null,
        userId
      ).run();
      results.updated++;
      results.details.push({
        userId,
        status: "updated",
        oldUsername: user.username,
        newUsername: newInfo?.username,
        oldDisplayName: user.display_name,
        newDisplayName: newInfo?.displayName,
        avatarUpdated: !!newAvatar
      });
    } catch (e) {
      results.failed++;
      results.details.push({ userId, status: "failed", error: e.message });
    }
  }
  const { count } = await env.DBA.prepare(`
        SELECT COUNT(*) as count FROM users
        WHERE avatar_cached_at IS NULL OR avatar_cached_at < ?
    `).bind(oneDayAgo).first();
  return new Response(JSON.stringify({
    success: true,
    message: `Refreshed ${results.updated} users`,
    ...results,
    remainingStale: count
  }), {
    headers: { "Content-Type": "application/json" }
  });
}
__name(onRequest8, "onRequest8");
var init_refresh_avatars = __esm({
  "api/cron/refresh-avatars.js"() {
    init_functionsRoutes_0_10531370690170583();
    __name2(onRequest8, "onRequest");
  }
});
async function replaceUserTotals(kv, userId, totalSpent, purchases) {
  const userIdStr = String(userId);
  const purchaseKey = `purchase:${userIdStr}`;
  await kv.put(purchaseKey, JSON.stringify({
    userId: parseInt(userIdStr),
    totalSpent,
    purchases
  }));
  return { totalSpent, purchases };
}
__name(replaceUserTotals, "replaceUserTotals");
async function processGameWebhookTransactions(kv, transactions) {
  const processed = [];
  const seenTokens = /* @__PURE__ */ new Set();
  for (const tx of transactions) {
    let userId, price;
    if (tx.userId !== void 0 && tx.price !== void 0) {
      userId = tx.userId;
      price = tx.price;
      if (!userId || price <= 0) continue;
    } else if (tx.transactionType === "Sale" && tx.currency?.type === "Robux") {
      if (tx.purchaseToken && seenTokens.has(tx.purchaseToken)) {
        continue;
      }
      if (tx.purchaseToken) {
        seenTokens.add(tx.purchaseToken);
      }
      userId = tx.agent?.id;
      if (!userId) continue;
      price = tx.currency?.amount || 0;
      if (price <= 0) continue;
    } else {
      continue;
    }
    const userIdStr = String(userId);
    const purchaseKey = `purchase:${userIdStr}`;
    const existing = await kv.get(purchaseKey);
    let totalSpent = price;
    let purchases = 1;
    if (existing) {
      try {
        const data = JSON.parse(existing);
        totalSpent = (data.totalSpent || 0) + price;
        purchases = (data.purchases || 0) + 1;
      } catch (e) {
        console.error("Failed to parse existing purchase data:", e);
      }
    }
    await replaceUserTotals(kv, userId, totalSpent, purchases);
    processed.push({
      userId: userIdStr,
      price,
      totalSpent,
      purchases
    });
  }
  return processed;
}
__name(processGameWebhookTransactions, "processGameWebhookTransactions");
async function onRequest9(context) {
  const { request, env } = context;
  const kv = env.DONATIONS_KV;
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
  try {
    const data = await request.json();
    let transactions = [];
    if (Array.isArray(data)) {
      transactions = data;
    } else if (data.transactions && Array.isArray(data.transactions)) {
      transactions = data.transactions;
    } else if (data.userId && data.price !== void 0) {
      transactions = [data];
    } else if (data.transactionType === "Sale") {
      transactions = [data];
    } else {
      return new Response(JSON.stringify({ error: "Invalid webhook format" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }
    const processed = await processGameWebhookTransactions(kv, transactions);
    return new Response(JSON.stringify({
      status: "ok",
      processed: processed.length,
      transactions: processed
    }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (e) {
    console.error("Webhook processing error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
}
__name(onRequest9, "onRequest9");
var init_webhook = __esm({
  "api/donations/webhook.js"() {
    init_functionsRoutes_0_10531370690170583();
    __name2(replaceUserTotals, "replaceUserTotals");
    __name2(processGameWebhookTransactions, "processGameWebhookTransactions");
    __name2(onRequest9, "onRequest");
  }
});
async function onRequest10(context) {
  const { params, request, env } = context;
  const item = params.item;
  const base = "https://emwiki.com";
  function isBot(ua) {
    return /bot|crawler|spider|facebookexternalhit|twitterbot|slackbot/i.test(ua);
  }
  __name(isBot, "isBot");
  __name2(isBot, "isBot");
  if (!isBot(request.headers.get("user-agent") || "")) {
    return Response.redirect(`${base}/?item=${encodeURIComponent(item)}`, 302);
  }
  try {
    const categories = ["gears", "deaths", "titles", "pets", "effects"];
    let match2 = null;
    const normalizedItemName = item.toLowerCase().replace(/-/g, " ").trim();
    for (const category of categories) {
      const result = await env.DBA.prepare(`
        SELECT name, "from"
        FROM items
        WHERE category = ? AND LOWER(REPLACE(name, '-', ' ')) = ?
        LIMIT 1
      `).bind(category, normalizedItemName).first();
      if (result) {
        match2 = result;
        break;
      }
    }
    if (!match2) {
      for (const category of categories) {
        const results = await env.DBA.prepare(`
          SELECT name, "from"
          FROM items
          WHERE category = ? AND name LIKE ?
          LIMIT 5
        `).bind(category, `%${normalizedItemName}%`).all();
        if (results.results && results.results.length > 0) {
          const found = results.results.find(
            (i) => (i?.name || "").toLowerCase().replace(/\s+/g, "-") === item.toLowerCase()
          );
          if (found) {
            match2 = found;
            break;
          }
        }
      }
    }
    if (!match2) throw new Error("Item not found");
    const title = escapeHtml(match2.name || "EMWiki Item");
    const descriptionRaw = match2.from || "";
    const descriptionText = descriptionRaw.replace(/<br\s*\/?>(\s*)?/gi, "\n");
    const imageUrl = `https://images-eight-theta.vercel.app/api/image?item=${encodeURIComponent(item)}`;
    return new Response(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=600, initial-scale=1" />
<title>${title} - EMWiki Preview</title>

<meta property="og:title" content="${title} - EMwiki" />
<meta property="og:image" content="${imageUrl}" />
<meta property="og:url" content="${base}/?item=${encodeURIComponent(item)}" />
<meta name="twitter:card" content="summary_large_image" />
</head>
<body></body>
</html>`, {
      headers: { "Content-Type": "text/html" }
    });
  } catch (e) {
    return new Response(`Error: ${e.message}`, { status: 404 });
  }
}
__name(onRequest10, "onRequest10");
function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
__name(escapeHtml, "escapeHtml");
var init_item = __esm({
  "api/embed/[item].js"() {
    init_functionsRoutes_0_10531370690170583();
    __name2(onRequest10, "onRequest");
    __name2(escapeHtml, "escapeHtml");
  }
});
function getMediaType(url) {
  if (!url) return "image";
  if (url.includes("cloudflarestream.com") || url.includes("videodelivery.net") || url.includes(".m3u8")) {
    return "video";
  }
  const ext = url.split(".").pop().toLowerCase().split("?")[0];
  const videoExts = ["mp4", "webm", "mov", "avi", "mkv"];
  return videoExts.includes(ext) ? "video" : "image";
}
__name(getMediaType, "getMediaType");
function parseLikes(likesStr) {
  if (!likesStr) return [];
  try {
    const parsed = JSON.parse(likesStr);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.error("Failed to parse likes JSON:", likesStr);
    return [];
  }
}
__name(parseLikes, "parseLikes");
async function getUserFromToken3(token, env) {
  if (!token) return null;
  const session = await env.DBA.prepare(
    "SELECT user_id FROM sessions WHERE token = ? AND expires_at > ?"
  ).bind(token, Date.now()).first();
  if (!session) return null;
  const user = await env.DBA.prepare(
    "SELECT user_id, username, display_name, role FROM users WHERE user_id = ?"
  ).bind(session.user_id).first();
  return user;
}
__name(getUserFromToken3, "getUserFromToken3");
function isAdmin3(user) {
  if (!user || !user.role) return false;
  try {
    const roles = JSON.parse(user.role);
    return roles.includes("admin") || roles.includes("moderator");
  } catch {
    return false;
  }
}
__name(isAdmin3, "isAdmin3");
function shouldAutoApprove(user) {
  if (!user || !user.role) return false;
  try {
    const roles = JSON.parse(user.role);
    return roles.includes("vip") || roles.includes("admin") || roles.includes("moderator") || roles.includes("mod");
  } catch {
    return false;
  }
}
__name(shouldAutoApprove, "shouldAutoApprove");
async function handleGet7({ request, env, params }) {
  const url = new URL(request.url);
  const path = params.path ? params.path.join("/") : "";
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "").trim();
  let userCache = { fetched: false, user: null };
  const getUser = /* @__PURE__ */ __name2(async () => {
    if (!userCache.fetched && token) {
      userCache.user = await getUserFromToken3(token, env);
      userCache.fetched = true;
    }
    return userCache.user;
  }, "getUser");
  if (path === "pending") {
    const items = await env.DBA.prepare(
      `SELECT g.id, g.user_id, u.username, g.title, g.description, g.media_url, g.thumbnail_url,
              g.status, g.created_at, g.views, g.likes, u.avatar_url, u.role
       FROM gallery_items g
       LEFT JOIN users u ON g.user_id = u.user_id
       WHERE g.status = 2
       ORDER BY g.created_at DESC`
    ).all();
    const processedItems2 = (items.results || []).map((item) => {
      const likes = parseLikes(item.likes);
      const mediaType = getMediaType(item.media_url);
      return {
        ...item,
        username: item.username || "Unknown",
        media_type: mediaType,
        views: item.views || 0,
        likes_count: likes.length,
        status: "pending"
        // For backwards compatibility
      };
    });
    return new Response(JSON.stringify({ items: processedItems2 }), {
      headers: {
        "Content-Type": "application/json",
        ...CORS_HEADERS
      }
    });
  }
  if (path === "my-submissions") {
    const currentUser2 = await getUser();
    if (!currentUser2) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          ...CORS_HEADERS
        }
      });
    }
    const items = await env.DBA.prepare(
      `SELECT g.id, g.title, g.description, g.media_url, g.thumbnail_url, g.status,
              g.created_at, g.views, g.likes, g.rejection_reason, u.avatar_url, u.role
       FROM gallery_items g
       LEFT JOIN users u ON g.user_id = u.user_id
       WHERE g.user_id = ?
       ORDER BY g.created_at DESC`
    ).bind(currentUser2.user_id).all();
    const processedItems2 = (items.results || []).map((item) => {
      const likes = parseLikes(item.likes);
      const mediaType = getMediaType(item.media_url);
      const statusText = item.status === 1 ? "approved" : item.status === 0 ? "rejected" : "pending";
      return {
        ...item,
        media_type: mediaType,
        views: item.views || 0,
        likes_count: likes.length,
        status: statusText
        // For backwards compatibility
      };
    });
    return new Response(JSON.stringify({ items: processedItems2 }), {
      headers: {
        "Content-Type": "application/json",
        ...CORS_HEADERS
      }
    });
  }
  if (path && path.match(/^\d+$/)) {
    const itemId = parseInt(path, 10);
    try {
      const item = await env.DBA.prepare(
        `SELECT g.id, g.user_id, u.username, g.title, g.description, g.media_url, g.thumbnail_url,
                g.created_at, g.views, g.likes, u.avatar_url, u.role
         FROM gallery_items g
         LEFT JOIN users u ON g.user_id = u.user_id
         WHERE g.id = ? AND g.status = 1`
      ).bind(itemId).first();
      if (!item) {
        return new Response(JSON.stringify({ error: "Item not found" }), {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS
          }
        });
      }
      env.DBA.prepare(
        "UPDATE gallery_items SET views = views + 1 WHERE id = ?"
      ).bind(itemId).run().catch((err) => console.error("View increment failed:", err));
      const likes = parseLikes(item.likes);
      const currentUser2 = await getUser();
      const userLiked = currentUser2 ? likes.includes(currentUser2.user_id) : false;
      const mediaType = getMediaType(item.media_url);
      const processedItem = {
        ...item,
        username: item.username || "Unknown",
        media_type: mediaType,
        views: (item.views || 0) + 1,
        likes_count: likes.length,
        user_liked: userLiked
      };
      return new Response(JSON.stringify({ item: processedItem }), {
        headers: {
          "Content-Type": "application/json",
          ...CORS_HEADERS
        }
      });
    } catch (error) {
      console.error("Error fetching gallery item:", error.message, error.stack);
      return new Response(JSON.stringify({
        error: "Failed to fetch item",
        details: error.message
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...CORS_HEADERS
        }
      });
    }
  }
  const limit = parseInt(url.searchParams.get("limit")) || 50;
  const offset = parseInt(url.searchParams.get("offset")) || 0;
  const sortBy = url.searchParams.get("sort") || "likes";
  const countResult = await env.DBA.prepare(
    "SELECT COUNT(*) as total FROM gallery_items WHERE status = 1"
  ).first();
  const total = countResult?.total || 0;
  const currentUser = await getUser();
  let processedItems;
  if (sortBy === "likes") {
    const items = await env.DBA.prepare(
      `SELECT g.id, g.user_id, u.username, g.title, g.description, g.media_url, g.thumbnail_url,
              g.created_at, g.views, g.likes, g.likes_count, u.avatar_url, u.role
       FROM gallery_items g
       LEFT JOIN users u ON g.user_id = u.user_id
       WHERE g.status = 1
       ORDER BY g.likes_count DESC, g.created_at DESC
       LIMIT ? OFFSET ?`
    ).bind(limit, offset).all();
    processedItems = (items.results || []).map((item) => {
      const likes = parseLikes(item.likes);
      const mediaType = getMediaType(item.media_url);
      const userLiked = currentUser ? likes.includes(currentUser.user_id) : false;
      return {
        ...item,
        username: item.username || "Unknown",
        media_type: mediaType,
        views: item.views || 0,
        likes_count: item.likes_count || likes.length,
        user_liked: userLiked
      };
    });
  } else {
    const items = await env.DBA.prepare(
      `SELECT g.id, g.user_id, u.username, g.title, g.description, g.media_url, g.thumbnail_url,
              g.created_at, g.views, g.likes, u.avatar_url, u.role
       FROM gallery_items g
       LEFT JOIN users u ON g.user_id = u.user_id
       WHERE g.status = 1
       ORDER BY g.created_at DESC
       LIMIT ? OFFSET ?`
    ).bind(limit, offset).all();
    processedItems = (items.results || []).map((item) => {
      const likes = parseLikes(item.likes);
      const mediaType = getMediaType(item.media_url);
      const userLiked = currentUser ? likes.includes(currentUser.user_id) : false;
      return {
        ...item,
        username: item.username || "Unknown",
        media_type: mediaType,
        views: item.views || 0,
        likes_count: likes.length,
        user_liked: userLiked
      };
    });
  }
  return new Response(JSON.stringify({ items: processedItems, total }), {
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS
    }
  });
}
__name(handleGet7, "handleGet7");
async function handlePost8({ request, env, params }) {
  const path = params.path ? params.path.join("/") : "";
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  const user = await getUserFromToken3(token, env);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        ...CORS_HEADERS
      }
    });
  }
  if (path === "upload") {
    try {
      const formData = await request.formData();
      const file = formData.get("file");
      if (!file) {
        return new Response(JSON.stringify({ error: "No file uploaded" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS }
        });
      }
      const validImageTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
      const validVideoTypes = ["video/mp4", "video/webm", "video/quicktime"];
      const isImage = validImageTypes.includes(file.type);
      const isVideo = validVideoTypes.includes(file.type);
      if (!isImage && !isVideo) {
        return new Response(JSON.stringify({
          error: "Invalid file type. Only images (JPEG, PNG, GIF, WebP) and videos (MP4, WebM, MOV) are allowed."
        }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS }
        });
      }
      const maxSize = isVideo ? 100 * 1024 * 1024 : 10 * 1024 * 1024;
      if (file.size > maxSize) {
        return new Response(JSON.stringify({
          error: `File too large. Maximum size is ${isVideo ? "100MB" : "10MB"}.`
        }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS }
        });
      }
      const accountId = env.CLOUDFLARE_ACCOUNT_ID;
      const apiToken = env.CLOUDFLARE_STREAM_TOKEN;
      if (!accountId || !apiToken) {
        return new Response(JSON.stringify({
          error: "Cloudflare credentials not configured"
        }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS }
        });
      }
      const customId = `gallery-${user.user_id}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      if (isImage) {
        const uploadForm = new FormData();
        uploadForm.append("file", file, file.name);
        uploadForm.append("id", customId);
        uploadForm.append("metadata", JSON.stringify({
          user_id: user.user_id,
          username: user.username,
          uploaded_at: Date.now()
        }));
        const uploadRes = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${apiToken}` },
            body: uploadForm
          }
        );
        if (!uploadRes.ok) {
          const error = await uploadRes.text();
          throw new Error(`Images upload failed: ${error}`);
        }
        const result = await uploadRes.json();
        if (!result.success) {
          throw new Error(result.errors?.[0]?.message || "Upload failed");
        }
        const url = result.result.variants[0];
        return new Response(JSON.stringify({
          url,
          type: file.type,
          cf_id: customId,
          provider: "cloudflare-images"
        }), {
          headers: { "Content-Type": "application/json", ...CORS_HEADERS }
        });
      } else {
        const streamToken = env.CLOUDFLARE_STREAM_TOKEN || apiToken;
        const uploadForm = new FormData();
        uploadForm.append("file", file, file.name);
        uploadForm.append("meta", JSON.stringify({
          name: customId,
          user_id: user.user_id,
          username: user.username
        }));
        const uploadRes = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${streamToken}` },
            body: uploadForm
          }
        );
        if (!uploadRes.ok) {
          const error = await uploadRes.text();
          throw new Error(`Stream upload failed: ${error}`);
        }
        const result = await uploadRes.json();
        if (!result.success) {
          throw new Error(result.errors?.[0]?.message || "Upload failed");
        }
        const streamUid = result.result.uid;
        const url = result.result.playback?.hls || `https://customer-${accountId}.cloudflarestream.com/${streamUid}/manifest/video.m3u8`;
        return new Response(JSON.stringify({
          url,
          // HLS manifest for video players
          type: file.type,
          stream_uid: streamUid,
          iframe_url: `https://iframe.videodelivery.net/${streamUid}`,
          provider: "cloudflare-stream"
        }), {
          headers: { "Content-Type": "application/json", ...CORS_HEADERS }
        });
      }
    } catch (err) {
      console.error("Gallery upload error:", err);
      return new Response(JSON.stringify({ error: "Upload failed: " + err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS }
      });
    }
  }
  if (path === "submit") {
    try {
      const data = await request.json();
      const { title, description, media_url, thumbnail_url } = data;
      if (!title || !media_url) {
        return new Response(JSON.stringify({
          error: "Missing required fields: title, media_url"
        }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS
          }
        });
      }
      const status = shouldAutoApprove(user) ? 1 : 2;
      const autoApproved = status === 1;
      const result = await env.DBA.prepare(
        `INSERT INTO gallery_items (user_id, title, description, media_url, thumbnail_url, status, created_at, views, likes)
         VALUES (?, ?, ?, ?, ?, ?, ?, '[]', '[]')`
      ).bind(
        user.user_id,
        title,
        description || "",
        media_url,
        thumbnail_url || null,
        status,
        Date.now()
      ).run();
      return new Response(JSON.stringify({
        success: true,
        id: result.meta.last_row_id,
        message: autoApproved ? "Submission approved! Your art is now live in the gallery." : "Submission received! It will be reviewed by admins before appearing in the gallery."
      }), {
        headers: {
          "Content-Type": "application/json",
          ...CORS_HEADERS
        }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: "Submission failed: " + err.message }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...CORS_HEADERS
        }
      });
    }
  }
  if (path.startsWith("moderate/")) {
    if (!isAdmin3(user)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 403,
        headers: {
          "Content-Type": "application/json",
          ...CORS_HEADERS
        }
      });
    }
    const itemId = path.split("/")[1];
    const data = await request.json();
    const { action, reason } = data;
    if (!action || !["approve", "reject"].includes(action)) {
      return new Response(JSON.stringify({
        error: 'Invalid action. Must be "approve" or "reject"'
      }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...CORS_HEADERS
        }
      });
    }
    const status = action === "approve" ? 1 : 0;
    await env.DBA.prepare(
      `UPDATE gallery_items
       SET status = ?, moderated_by = ?, moderated_at = ?, rejection_reason = ?
       WHERE id = ?`
    ).bind(status, user.username, Date.now(), reason || null, itemId).run();
    return new Response(JSON.stringify({
      success: true,
      message: `Item ${action}d successfully`
    }), {
      headers: {
        "Content-Type": "application/json",
        ...CORS_HEADERS
      }
    });
  }
  if (path.startsWith("like/")) {
    const itemId = path.split("/")[1];
    try {
      const item = await env.DBA.prepare(
        "SELECT id, likes FROM gallery_items WHERE id = ? AND status = 1"
      ).bind(itemId).first();
      if (!item) {
        return new Response(JSON.stringify({ error: "Item not found or not approved" }), {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS
          }
        });
      }
      const likes = parseLikes(item.likes);
      const likeIndex = likes.indexOf(user.user_id);
      if (likeIndex > -1) {
        likes.splice(likeIndex, 1);
        await env.DBA.prepare(
          "UPDATE gallery_items SET likes = ?, likes_count = ? WHERE id = ?"
        ).bind(JSON.stringify(likes), likes.length, itemId).run();
        return new Response(JSON.stringify({
          success: true,
          liked: false,
          message: "Like removed",
          likes_count: likes.length
        }), {
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS
          }
        });
      } else {
        likes.push(user.user_id);
        await env.DBA.prepare(
          "UPDATE gallery_items SET likes = ?, likes_count = ? WHERE id = ?"
        ).bind(JSON.stringify(likes), likes.length, itemId).run();
        return new Response(JSON.stringify({
          success: true,
          liked: true,
          message: "Like added",
          likes_count: likes.length
        }), {
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS
          }
        });
      }
    } catch (error) {
      console.error("Error toggling like:", error);
      return new Response(JSON.stringify({
        error: "Failed to toggle like",
        details: error.message
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...CORS_HEADERS
        }
      });
    }
  }
  return new Response(JSON.stringify({ error: "Invalid endpoint" }), {
    status: 404,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS
    }
  });
}
__name(handlePost8, "handlePost8");
async function handleDelete6({ request, env, params }) {
  const path = params.path ? params.path.join("/") : "";
  if (!path) {
    return new Response(JSON.stringify({ error: "Item ID required" }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        ...CORS_HEADERS
      }
    });
  }
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  const user = await getUserFromToken3(token, env);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        ...CORS_HEADERS
      }
    });
  }
  const itemId = path;
  const item = await env.DBA.prepare(
    "SELECT user_id, media_url FROM gallery_items WHERE id = ?"
  ).bind(itemId).first();
  if (!item) {
    return new Response(JSON.stringify({ error: "Item not found" }), {
      status: 404,
      headers: {
        "Content-Type": "application/json",
        ...CORS_HEADERS
      }
    });
  }
  if (item.user_id !== user.user_id && !isAdmin3(user)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 403,
      headers: {
        "Content-Type": "application/json",
        ...CORS_HEADERS
      }
    });
  }
  await env.DBA.prepare("DELETE FROM gallery_items WHERE id = ?").bind(itemId).run();
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = env.CLOUDFLARE_STREAM_TOKEN;
  if (accountId && apiToken && item.media_url) {
    try {
      if (item.media_url.includes("imagedelivery.net")) {
        const parts = item.media_url.split("/");
        const imageId = parts[parts.length - 2];
        if (imageId && imageId.startsWith("gallery-")) {
          await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1/${imageId}`,
            {
              method: "DELETE",
              headers: { Authorization: `Bearer ${apiToken}` }
            }
          );
          console.log(`Deleted image: ${imageId}`);
        }
      } else if (item.media_url.includes("videodelivery.net") || item.media_url.includes("cloudflarestream.com")) {
        const streamToken = env.CLOUDFLARE_STREAM_TOKEN || apiToken;
        const parts = item.media_url.split("/");
        const uidIndex = parts.findIndex((p) => p.includes("videodelivery.net") || p.includes("cloudflarestream.com"));
        const streamUid = uidIndex >= 0 ? parts[uidIndex + 1] : null;
        if (streamUid) {
          await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${streamUid}`,
            {
              method: "DELETE",
              headers: { Authorization: `Bearer ${streamToken}` }
            }
          );
          console.log(`Deleted video: ${streamUid}`);
        }
      }
    } catch (err) {
      console.error("Failed to delete from Cloudflare:", err);
    }
  }
  return new Response(JSON.stringify({
    success: true,
    message: "Item deleted successfully"
  }), {
    headers: { "Content-Type": "application/json", ...CORS_HEADERS }
  });
}
__name(handleDelete6, "handleDelete6");
async function onRequestGet(context) {
  try {
    return await handleGet7(context);
  } catch (error) {
    console.error("Gallery GET error:", error.message, error.stack);
    return new Response(JSON.stringify({
      error: "Internal server error",
      details: error.message
    }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS }
    });
  }
}
__name(onRequestGet, "onRequestGet");
async function onRequestPost2(context) {
  try {
    return await handlePost8(context);
  } catch (error) {
    console.error("Gallery POST error:", error.message, error.stack);
    return new Response(JSON.stringify({
      error: "Internal server error",
      details: error.message
    }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS }
    });
  }
}
__name(onRequestPost2, "onRequestPost2");
async function onRequestDelete(context) {
  try {
    return await handleDelete6(context);
  } catch (error) {
    console.error("Gallery DELETE error:", error.message, error.stack);
    return new Response(JSON.stringify({
      error: "Internal server error",
      details: error.message
    }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS }
    });
  }
}
__name(onRequestDelete, "onRequestDelete");
async function onRequestOptions2(context) {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS
  });
}
__name(onRequestOptions2, "onRequestOptions2");
var CORS_HEADERS;
var init_path8 = __esm({
  "api/gallery/[[path]].js"() {
    init_functionsRoutes_0_10531370690170583();
    init_auth();
    CORS_HEADERS = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400"
    };
    __name2(getMediaType, "getMediaType");
    __name2(parseLikes, "parseLikes");
    __name2(getUserFromToken3, "getUserFromToken");
    __name2(isAdmin3, "isAdmin");
    __name2(shouldAutoApprove, "shouldAutoApprove");
    __name2(handleGet7, "handleGet");
    __name2(handlePost8, "handlePost");
    __name2(handleDelete6, "handleDelete");
    __name2(onRequestGet, "onRequestGet");
    __name2(onRequestPost2, "onRequestPost");
    __name2(onRequestDelete, "onRequestDelete");
    __name2(onRequestOptions2, "onRequestOptions");
  }
});
function checkRateLimit(ip, limit = 10, window = 6e4) {
  const now = Date.now();
  const key = `${ip}`;
  const requests = rateLimits.get(key) || [];
  const recent = requests.filter((time) => now - time < window);
  if (recent.length >= limit) {
    return false;
  }
  recent.push(now);
  rateLimits.set(key, recent);
  return true;
}
__name(checkRateLimit, "checkRateLimit");
function cleanUserRole(roles) {
  if (!roles || roles.length === 0) return ["user"];
  const filtered = roles.filter((r) => r !== "user");
  return filtered.length > 0 ? filtered : ["user"];
}
__name(cleanUserRole, "cleanUserRole");
async function validateSessionLight(request, env) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) {
    return null;
  }
  const session = await env.DBA.prepare(`
        SELECT s.user_id FROM sessions s
        WHERE s.token = ? AND s.expires_at > ?
    `).bind(token, Date.now()).first();
  return session?.user_id || null;
}
__name(validateSessionLight, "validateSessionLight");
function generateCode() {
  return Math.floor(1e5 + Math.random() * 9e5).toString();
}
__name(generateCode, "generateCode");
async function handleGenerateCode(request, env) {
  const ip = request.headers.get("CF-Connecting-IP");
  if (!checkRateLimit(ip, 5, 6e4)) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
      status: 429,
      headers: { "Content-Type": "application/json" }
    });
  }
  const code = generateCode();
  const expiresAt = Date.now() + 5 * 60 * 1e3;
  await env.DBA.prepare(
    "INSERT INTO auth_codes (code, expires_at) VALUES (?, ?)"
  ).bind(code, expiresAt).run();
  return new Response(JSON.stringify({ code, expiresIn: 300 }), {
    headers: { "Content-Type": "application/json" }
  });
}
__name(handleGenerateCode, "handleGenerateCode");
async function handleVerifyCode(request, env) {
  const data = await request.json();
  const { code, userId, username, displayName } = data;
  if (!code || !userId || !username) {
    return new Response(JSON.stringify({ error: "Missing required fields" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
  const authCode = await env.DBA.prepare(
    "SELECT * FROM auth_codes WHERE code = ? AND expires_at > ? AND used = 0"
  ).bind(code, Date.now()).first();
  if (!authCode) {
    return new Response(JSON.stringify({ error: "Invalid or expired code" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
  await env.DBA.prepare(
    "UPDATE auth_codes SET used = 1, user_id = ? WHERE code = ?"
  ).bind(userId, code).run();
  const existingUser = await env.DBA.prepare(
    "SELECT avatar_url, avatar_cached_at FROM users WHERE user_id = ?"
  ).bind(userId).first();
  let avatarUrl = null;
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1e3;
  if (existingUser?.avatar_url && existingUser.avatar_cached_at > oneDayAgo) {
    avatarUrl = existingUser.avatar_url;
  } else {
    try {
      const response = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png`);
      const json = await response.json();
      avatarUrl = json.data?.[0]?.imageUrl || null;
    } catch (e) {
      console.error("Failed to fetch avatar:", e);
      avatarUrl = existingUser?.avatar_url || null;
    }
  }
  const now = Date.now();
  await env.DBA.prepare(`
INSERT INTO users (user_id, username, display_name, avatar_url, avatar_cached_at, created_at, last_online, role)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(user_id) DO UPDATE SET
    username = excluded.username,
    display_name = excluded.display_name,
    avatar_url = excluded.avatar_url,
    avatar_cached_at = excluded.avatar_cached_at,
    last_online = excluded.last_online
`).bind(userId, username, displayName || username, avatarUrl, now, now, now, '["user"]').run();
  const sessionToken = crypto.randomUUID();
  const expiresAt = now + 3e3 * 24 * 60 * 60 * 1e3;
  await env.DBA.prepare(
    "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)"
  ).bind(sessionToken, userId, now, expiresAt).run();
  return new Response(JSON.stringify({
    success: true,
    token: sessionToken,
    user: { userId, username, displayName, avatarUrl, role: ["user"] }
    // Add role here
  }), {
    headers: { "Content-Type": "application/json" }
  });
}
__name(handleVerifyCode, "handleVerifyCode");
async function handleGetSession(request, env) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) {
    return new Response(JSON.stringify({ error: "No token provided" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }
  const now = Date.now();
  const session = await env.DBA.prepare(`
        SELECT s.*, u.* FROM sessions s
        JOIN users u ON s.user_id = u.user_id
        WHERE s.token = ? AND s.expires_at > ?
    `).bind(token, now).first();
  if (!session) {
    return new Response(JSON.stringify({ error: "Invalid session" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }
  let userRoles;
  try {
    userRoles = session.role ? JSON.parse(session.role) : null;
  } catch (e) {
    console.error("Failed to parse user role:", e);
    userRoles = null;
  }
  const needsRoleUpdate = !Array.isArray(userRoles) || userRoles.length === 0;
  if (needsRoleUpdate) {
    userRoles = ["user"];
  }
  const fiveMinutesAgo = now - 5 * 60 * 1e3;
  const needsOnlineUpdate = !session.last_online || session.last_online < fiveMinutesAgo;
  if (needsRoleUpdate && needsOnlineUpdate) {
    await env.DBA.prepare("UPDATE users SET last_online = ?, role = ? WHERE user_id = ?").bind(now, '["user"]', session.user_id).run();
  } else if (needsRoleUpdate) {
    await env.DBA.prepare("UPDATE users SET role = ? WHERE user_id = ?").bind('["user"]', session.user_id).run();
  } else if (needsOnlineUpdate) {
    env.DBA.prepare("UPDATE users SET last_online = ? WHERE user_id = ?").bind(now, session.user_id).run();
  }
  return new Response(JSON.stringify({
    userId: session.user_id,
    username: session.username,
    displayName: session.display_name,
    avatarUrl: session.avatar_url,
    role: cleanUserRole(userRoles)
  }), {
    headers: { "Content-Type": "application/json" }
  });
}
__name(handleGetSession, "handleGetSession");
async function handleLogout(request, env) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (token) {
    await env.DBA.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
  }
  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json" }
  });
}
__name(handleLogout, "handleLogout");
async function handleUpdateRole(request, env) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  const session = await env.DBA.prepare(`
        SELECT u.role, u.user_id FROM sessions s
        JOIN users u ON s.user_id = u.user_id
        WHERE s.token = ? AND s.expires_at > ?
    `).bind(token, Date.now()).first();
  const adminRoles = JSON.parse(session?.role || '["user"]');
  if (!session || !adminRoles.includes("admin")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 403,
      headers: { "Content-Type": "application/json" }
    });
  }
  const { userId, role, action } = await request.json();
  if (!["user", "vip", "moderator", "admin"].includes(role)) {
    return new Response(JSON.stringify({ error: "Invalid role" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
  const user = await env.DBA.prepare("SELECT role FROM users WHERE user_id = ?").bind(userId).first();
  const currentRoles = JSON.parse(user?.role || '["user"]');
  let newRoles;
  if (action === "add") {
    newRoles = currentRoles.includes(role) ? currentRoles : [...currentRoles, role];
    newRoles = cleanUserRole(newRoles);
  } else if (action === "remove") {
    newRoles = currentRoles.filter((r) => r !== role);
    if (newRoles.length === 0) newRoles = ["user"];
  } else {
    return new Response(JSON.stringify({ error: 'Action must be "add" or "remove"' }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
  await env.DBA.prepare("UPDATE users SET role = ? WHERE user_id = ?").bind(JSON.stringify(newRoles), userId).run();
  return new Response(JSON.stringify({ success: true, roles: cleanUserRole(newRoles) }), {
    headers: { "Content-Type": "application/json" }
  });
}
__name(handleUpdateRole, "handleUpdateRole");
async function handleUserSearch(request, env) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  const url = new URL(request.url);
  const query = url.searchParams.get("q") || "";
  const limit = parseInt(url.searchParams.get("limit")) || 10;
  const safeLimit = Math.min(limit, 100);
  let users;
  try {
    if (!query || query.trim() === "") {
      users = await env.DBA.prepare(`
                SELECT
                    u.user_id,
                    u.username,
                    u.display_name,
                    u.avatar_url,
                    u.role,
                    COALESCE(uts.total_trades, 0) as total_trades,
                    COALESCE(uts.average_rating, 0) as average_rating
                FROM users u
                LEFT JOIN user_trade_stats uts ON u.user_id = uts.user_id
                ORDER BY u.created_at DESC
                LIMIT ?
            `).bind(safeLimit).all();
    } else if (/^\d+$/.test(query)) {
      users = await env.DBA.prepare(`
                SELECT
                    u.user_id,
                    u.username,
                    u.display_name,
                    u.avatar_url,
                    u.role,
                    COALESCE(uts.total_trades, 0) as total_trades,
                    COALESCE(uts.average_rating, 0) as average_rating
                FROM users u
                LEFT JOIN user_trade_stats uts ON u.user_id = uts.user_id
                WHERE u.user_id = ?
                LIMIT ?
            `).bind(query, safeLimit).all();
    } else {
      users = await env.DBA.prepare(`
                SELECT
                    u.user_id,
                    u.username,
                    u.display_name,
                    u.avatar_url,
                    u.role,
                    COALESCE(uts.total_trades, 0) as total_trades,
                    COALESCE(uts.average_rating, 0) as average_rating
                FROM users u
                LEFT JOIN user_trade_stats uts ON u.user_id = uts.user_id
                WHERE LOWER(u.username) LIKE LOWER(?) OR LOWER(u.display_name) LIKE LOWER(?)
                LIMIT ?
            `).bind(`%${query}%`, `%${query}%`, safeLimit).all();
    }
  } catch (error) {
    console.error("Failed to query with trade stats, falling back to basic query:", error);
    if (!query || query.trim() === "") {
      users = await env.DBA.prepare(`
                SELECT
                    u.user_id,
                    u.username,
                    u.display_name,
                    u.avatar_url,
                    u.role,
                    0 as total_trades,
                    0 as average_rating
                FROM users u
                ORDER BY u.created_at DESC
                LIMIT ?
            `).bind(safeLimit).all();
    } else if (/^\d+$/.test(query)) {
      users = await env.DBA.prepare(`
                SELECT
                    u.user_id,
                    u.username,
                    u.display_name,
                    u.avatar_url,
                    u.role,
                    0 as total_trades,
                    0 as average_rating
                FROM users u
                WHERE u.user_id = ?
                LIMIT ?
            `).bind(query, safeLimit).all();
    } else {
      users = await env.DBA.prepare(`
                SELECT
                    u.user_id,
                    u.username,
                    u.display_name,
                    u.avatar_url,
                    u.role,
                    0 as total_trades,
                    0 as average_rating
                FROM users u
                WHERE LOWER(u.username) LIKE LOWER(?) OR LOWER(u.display_name) LIKE LOWER(?)
                LIMIT ?
            `).bind(`%${query}%`, `%${query}%`, safeLimit).all();
    }
  }
  return new Response(JSON.stringify({ users: users.results || [] }), {
    headers: { "Content-Type": "application/json" }
  });
}
__name(handleUserSearch, "handleUserSearch");
async function handleCheckCode(request, env) {
  const { code } = await request.json();
  if (!code) {
    return new Response(JSON.stringify({ error: "Code required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
  const authCode = await env.DBA.prepare(
    "SELECT * FROM auth_codes WHERE code = ? AND used = 1"
  ).bind(code).first();
  if (!authCode || !authCode.user_id) {
    return new Response(JSON.stringify({ verified: false }), {
      headers: { "Content-Type": "application/json" }
    });
  }
  const session = await env.DBA.prepare(`
        SELECT s.token, u.* FROM sessions s
        JOIN users u ON s.user_id = u.user_id
        WHERE s.user_id = ? AND s.expires_at > ?
        ORDER BY s.created_at DESC
        LIMIT 1
    `).bind(authCode.user_id, Date.now()).first();
  if (session) {
    return new Response(JSON.stringify({
      verified: true,
      token: session.token,
      user: {
        userId: session.user_id,
        username: session.username,
        displayName: session.display_name,
        avatarUrl: session.avatar_url,
        role: session.role
      }
    }), {
      headers: { "Content-Type": "application/json" }
    });
  }
  return new Response(JSON.stringify({ verified: false }), {
    headers: { "Content-Type": "application/json" }
  });
}
__name(handleCheckCode, "handleCheckCode");
async function handleDonationStatus(request, env) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) {
    return new Response(JSON.stringify({ error: "No token provided" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }
  const session = await env.DBA.prepare(`
        SELECT u.* FROM sessions s
        JOIN users u ON s.user_id = u.user_id
        WHERE s.token = ? AND s.expires_at > ?
    `).bind(token, Date.now()).first();
  if (!session) {
    return new Response(JSON.stringify({ error: "Invalid session" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }
  let currentRoles;
  try {
    currentRoles = session.role ? JSON.parse(session.role) : ["user"];
  } catch (e) {
    currentRoles = ["user"];
  }
  if (!Array.isArray(currentRoles) || currentRoles.length === 0) {
    currentRoles = ["user"];
  }
  const donationKey = `purchase:${session.user_id}`;
  const donationData = await env.DONATIONS_KV.get(donationKey);
  let totalSpent = 0;
  let purchases = 0;
  if (donationData) {
    const data = JSON.parse(donationData);
    totalSpent = data.totalSpent || 0;
    purchases = data.purchases || 0;
  }
  const isDonator = totalSpent >= 500;
  const progress = Math.min(totalSpent / 500 * 100, 100);
  const remaining = Math.max(500 - totalSpent, 0);
  const hasDonatorRole = currentRoles.includes("donator");
  const justBecameDonator = isDonator && !hasDonatorRole;
  let updatedRoles = currentRoles;
  if (isDonator && !hasDonatorRole) {
    updatedRoles = [...currentRoles, "donator"];
    updatedRoles = cleanUserRole(updatedRoles);
    await env.DBA.prepare(
      "UPDATE users SET role = ? WHERE user_id = ?"
    ).bind(JSON.stringify(updatedRoles), session.user_id).run();
  } else if (!isDonator && hasDonatorRole) {
    updatedRoles = currentRoles.filter((r) => r !== "donator");
    if (updatedRoles.length === 0) updatedRoles = ["user"];
    await env.DBA.prepare(
      "UPDATE users SET role = ? WHERE user_id = ?"
    ).bind(JSON.stringify(updatedRoles), session.user_id).run();
  }
  return new Response(JSON.stringify({
    totalSpent,
    purchases,
    isDonator,
    progress,
    remaining,
    justBecameDonator,
    roles: updatedRoles
    // Return full roles array instead of single role
  }), {
    headers: { "Content-Type": "application/json" }
  });
}
__name(handleDonationStatus, "handleDonationStatus");
async function handleSavePreferences(request, env) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) {
    return new Response(JSON.stringify({ error: "No token provided" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }
  const session = await env.DBA.prepare(`
        SELECT u.user_id FROM sessions s
        JOIN users u ON s.user_id = u.user_id
        WHERE s.token = ? AND s.expires_at > ?
    `).bind(token, Date.now()).first();
  if (!session) {
    return new Response(JSON.stringify({ error: "Invalid session" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }
  const preferences = await request.json();
  const now = Date.now();
  const userId = session.user_id;
  const batch = [];
  for (const [key, value] of Object.entries(preferences)) {
    const valueJson = JSON.stringify(value);
    batch.push(
      env.DBA.prepare(`
                INSERT INTO user_preferences (user_id, preference_key, preference_value, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(user_id, preference_key) DO UPDATE SET
                    preference_value = excluded.preference_value,
                    updated_at = excluded.updated_at
            `).bind(userId, key, valueJson, now)
    );
    if ((key === "favorites" || key === "wishlist") && Array.isArray(value)) {
      const prefType = key === "favorites" ? "favorite" : "wishlist";
      batch.push(
        env.DBA.prepare(`
                    DELETE FROM user_item_preferences
                    WHERE user_id = ? AND preference_type = ?
                `).bind(userId, prefType)
      );
      for (const itemName of value) {
        if (typeof itemName === "string" && itemName.trim()) {
          batch.push(
            env.DBA.prepare(`
                            INSERT OR IGNORE INTO user_item_preferences (user_id, item_name, preference_type)
                            VALUES (?, ?, ?)
                        `).bind(userId, itemName, prefType)
          );
        }
      }
    }
  }
  if (batch.length > 0) {
    await env.DBA.batch(batch);
  }
  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json" }
  });
}
__name(handleSavePreferences, "handleSavePreferences");
async function handleLoadPreferences(request, env) {
  const userId = await validateSessionLight(request, env);
  if (!userId) {
    return new Response(JSON.stringify({ error: "Invalid session" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (key) {
    const pref = await env.DBA.prepare(
      "SELECT preference_value FROM user_preferences WHERE user_id = ? AND preference_key = ?"
    ).bind(userId, key).first();
    if (pref) {
      return new Response(JSON.stringify({
        [key]: JSON.parse(pref.preference_value)
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }
    return new Response(JSON.stringify({}), {
      headers: { "Content-Type": "application/json" }
    });
  } else {
    const prefs = await env.DBA.prepare(
      "SELECT preference_key, preference_value FROM user_preferences WHERE user_id = ?"
    ).bind(userId).all();
    const result = {};
    prefs.results.forEach((pref) => {
      result[pref.preference_key] = JSON.parse(pref.preference_value);
    });
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" }
    });
  }
}
__name(handleLoadPreferences, "handleLoadPreferences");
async function handleMigratePreferences(request, env) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) {
    return new Response(JSON.stringify({ error: "No token provided" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }
  const session = await env.DBA.prepare(`
        SELECT u.user_id FROM sessions s
        JOIN users u ON s.user_id = u.user_id
        WHERE s.token = ? AND s.expires_at > ?
    `).bind(token, Date.now()).first();
  if (!session) {
    return new Response(JSON.stringify({ error: "Invalid session" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }
  const localData = await request.json();
  const now = Date.now();
  const existingPrefs = await env.DBA.prepare(
    "SELECT COUNT(*) as count FROM user_preferences WHERE user_id = ?"
  ).bind(session.user_id).first();
  if (existingPrefs.count === 0) {
    for (const [key, value] of Object.entries(localData)) {
      const valueJson = JSON.stringify(value);
      await env.DBA.prepare(`
                INSERT INTO user_preferences (user_id, preference_key, preference_value, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(user_id, preference_key) DO UPDATE SET
                    preference_value = excluded.preference_value,
                    updated_at = excluded.updated_at
            `).bind(session.user_id, key, valueJson, now).run();
    }
    return new Response(JSON.stringify({ success: true, migrated: true }), {
      headers: { "Content-Type": "application/json" }
    });
  }
  return new Response(JSON.stringify({ success: true, migrated: false, message: "User already has cloud preferences" }), {
    headers: { "Content-Type": "application/json" }
  });
}
__name(handleMigratePreferences, "handleMigratePreferences");
function calculateDisplayedFlikes(targetFlikes, createdAt) {
  if (!targetFlikes || targetFlikes <= 0) return 0;
  const now = Date.now();
  const createdAtMs = createdAt * 1e3;
  const ageMs = now - createdAtMs;
  const ageDays = ageMs / (1e3 * 60 * 60 * 24);
  const progress = Math.min(ageDays / 30, 1);
  return Math.floor(targetFlikes * progress);
}
__name(calculateDisplayedFlikes, "calculateDisplayedFlikes");
async function handleGetPreferenceStats(request, env) {
  const url = new URL(request.url);
  const wantReal = url.searchParams.get("real") === "true";
  if (request.method === "POST") {
    try {
      const body = await request.json();
      const itemNames = body.items || [];
      if (!Array.isArray(itemNames) || itemNames.length === 0) {
        return new Response(JSON.stringify({ itemCounts: {} }), {
          headers: { "Content-Type": "application/json" }
        });
      }
      const placeholders = itemNames.map(() => "?").join(",");
      if (wantReal) {
        const { results: results2 } = await env.DBA.prepare(`
                    SELECT item_name, COUNT(*) as count
                    FROM user_item_preferences
                    WHERE item_name IN (${placeholders})
                    GROUP BY item_name
                `).bind(...itemNames).all();
        const itemCounts2 = {};
        itemNames.forEach((name) => {
          itemCounts2[name] = 0;
        });
        (results2 || []).forEach((row) => {
          itemCounts2[row.item_name] = row.count;
        });
        return new Response(JSON.stringify({ itemCounts: itemCounts2 }), {
          headers: { "Content-Type": "application/json" }
        });
      }
      const { results } = await env.DBA.prepare(`
                SELECT name, target_flikes, created_at
                FROM items
                WHERE name IN (${placeholders})
            `).bind(...itemNames).all();
      const itemCounts = {};
      itemNames.forEach((name) => {
        itemCounts[name] = 0;
      });
      (results || []).forEach((row) => {
        itemCounts[row.name] = calculateDisplayedFlikes(row.target_flikes, row.created_at);
      });
      return new Response(JSON.stringify({ itemCounts }), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60"
        }
      });
    } catch (e) {
      console.error("Error fetching bulk preference stats:", e);
      return new Response(JSON.stringify({ itemCounts: {} }), {
        headers: { "Content-Type": "application/json" }
      });
    }
  }
  const itemName = url.searchParams.get("item");
  if (itemName) {
    try {
      if (wantReal) {
        const [favResult, wishResult] = await Promise.all([
          env.DBA.prepare(`
                        SELECT COUNT(*) as count
                        FROM user_item_preferences
                        WHERE item_name = ? AND preference_type = 'favorite'
                    `).bind(itemName).first(),
          env.DBA.prepare(`
                        SELECT COUNT(*) as count
                        FROM user_item_preferences
                        WHERE item_name = ? AND preference_type = 'wishlist'
                    `).bind(itemName).first()
        ]);
        const favoritesCount = favResult?.count || 0;
        const wishlistCount = wishResult?.count || 0;
        return new Response(JSON.stringify({
          favorites_count: favoritesCount,
          wishlist_count: wishlistCount,
          total_count: favoritesCount + wishlistCount
        }), {
          headers: { "Content-Type": "application/json" }
        });
      }
      const item = await env.DBA.prepare(`
                SELECT target_flikes, created_at
                FROM items
                WHERE name = ?
            `).bind(itemName).first();
      const displayedCount = item ? calculateDisplayedFlikes(item.target_flikes, item.created_at) : 0;
      return new Response(JSON.stringify({
        favorites_count: displayedCount,
        wishlist_count: 0,
        total_count: displayedCount
      }), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60"
          // Cache for 1 minute
        }
      });
    } catch (e) {
      console.error("Error fetching preference stats:", e);
      return new Response(JSON.stringify({
        favorites_count: 0,
        wishlist_count: 0,
        total_count: 0
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }
  }
  return new Response(JSON.stringify({
    favorites_count: 0,
    wishlist_count: 0,
    total_count: 0
  }), {
    headers: { "Content-Type": "application/json" }
  });
}
__name(handleGetPreferenceStats, "handleGetPreferenceStats");
async function handleMigrateItemPreferences(request, env) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }
  const session = await env.DBA.prepare(`
        SELECT u.user_id, u.role FROM sessions s
        JOIN users u ON s.user_id = u.user_id
        WHERE s.token = ? AND s.expires_at > ?
    `).bind(token, Date.now()).first();
  if (!session || !session.role?.includes("admin")) {
    return new Response(JSON.stringify({ error: "Admin access required" }), {
      status: 403,
      headers: { "Content-Type": "application/json" }
    });
  }
  try {
    let migratedUsers = 0;
    let migratedItems = 0;
    const { results: favResults } = await env.DBA.prepare(`
            SELECT user_id, preference_value
            FROM user_preferences
            WHERE preference_key = 'favorites'
        `).all();
    for (const row of favResults || []) {
      try {
        const items = JSON.parse(row.preference_value || "[]");
        if (Array.isArray(items)) {
          for (const itemName of items) {
            if (typeof itemName === "string" && itemName.trim()) {
              await env.DBA.prepare(`
                                INSERT OR IGNORE INTO user_item_preferences (user_id, item_name, preference_type)
                                VALUES (?, ?, 'favorite')
                            `).bind(row.user_id, itemName).run();
              migratedItems++;
            }
          }
          migratedUsers++;
        }
      } catch (e) {
      }
    }
    const { results: wishResults } = await env.DBA.prepare(`
            SELECT user_id, preference_value
            FROM user_preferences
            WHERE preference_key = 'wishlist'
        `).all();
    for (const row of wishResults || []) {
      try {
        const items = JSON.parse(row.preference_value || "[]");
        if (Array.isArray(items)) {
          for (const itemName of items) {
            if (typeof itemName === "string" && itemName.trim()) {
              await env.DBA.prepare(`
                                INSERT OR IGNORE INTO user_item_preferences (user_id, item_name, preference_type)
                                VALUES (?, ?, 'wishlist')
                            `).bind(row.user_id, itemName).run();
              migratedItems++;
            }
          }
        }
      } catch (e) {
      }
    }
    return new Response(JSON.stringify({
      success: true,
      migratedUsers,
      migratedItems
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    console.error("Migration error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
__name(handleMigrateItemPreferences, "handleMigrateItemPreferences");
async function handleOAuthAuthorize(request, env) {
  const clientId = env.ROBLOX_OAUTH_CLIENT_ID;
  const redirectUri = env.ROBLOX_OAUTH_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return new Response(JSON.stringify({ error: "OAuth not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
  const state = crypto.randomUUID();
  const authUrl = new URL("https://apis.roblox.com/oauth/v1/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", "openid profile");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("state", state);
  return Response.redirect(authUrl.toString(), 302);
}
__name(handleOAuthAuthorize, "handleOAuthAuthorize");
async function handleOAuthCallback(request, env) {
  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  if (error) {
    return Response.redirect(`${origin}/?auth_error=${encodeURIComponent(error)}`, 302);
  }
  if (!code) {
    return Response.redirect(`${origin}/?auth_error=no_code`, 302);
  }
  const clientId = env.ROBLOX_OAUTH_CLIENT_ID;
  const clientSecret = env.ROBLOX_OAUTH_CLIENT_SECRET;
  const redirectUri = env.ROBLOX_OAUTH_REDIRECT_URI;
  try {
    const tokenResponse = await fetch("https://apis.roblox.com/oauth/v1/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": "Basic " + btoa(`${clientId}:${clientSecret}`)
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri
      })
    });
    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Token exchange failed:", errorText);
      return Response.redirect(`${origin}/?auth_error=token_exchange_failed`, 302);
    }
    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    const userInfoResponse = await fetch("https://apis.roblox.com/oauth/v1/userinfo", {
      headers: {
        "Authorization": `Bearer ${accessToken}`
      }
    });
    if (!userInfoResponse.ok) {
      console.error("Failed to fetch user info");
      return Response.redirect(`${origin}/?auth_error=userinfo_failed`, 302);
    }
    const userInfo = await userInfoResponse.json();
    const userId = userInfo.sub;
    const username = userInfo.preferred_username;
    const displayName = userInfo.nickname || username;
    const avatarUrl = userInfo.picture || null;
    const now = Date.now();
    await env.DBA.prepare(`
            INSERT INTO users (user_id, username, display_name, avatar_url, avatar_cached_at, created_at, last_online, role)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                username = excluded.username,
                display_name = excluded.display_name,
                avatar_url = excluded.avatar_url,
                avatar_cached_at = excluded.avatar_cached_at,
                last_online = excluded.last_online
        `).bind(userId, username, displayName, avatarUrl, now, now, now, '["user"]').run();
    const sessionToken = crypto.randomUUID();
    const expiresAt = now + 3e3 * 24 * 60 * 60 * 1e3;
    await env.DBA.prepare(
      "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)"
    ).bind(sessionToken, userId, now, expiresAt).run();
    return Response.redirect(`${origin}/?auth_success=true&token=${sessionToken}`, 302);
  } catch (error2) {
    console.error("OAuth callback error:", error2);
    return Response.redirect(`${origin}/?auth_error=unexpected_error`, 302);
  }
}
__name(handleOAuthCallback, "handleOAuthCallback");
async function onRequest11(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace("/api/auth/", "");
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    let response;
    switch (path) {
      case "generate-code":
        response = await handleGenerateCode(request, env);
        break;
      case "verify-code":
        response = await handleVerifyCode(request, env);
        break;
      case "check-code":
        response = await handleCheckCode(request, env);
        break;
      case "donation-status":
        response = await handleDonationStatus(request, env);
        break;
      case "session":
        response = await handleGetSession(request, env);
        break;
      case "logout":
        response = await handleLogout(request, env);
        break;
      case "admin/update-role":
        response = await handleUpdateRole(request, env);
        break;
      case "user/search":
        response = await handleUserSearch(request, env);
        break;
      // NEW PREFERENCE ENDPOINTS
      case "user/preferences":
        if (request.method === "POST") {
          response = await handleSavePreferences(request, env);
        } else if (request.method === "GET") {
          response = await handleLoadPreferences(request, env);
        }
        break;
      case "user/preferences/migrate":
        response = await handleMigratePreferences(request, env);
        break;
      case "user/preferences/stats":
        response = await handleGetPreferenceStats(request, env);
        break;
      case "admin/migrate-item-preferences":
        response = await handleMigrateItemPreferences(request, env);
        break;
      // OAUTH 2.0 ENDPOINTS
      case "oauth/authorize":
        response = await handleOAuthAuthorize(request, env);
        break;
      case "oauth/callback":
        response = await handleOAuthCallback(request, env);
        break;
      default:
        response = new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" }
        });
    }
    const isRedirect = response.status >= 300 && response.status < 400;
    if (!isRedirect) {
      Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
    }
    return response;
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}
__name(onRequest11, "onRequest11");
var rateLimits;
var init_path9 = __esm({
  "api/auth/[[path]].js"() {
    init_functionsRoutes_0_10531370690170583();
    rateLimits = /* @__PURE__ */ new Map();
    __name2(checkRateLimit, "checkRateLimit");
    __name2(cleanUserRole, "cleanUserRole");
    __name2(validateSessionLight, "validateSessionLight");
    __name2(generateCode, "generateCode");
    __name2(handleGenerateCode, "handleGenerateCode");
    __name2(handleVerifyCode, "handleVerifyCode");
    __name2(handleGetSession, "handleGetSession");
    __name2(handleLogout, "handleLogout");
    __name2(handleUpdateRole, "handleUpdateRole");
    __name2(handleUserSearch, "handleUserSearch");
    __name2(handleCheckCode, "handleCheckCode");
    __name2(handleDonationStatus, "handleDonationStatus");
    __name2(handleSavePreferences, "handleSavePreferences");
    __name2(handleLoadPreferences, "handleLoadPreferences");
    __name2(handleMigratePreferences, "handleMigratePreferences");
    __name2(calculateDisplayedFlikes, "calculateDisplayedFlikes");
    __name2(handleGetPreferenceStats, "handleGetPreferenceStats");
    __name2(handleMigrateItemPreferences, "handleMigrateItemPreferences");
    __name2(handleOAuthAuthorize, "handleOAuthAuthorize");
    __name2(handleOAuthCallback, "handleOAuthCallback");
    __name2(onRequest11, "onRequest");
  }
});
async function onRequest12(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.split("/").slice(4).join("/");
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    if (path === "all" && request.method === "GET") {
      return await getAllDemand(env, corsHeaders);
    }
    if (path.startsWith("category/") && request.method === "GET") {
      const category = path.split("/")[1];
      return await getCategoryDemand(env, category, corsHeaders);
    }
    if (path === "set" && request.method === "POST") {
      return await setDemand(request, env, corsHeaders);
    }
    if (path === "bulk" && request.method === "POST") {
      return await bulkSetDemand(request, env, corsHeaders);
    }
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Demand API error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}
__name(onRequest12, "onRequest12");
async function getAllDemand(env, corsHeaders) {
  const { results } = await env.DBA.prepare(`
        SELECT name as item_name, category, demand, demand_updated_at as updated_at
        FROM items
        ORDER BY category, name
    `).all();
  return new Response(JSON.stringify({ demand: results || [] }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
__name(getAllDemand, "getAllDemand");
async function getCategoryDemand(env, category, corsHeaders) {
  const { results } = await env.DBA.prepare(`
        SELECT name as item_name, demand, demand_updated_at as updated_at
        FROM items
        WHERE category = ?
        ORDER BY name
    `).bind(category).all();
  return new Response(JSON.stringify({ demand: results || [] }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
__name(getCategoryDemand, "getCategoryDemand");
async function setDemand(request, env, corsHeaders) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const sessionToken = cookieHeader.split("; ").find((c) => c.startsWith("session="))?.split("=")[1];
  if (!sessionToken) {
    return new Response(JSON.stringify({ error: "Unauthorized - No session" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
  const session = await verifySession(sessionToken, env.SECRET_KEY);
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized - Invalid session" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
  const admin = await env.DBH.prepare("SELECT name FROM admins WHERE name = ?").bind(session.name).first();
  if (!admin) {
    return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
  const data = await request.json();
  const { item_name, category, demand } = data;
  if (!item_name || !category || demand === void 0) {
    return new Response(JSON.stringify({ error: "Missing required fields" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
  if (demand < 0 || demand > 5 || !Number.isInteger(demand)) {
    return new Response(JSON.stringify({ error: "Demand must be an integer between 0 and 5" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
  const result = await env.DBA.prepare(`
        UPDATE items
        SET demand = ?, demand_updated_at = strftime('%s', 'now')
        WHERE name = ? AND category = ?
    `).bind(demand, item_name, category).run();
  if (result.meta.changes === 0) {
    return new Response(JSON.stringify({ error: "Item not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
  return new Response(JSON.stringify({
    success: true,
    message: "Demand updated successfully",
    demand: { item_name, category, demand }
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
__name(setDemand, "setDemand");
async function bulkSetDemand(request, env, corsHeaders) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const sessionToken = cookieHeader.split("; ").find((c) => c.startsWith("session="))?.split("=")[1];
  if (!sessionToken) {
    return new Response(JSON.stringify({ error: "Unauthorized - No session" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
  const session = await verifySession(sessionToken, env.SECRET_KEY);
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized - Invalid session" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
  const admin = await env.DBH.prepare("SELECT name FROM admins WHERE name = ?").bind(session.name).first();
  if (!admin) {
    return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
  const data = await request.json();
  const { items } = data;
  if (!Array.isArray(items) || items.length === 0) {
    return new Response(JSON.stringify({ error: "items must be a non-empty array" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
  for (const item of items) {
    if (!item.item_name || !item.category || item.demand === void 0) {
      return new Response(JSON.stringify({ error: "Each item must have item_name, category, and demand" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    if (item.demand < 0 || item.demand > 5 || !Number.isInteger(item.demand)) {
      return new Response(JSON.stringify({ error: "Demand must be an integer between 0 and 5" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }
  const batch = [];
  for (const item of items) {
    batch.push(
      env.DBA.prepare(`
                UPDATE items
                SET demand = ?, demand_updated_at = strftime('%s', 'now')
                WHERE name = ? AND category = ?
            `).bind(item.demand, item.item_name, item.category)
    );
  }
  await env.DBA.batch(batch);
  return new Response(JSON.stringify({
    success: true,
    message: `Successfully updated ${items.length} item(s)`,
    count: items.length
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
__name(bulkSetDemand, "bulkSetDemand");
var init_path10 = __esm({
  "api/demand/[[path]].js"() {
    init_functionsRoutes_0_10531370690170583();
    init_auth();
    __name2(onRequest12, "onRequest");
    __name2(getAllDemand, "getAllDemand");
    __name2(getCategoryDemand, "getCategoryDemand");
    __name2(setDemand, "setDemand");
    __name2(bulkSetDemand, "bulkSetDemand");
  }
});
async function onRequest13(context) {
  const { request, env, params } = context;
  const url = new URL(request.url);
  const CF_ACCOUNT_HASH = env.CF_ACCOUNT_HASH || "I2Jsf9fuZwSztWJZaX0DJA";
  const imagePath = params.path ? params.path.join("/") : "";
  if (!imagePath) {
    return new Response("Image path required", { status: 400 });
  }
  const normalizedPath = imagePath.replace(/\\/g, "/").replace(/^\/+/, "");
  let lookupPath = normalizedPath;
  if (lookupPath.startsWith("imgs/")) {
    lookupPath = lookupPath.replace("imgs/", "items/");
  } else if (!lookupPath.startsWith("items/")) {
    lookupPath = `items/${lookupPath}`;
  }
  try {
    const item = await env.DBA.prepare(`
      SELECT img FROM items 
      WHERE img LIKE ? OR img LIKE ?
      LIMIT 1
    `).bind(
      `%${normalizedPath}%`,
      `%${lookupPath}%`
    ).first();
    if (item && item.img) {
      if (item.img.includes("imagedelivery.net") || item.img.includes("cloudflare-images.com")) {
        const imageUrl = new URL(item.img);
        const width = url.searchParams.get("width");
        const height = url.searchParams.get("height");
        const fit = url.searchParams.get("fit") || "scale-down";
        const quality = url.searchParams.get("quality");
        const format = url.searchParams.get("format");
        if (width) imageUrl.searchParams.set("width", width);
        if (height) imageUrl.searchParams.set("height", height);
        if (fit) imageUrl.searchParams.set("fit", fit);
        if (quality) imageUrl.searchParams.set("quality", quality);
        if (format) imageUrl.searchParams.set("format", format);
        return Response.redirect(imageUrl.toString(), 302);
      }
    }
    try {
      const r2Key = normalizedPath.startsWith("items/") ? normalizedPath : `items/${normalizedPath}`;
      let finalR2Key = r2Key;
      if (r2Key.startsWith("items/uploads/")) {
        finalR2Key = r2Key.replace("items/uploads/", "uploads/");
      }
      const object = await env.MY_BUCKET?.get(finalR2Key);
      if (object) {
        const imageData = await object.arrayBuffer();
        const contentType = object.httpMetadata?.contentType || "image/png";
        return new Response(imageData, {
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=31536000, immutable",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET"
          }
        });
      }
      return new Response("Image not found", {
        status: 404,
        headers: {
          "Content-Type": "text/plain",
          "Access-Control-Allow-Origin": "*"
        }
      });
    } catch (error) {
      return new Response("Image not found", {
        status: 404,
        headers: {
          "Content-Type": "text/plain",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }
  } catch (error) {
    console.error("Error serving image:", error);
    return new Response("Error serving image: " + error.message, {
      status: 500,
      headers: {
        "Content-Type": "text/plain",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
}
__name(onRequest13, "onRequest13");
var init_path11 = __esm({
  "api/images/[[path]].js"() {
    init_functionsRoutes_0_10531370690170583();
    __name2(onRequest13, "onRequest");
  }
});
function normalizeImageUrl(imgPath) {
  if (!imgPath) return null;
  if (imgPath.startsWith("http://") || imgPath.startsWith("https://")) {
    return imgPath;
  }
  let normalized = imgPath.replace(/\\/g, "/");
  normalized = normalized.replace(/^\.?\//, "");
  if (normalized.startsWith("imgs/")) {
    normalized = normalized.replace("imgs/", "items/");
  } else if (!normalized.startsWith("items/")) {
    normalized = `items/${normalized}`;
  }
  return `https://emwiki.com/api/images/${normalized}`;
}
__name(normalizeImageUrl, "normalizeImageUrl");
async function onRequest14(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const pathParts = url.pathname.split("/").filter((p) => p);
  const pathIndex = pathParts.indexOf("items");
  const path = pathIndex >= 0 ? pathParts.slice(pathIndex + 1).join("/") : "";
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    if (request.method === "GET") {
      if (path === "categories") {
        return await getCategories(env, corsHeaders);
      }
      if (path === "search") {
        return await searchItems(request, env, corsHeaders);
      }
      if (path === "homepage") {
        return await getHomepageItems(env, corsHeaders);
      }
      if (path === "random") {
        return await getRandomItem(env, corsHeaders);
      }
      const pathMatch = path.match(/^([^/]+)\/(.+)$/);
      if (pathMatch) {
        const [, category, name] = pathMatch;
        return await getItem(category, decodeURIComponent(name), env, corsHeaders);
      }
      return await listItems(request, env, corsHeaders);
    }
    if (request.method === "POST" && path === "batch") {
      return await batchGetItems(request, env, corsHeaders);
    }
    if (request.method === "POST" && path === "") {
      return await createItem(request, env, corsHeaders);
    }
    if (request.method === "PUT") {
      const idMatch = path.match(/^(\d+)$/);
      if (idMatch) {
        const [, id] = idMatch;
        return await updateItem(id, request, env, corsHeaders);
      }
    }
    if (request.method === "DELETE") {
      const idMatch = path.match(/^(\d+)$/);
      if (idMatch) {
        const [, id] = idMatch;
        return await deleteItem(id, env, corsHeaders);
      }
    }
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Items API error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}
__name(onRequest14, "onRequest14");
async function getCategories(env, corsHeaders) {
  const { results } = await env.DBA.prepare(`
        SELECT category, COUNT(*) as count
        FROM items
        GROUP BY category
        ORDER BY category
    `).all();
  const categories = {};
  if (results) {
    results.forEach((row) => {
      categories[row.category] = row.count;
    });
  }
  return new Response(JSON.stringify({ categories }), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300"
      // Cache for 5 minutes
    }
  });
}
__name(getCategories, "getCategories");
async function getHomepageItems(env, corsHeaders) {
  const [featuredResults, statsResult, randomResult] = await Promise.all([
    // Get all featured items (new, weekly, or weeklystar)
    env.DBA.prepare(`
            SELECT id, name, category, img, svg, price, "from", price_code_rarity,
                   tradable, "new", weekly, weeklystar, retired, premium, removed, typicalgroup, demand,
                   credits, lore, alias, quantity, color, demand_updated_at, updated_at
            FROM items
            WHERE "new" = 1 OR weekly = 1 OR weeklystar = 1
            ORDER BY category, name
        `).all(),
    // Get stats (total items and new items count)
    env.DBA.prepare(`
            SELECT 
                COUNT(*) as totalItems,
                SUM(CASE WHEN "new" = 1 THEN 1 ELSE 0 END) as newItemsCount
            FROM items
        `).first(),
    // Get 1 random item
    env.DBA.prepare(`
            SELECT id, name, category, img, svg, price, "from", price_code_rarity,
                   tradable, "new", weekly, weeklystar, retired, premium, removed, typicalgroup, demand,
                   credits, lore, alias, quantity, color, demand_updated_at, updated_at
            FROM items
            ORDER BY RANDOM()
            LIMIT 1
        `).first()
  ]);
  const featured = featuredResults.results || [];
  const transformItem = /* @__PURE__ */ __name2((item) => ({
    ...item,
    img: normalizeImageUrl(item.img),
    tradable: item.tradable === 1,
    new: item.new === 1,
    weekly: item.weekly === 1,
    weeklystar: item.weeklystar === 1,
    retired: item.retired === 1,
    premium: item.premium === 1,
    removed: item.removed === 1,
    "price/code/rarity": item.price_code_rarity,
    typicalgroup: item.typicalgroup === 1
  }), "transformItem");
  const newItems = featured.filter((item) => item.new === 1).slice(0, 50).map(transformItem);
  const weeklyItems = featured.filter((item) => item.weekly === 1).slice(0, 8).map(transformItem);
  const weeklystarItems = featured.filter((item) => item.weeklystar === 1).slice(0, 8).map(transformItem);
  const randomItem = randomResult ? transformItem(randomResult) : null;
  return new Response(JSON.stringify({
    newItems,
    weeklyItems,
    weeklystarItems,
    randomItem,
    stats: {
      totalItems: statsResult?.totalItems || 0,
      newItemsCount: statsResult?.newItemsCount || 0
    }
  }), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=60"
      // Cache for 1 minute
    }
  });
}
__name(getHomepageItems, "getHomepageItems");
async function getRandomItem(env, corsHeaders) {
  const item = await env.DBA.prepare(`
        SELECT id, name, category, img, svg, price, "from", price_code_rarity,
               tradable, "new", weekly, weeklystar, retired, premium, removed, demand,
               credits, lore, alias, quantity, color, demand_updated_at, updated_at
        FROM items
        ORDER BY RANDOM()
        LIMIT 1
    `).first();
  if (!item) {
    return new Response(JSON.stringify({ error: "No items found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
  const result = {
    ...item,
    img: normalizeImageUrl(item.img),
    tradable: item.tradable === 1,
    new: item.new === 1,
    weekly: item.weekly === 1,
    weeklystar: item.weeklystar === 1,
    retired: item.retired === 1,
    premium: item.premium === 1,
    removed: item.removed === 1,
    "price/code/rarity": item.price_code_rarity,
    typicalgroup: item.typicalgroup === 1
  };
  return new Response(JSON.stringify({ item: result }), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-cache"
      // Don't cache random items
    }
  });
}
__name(getRandomItem, "getRandomItem");
async function searchItems(request, env, corsHeaders) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") || "";
  const category = url.searchParams.get("category") || "";
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
  if (!query || query.length < 1) {
    return new Response(JSON.stringify({ items: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
  let sql = `
        SELECT id, name, category, img, svg, price, "from", price_code_rarity,
               tradable, "new", weekly, weeklystar, retired, premium, removed, demand,
               credits, lore, alias, quantity, color, demand_updated_at, updated_at
        FROM items
        WHERE name LIKE ?
    `;
  const params = [`%${query}%`];
  if (category) {
    sql += ` AND category = ?`;
    params.push(category);
  }
  sql += ` ORDER BY name LIMIT ?`;
  params.push(limit);
  const { results } = await env.DBA.prepare(sql).bind(...params).all();
  const items = (results || []).map((item) => ({
    ...item,
    img: normalizeImageUrl(item.img),
    // Normalize image URL to use R2
    tradable: item.tradable === 1,
    new: item.new === 1,
    weekly: item.weekly === 1,
    weeklystar: item.weeklystar === 1,
    retired: item.retired === 1,
    premium: item.premium === 1,
    removed: item.removed === 1,
    "price/code/rarity": item.price_code_rarity,
    typicalgroup: item.typicalgroup === 1
  }));
  return new Response(JSON.stringify({ items }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
__name(searchItems, "searchItems");
async function batchGetItems(request, env, corsHeaders) {
  let data;
  try {
    data = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
  const { names } = data;
  if (!names || !Array.isArray(names) || names.length === 0) {
    return new Response(JSON.stringify({ items: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
  const limitedNames = names.slice(0, 100);
  const placeholders = limitedNames.map(() => "?").join(", ");
  const sql = `
        SELECT id, name, category, img, svg, price, "from", price_code_rarity,
               tradable, "new", weekly, weeklystar, retired, premium, removed, demand,
               credits, lore, alias, quantity, color, demand_updated_at, updated_at, typicalgroup
        FROM items
        WHERE name IN (${placeholders})
        ORDER BY name
    `;
  const { results } = await env.DBA.prepare(sql).bind(...limitedNames).all();
  const items = (results || []).map((item) => ({
    ...item,
    img: normalizeImageUrl(item.img),
    tradable: item.tradable === 1,
    new: item.new === 1,
    weekly: item.weekly === 1,
    weeklystar: item.weeklystar === 1,
    retired: item.retired === 1,
    premium: item.premium === 1,
    removed: item.removed === 1,
    typicalgroup: item.typicalgroup === 1,
    "price/code/rarity": item.price_code_rarity,
    color: item.color ? JSON.parse(item.color) : null
  }));
  return new Response(JSON.stringify({ items }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
__name(batchGetItems, "batchGetItems");
async function getItem(category, name, env, corsHeaders) {
  const item = await env.DBA.prepare(`
        SELECT id, name, category, img, svg, price, "from", price_code_rarity,
               tradable, "new", weekly, weeklystar, retired, premium, removed, typicalgroup,
               price_history, demand, credits, lore, alias, quantity, color, demand_updated_at, created_at, updated_at
        FROM items
        WHERE category = ? AND name = ?
    `).bind(category, name).first();
  if (!item) {
    return new Response(JSON.stringify({ error: "Item not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
  const result = {
    ...item,
    img: normalizeImageUrl(item.img),
    // Normalize image URL to use R2
    tradable: item.tradable === 1,
    new: item.new === 1,
    weekly: item.weekly === 1,
    weeklystar: item.weeklystar === 1,
    retired: item.retired === 1,
    premium: item.premium === 1,
    removed: item.removed === 1,
    "price/code/rarity": item.price_code_rarity,
    typicalgroup: item.typicalgroup === 1,
    priceHistory: item.price_history ? JSON.parse(item.price_history) : null,
    color: item.color ? JSON.parse(item.color) : null
  };
  return new Response(JSON.stringify({ item: result }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
__name(getItem, "getItem");
async function listItems(request, env, corsHeaders) {
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 2500);
  const offset = Math.max(parseInt(url.searchParams.get("offset") || "0"), 0);
  const category = url.searchParams.get("category") || "";
  const search = url.searchParams.get("search") || "";
  const tradable = url.searchParams.get("tradable");
  const premium = url.searchParams.get("premium");
  const retired = url.searchParams.get("retired");
  const newFilter = url.searchParams.get("new");
  const weekly = url.searchParams.get("weekly");
  const weeklystar = url.searchParams.get("weeklystar");
  const conditions = [];
  const params = [];
  if (category) {
    conditions.push("category = ?");
    params.push(category);
  }
  if (search) {
    conditions.push("name LIKE ?");
    params.push(`%${search}%`);
  }
  if (tradable !== null) {
    conditions.push("tradable = ?");
    params.push(tradable === "true" || tradable === "1" ? 1 : 0);
  }
  if (premium !== null) {
    conditions.push("premium = ?");
    params.push(premium === "true" || premium === "1" ? 1 : 0);
  }
  if (retired !== null) {
    conditions.push("retired = ?");
    params.push(retired === "true" || retired === "1" ? 1 : 0);
  }
  if (newFilter !== null) {
    conditions.push('"new" = ?');
    params.push(newFilter === "true" || newFilter === "1" ? 1 : 0);
  }
  if (weekly !== null) {
    conditions.push("weekly = ?");
    params.push(weekly === "true" || weekly === "1" ? 1 : 0);
  }
  if (weeklystar !== null) {
    conditions.push("weeklystar = ?");
    params.push(weeklystar === "true" || weeklystar === "1" ? 1 : 0);
  }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  let total = null;
  if (offset > 0 || limit < 500) {
    const countResult = await env.DBA.prepare(`
            SELECT COUNT(*) as total
            FROM items
            ${whereClause}
        `).bind(...params).first();
    total = countResult?.total || 0;
  }
  const { results } = await env.DBA.prepare(`
        SELECT id, name, category, img, svg, price, "from", price_code_rarity,
               tradable, "new", weekly, weeklystar, retired, premium, removed, typicalgroup, demand, 
               credits, lore, alias, quantity, color, demand_updated_at, updated_at, price_history,
               target_flikes, created_at
        FROM items
        ${whereClause}
        ORDER BY category, name
        LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all();
  const calculateDisplayedFlikes2 = /* @__PURE__ */ __name2((targetFlikes, createdAt) => {
    if (!targetFlikes || targetFlikes <= 0) return 0;
    const now = Date.now();
    const createdAtMs = createdAt * 1e3;
    const ageDays = (now - createdAtMs) / (1e3 * 60 * 60 * 24);
    const progress = Math.min(ageDays / 30, 1);
    return Math.floor(targetFlikes * progress);
  }, "calculateDisplayedFlikes");
  const items = (results || []).map((item) => ({
    ...item,
    img: normalizeImageUrl(item.img),
    // Normalize image URL to use R2
    tradable: item.tradable === 1,
    new: item.new === 1,
    weekly: item.weekly === 1,
    weeklystar: item.weeklystar === 1,
    retired: item.retired === 1,
    premium: item.premium === 1,
    removed: item.removed === 1,
    "price/code/rarity": item.price_code_rarity,
    typicalgroup: item.typicalgroup === 1,
    priceHistory: item.price_history ? JSON.parse(item.price_history) : null,
    color: item.color ? JSON.parse(item.color) : null,
    // Include calculated flikes for sorting (gradual ramp based on item age)
    flikes: calculateDisplayedFlikes2(item.target_flikes, item.created_at)
  }));
  return new Response(JSON.stringify({
    items,
    total,
    limit,
    offset
  }), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3"
      // Cache for 3 seconds
    }
  });
}
__name(listItems, "listItems");
async function createItem(request, env, corsHeaders) {
  const data = await request.json();
  const {
    name,
    category,
    img,
    svg,
    price,
    from,
    price_code_rarity,
    tradable,
    new: newItem,
    weekly,
    weeklystar,
    retired,
    premium,
    removed,
    price_history,
    demand,
    credits,
    lore,
    alias,
    quantity,
    color
  } = data;
  if (!name || !category) {
    return new Response(JSON.stringify({ error: "Name and category are required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
  const result = await env.DBA.prepare(`
        INSERT INTO items (
            name, category, img, svg, price, "from", price_code_rarity,
            tradable, "new", weekly, weeklystar, retired, premium, removed, typicalgroup,
            price_history, demand, credits, lore, alias, quantity, color, demand_updated_at, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                CASE WHEN ? > 0 THEN strftime('%s', 'now') ELSE NULL END,
                strftime('%s', 'now'), strftime('%s', 'now'))
    `).bind(
    name,
    category,
    img || null,
    svg || null,
    price || null,
    from || null,
    price_code_rarity || null,
    tradable !== false ? 1 : 0,
    newItem === true ? 1 : 0,
    weekly === true ? 1 : 0,
    weeklystar === true ? 1 : 0,
    retired === true ? 1 : 0,
    premium === true ? 1 : 0,
    removed === true ? 1 : 0,
    typicalgroup === true ? 1 : 0,
    price_history ? JSON.stringify(price_history.slice(-15)) : null,
    demand || 0,
    credits || null,
    lore || null,
    alias || null,
    quantity || null,
    color ? JSON.stringify(color) : null,
    demand || 0
    // For demand_updated_at check
  ).run();
  return new Response(JSON.stringify({
    success: true,
    id: result.meta.last_row_id,
    message: "Item created successfully"
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
__name(createItem, "createItem");
async function updateItem(id, request, env, corsHeaders) {
  const data = await request.json();
  const {
    name,
    category,
    img,
    svg,
    price,
    from,
    price_code_rarity,
    tradable,
    new: newItem,
    weekly,
    weeklystar,
    retired,
    premium,
    removed,
    typicalgroup: typicalgroup2,
    price_history,
    demand,
    credits,
    lore,
    alias,
    quantity,
    color,
    updated_at: clientUpdatedAt,
    force_update_demand_timestamp
  } = data;
  if (clientUpdatedAt !== void 0) {
    const currentItem = await env.DBA.prepare(`
            SELECT updated_at FROM items WHERE id = ?
        `).bind(id).first();
    if (!currentItem) {
      return new Response(JSON.stringify({ error: "Item not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    if (currentItem.updated_at !== clientUpdatedAt) {
      const currentItemData = await env.DBA.prepare(`
                SELECT id, name, category, img, svg, price, "from", price_code_rarity,
                       tradable, "new", weekly, weeklystar, retired, premium, removed, typicalgroup,
                       price_history, demand, credits, lore, demand_updated_at, updated_at
                FROM items WHERE id = ?
            `).bind(id).first();
      return new Response(JSON.stringify({
        error: "Conflict: Item was modified by another admin",
        conflict: true,
        currentItem: {
          ...currentItemData,
          tradable: currentItemData.tradable === 1,
          new: currentItemData.new === 1,
          weekly: currentItemData.weekly === 1,
          weeklystar: currentItemData.weeklystar === 1,
          retired: currentItemData.retired === 1,
          premium: currentItemData.premium === 1,
          removed: currentItemData.removed === 1,
          typicalgroup: currentItemData.typicalgroup === 1,
          "price/code/rarity": currentItemData.price_code_rarity,
          priceHistory: currentItemData.price_history ? JSON.parse(currentItemData.price_history) : null
        },
        clientUpdatedAt,
        serverUpdatedAt: currentItem.updated_at
      }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }
  let demandChanged = false;
  if (demand !== void 0) {
    const currentItem = await env.DBA.prepare(`
            SELECT demand FROM items WHERE id = ?
        `).bind(id).first();
    demandChanged = currentItem && currentItem.demand !== demand;
  }
  if (force_update_demand_timestamp === true) {
    demandChanged = true;
  }
  let mergedPriceHistory = null;
  if (price_history !== void 0) {
    const currentItem = await env.DBA.prepare(`
            SELECT price_history FROM items WHERE id = ?
        `).bind(id).first();
    let existingHistory = [];
    if (currentItem && currentItem.price_history) {
      try {
        existingHistory = JSON.parse(currentItem.price_history);
        if (!Array.isArray(existingHistory)) {
          existingHistory = [];
        }
      } catch (e) {
        existingHistory = [];
      }
    }
    let incomingHistory = Array.isArray(price_history) ? price_history : [];
    const combinedHistory = [...existingHistory];
    incomingHistory.forEach((newEntry) => {
      const exists = combinedHistory.some(
        (existing) => existing.price === newEntry.price && existing.timestamp === newEntry.timestamp
      );
      if (!exists) {
        combinedHistory.push(newEntry);
      }
    });
    combinedHistory.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    mergedPriceHistory = combinedHistory.slice(-15);
  }
  const result = await env.DBA.prepare(`
        UPDATE items SET
            name = COALESCE(?, name),
            category = COALESCE(?, category),
            img = ?,
            svg = ?,
            price = ?,
            "from" = ?,
            price_code_rarity = ?,
            tradable = COALESCE(?, tradable),
            "new" = COALESCE(?, "new"),
            weekly = COALESCE(?, weekly),
            weeklystar = COALESCE(?, weeklystar),
            retired = COALESCE(?, retired),
            premium = COALESCE(?, premium),
            removed = COALESCE(?, removed),
            typicalgroup = COALESCE(?, typicalgroup),
            price_history = CASE WHEN ? IS NOT NULL THEN ? ELSE price_history END,
            demand = COALESCE(?, demand),
            credits = ?,
            lore = ?,
            alias = ?,
            quantity = ?,
            color = ?,
            demand_updated_at = CASE WHEN ? = 1 THEN strftime('%s', 'now') ELSE demand_updated_at END,
            updated_at = strftime('%s', 'now')
        WHERE id = ?
    `).bind(
    name,
    category,
    img,
    svg,
    price,
    from,
    price_code_rarity,
    tradable !== void 0 ? tradable ? 1 : 0 : null,
    newItem !== void 0 ? newItem ? 1 : 0 : null,
    weekly !== void 0 ? weekly ? 1 : 0 : null,
    weeklystar !== void 0 ? weeklystar ? 1 : 0 : null,
    retired !== void 0 ? retired ? 1 : 0 : null,
    premium !== void 0 ? premium ? 1 : 0 : null,
    removed !== void 0 ? removed ? 1 : 0 : null,
    typicalgroup2 !== void 0 ? typicalgroup2 ? 1 : 0 : null,
    mergedPriceHistory ? JSON.stringify(mergedPriceHistory) : null,
    mergedPriceHistory ? JSON.stringify(mergedPriceHistory) : null,
    demand,
    credits !== void 0 ? credits : null,
    lore !== void 0 ? lore : null,
    alias !== void 0 ? alias : null,
    quantity !== void 0 ? quantity : null,
    color !== void 0 ? color ? JSON.stringify(color) : null : null,
    demandChanged ? 1 : 0,
    // Update demand_updated_at if demand changed
    id
  ).run();
  if (result.meta.changes === 0) {
    return new Response(JSON.stringify({ error: "Item not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
  return new Response(JSON.stringify({
    success: true,
    message: "Item updated successfully"
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
__name(updateItem, "updateItem");
async function deleteItem(id, env, corsHeaders) {
  const result = await env.DBA.prepare(`
        DELETE FROM items WHERE id = ?
    `).bind(id).run();
  if (result.meta.changes === 0) {
    return new Response(JSON.stringify({ error: "Item not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
  return new Response(JSON.stringify({
    success: true,
    message: "Item deleted successfully"
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
__name(deleteItem, "deleteItem");
var init_path12 = __esm({
  "api/items/[[path]].js"() {
    init_functionsRoutes_0_10531370690170583();
    __name2(normalizeImageUrl, "normalizeImageUrl");
    __name2(onRequest14, "onRequest");
    __name2(getCategories, "getCategories");
    __name2(getHomepageItems, "getHomepageItems");
    __name2(getRandomItem, "getRandomItem");
    __name2(searchItems, "searchItems");
    __name2(batchGetItems, "batchGetItems");
    __name2(getItem, "getItem");
    __name2(listItems, "listItems");
    __name2(createItem, "createItem");
    __name2(updateItem, "updateItem");
    __name2(deleteItem, "deleteItem");
  }
});
async function handleGetProfile(request, env) {
  const url = new URL(request.url);
  const pathParts = url.pathname.split("/api/profile/").filter(Boolean);
  let userId = pathParts[0];
  if (!userId) {
    return new Response(JSON.stringify({ error: "User ID required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
  const userIdWithSuffix = userId.includes(".") ? userId : `${userId}.0`;
  const user = await env.DBA.prepare(`
        SELECT
            user_id,
            username,
            display_name,
            avatar_url,
            role,
            created_at,
            last_online
        FROM users
        WHERE user_id = ? OR user_id = ?
    `).bind(userId, userIdWithSuffix).first();
  if (!user) {
    return new Response(JSON.stringify({ error: "User not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    });
  }
  const actualUserId = user.user_id;
  let stats = null;
  try {
    stats = await env.DBA.prepare(`
            SELECT
                total_trades,
                successful_trades,
                average_rating,
                total_reviews,
                last_trade_at
            FROM user_trade_stats
            WHERE user_id = ?
        `).bind(actualUserId).first();
  } catch (e) {
    console.error("Failed to fetch user_trade_stats (table might not exist):", e);
    stats = null;
  }
  let reviews = [];
  try {
    const reviewsResult = await env.DBA.prepare(`
            SELECT
                r.*,
                u.username as reviewer_username,
                u.display_name as reviewer_display_name,
                u.avatar_url as reviewer_avatar
            FROM trade_reviews r
            JOIN users u ON r.reviewer_id = u.user_id
            WHERE r.reviewed_user_id = ?
            ORDER BY r.created_at DESC
            LIMIT 10
        `).bind(actualUserId).all();
    reviews = reviewsResult.results || [];
  } catch (e) {
    console.error("Failed to fetch trade_reviews (table might not exist):", e);
    reviews = [];
  }
  let recentTrades = [];
  try {
    const tradesResult = await env.DBA.prepare(`
            SELECT
                ct.id,
                ct.item_name,
                ct.completed_at,
                CASE
                    WHEN ct.seller_id = ? THEN 'seller'
                    ELSE 'buyer'
                END as role
            FROM completed_trades ct
            WHERE ct.seller_id = ? OR ct.buyer_id = ?
            ORDER BY ct.completed_at DESC
            LIMIT 5
        `).bind(actualUserId, actualUserId, actualUserId).all();
    recentTrades = tradesResult.results || [];
  } catch (e) {
    console.error("Failed to fetch completed_trades (table might not exist):", e);
    recentTrades = [];
  }
  let roles;
  try {
    roles = user.role ? JSON.parse(user.role) : ["user"];
  } catch (e) {
    roles = ["user"];
  }
  let donationData = null;
  try {
    if (env.DONATIONS_KV) {
      const donationKey = `purchase:${userId}`;
      const donationKV = await env.DONATIONS_KV.get(donationKey);
      if (donationKV) {
        const data = JSON.parse(donationKV);
        donationData = {
          totalSpent: data.totalSpent || 0,
          purchases: data.purchases || 0
        };
      }
    }
  } catch (e) {
    console.error("Failed to fetch donation data:", e);
  }
  let galleryPosts = [];
  try {
    const postsResult = await env.DBA.prepare(`
            SELECT
                g.id,
                g.title,
                g.description,
                g.media_url,
                g.thumbnail_url,
                g.created_at,
                g.views,
                g.likes
            FROM gallery_items g
            WHERE g.user_id = ? AND g.status = 1
            ORDER BY g.created_at DESC
            LIMIT 12
        `).bind(actualUserId).all();
    const getMediaType2 = /* @__PURE__ */ __name2((url2) => {
      if (!url2) return "image";
      const ext = url2.split(".").pop().toLowerCase();
      const videoExts = ["mp4", "webm", "mov"];
      return videoExts.includes(ext) ? "video" : "image";
    }, "getMediaType");
    galleryPosts = (postsResult.results || []).map((item) => {
      const likes = JSON.parse(item.likes || "[]");
      let viewCount = item.views || 0;
      return {
        ...item,
        media_type: getMediaType2(item.media_url),
        views: viewCount,
        likes_count: likes.length
      };
    });
  } catch (e) {
    console.error("Failed to fetch gallery posts:", e);
    galleryPosts = [];
  }
  let wishlist = [];
  try {
    const wishlistPref = await env.DBA.prepare(`
            SELECT preference_value
            FROM user_preferences
            WHERE user_id = ? AND preference_key = 'wishlist'
        `).bind(actualUserId).first();
    if (wishlistPref && wishlistPref.preference_value) {
      wishlist = JSON.parse(wishlistPref.preference_value);
      if (!Array.isArray(wishlist)) {
        wishlist = [];
      }
    }
  } catch (e) {
    console.error("Failed to fetch wishlist:", e);
    wishlist = [];
  }
  return new Response(JSON.stringify({
    user: {
      userId: user.user_id,
      username: user.username,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      roles,
      createdAt: user.created_at,
      lastOnline: user.last_online
    },
    stats: stats || {
      total_trades: 0,
      successful_trades: 0,
      average_rating: 0,
      total_reviews: 0,
      last_trade_at: null
    },
    reviews,
    recentTrades,
    donationData,
    galleryPosts,
    wishlist
  }), {
    headers: { "Content-Type": "application/json" }
  });
}
__name(handleGetProfile, "handleGetProfile");
async function handlePostReview(request, env) {
  const url = new URL(request.url);
  const pathParts = url.pathname.split("/api/profile/").filter(Boolean);
  const pathSegments = pathParts[0].split("/");
  const userId = pathSegments[0];
  if (!userId) {
    return new Response(JSON.stringify({ error: "User ID required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }
  const token = authHeader.substring(7);
  const session = await env.DBA.prepare(`
        SELECT s.*, u.* FROM sessions s
        JOIN users u ON s.user_id = u.user_id
        WHERE s.token = ? AND s.expires_at > ?
    `).bind(token, Date.now()).first();
  if (!session) {
    return new Response(JSON.stringify({ error: "Invalid or expired session" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }
  const reviewer = {
    user_id: session.user_id,
    username: session.username,
    display_name: session.display_name,
    avatar_url: session.avatar_url,
    role: session.role
  };
  if (!reviewer) {
    return new Response(JSON.stringify({ error: "User not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    });
  }
  let roles;
  try {
    roles = reviewer.role ? JSON.parse(reviewer.role) : ["user"];
  } catch (e) {
    roles = ["user"];
  }
  if (roles.includes("scammer")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 403,
      headers: { "Content-Type": "application/json" }
    });
  }
  const data = await request.json();
  const { rating, comment } = data;
  if (!rating || rating < 1 || rating > 5) {
    return new Response(JSON.stringify({ error: "Rating must be between 1 and 5" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
  if (reviewer.user_id === userId) {
    return new Response(JSON.stringify({ error: "You cannot review yourself" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
  const reviewedUser = await env.DBA.prepare(
    "SELECT user_id FROM users WHERE user_id = ?"
  ).bind(userId).first();
  if (!reviewedUser) {
    return new Response(JSON.stringify({ error: "User not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    });
  }
  const existingReview = await env.DBA.prepare(
    "SELECT id FROM trade_reviews WHERE reviewer_id = ? AND reviewed_user_id = ? AND trade_id IS NULL"
  ).bind(reviewer.user_id, userId).first();
  if (existingReview) {
    return new Response(JSON.stringify({ error: "You have already reviewed this user" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
  const now = Date.now();
  const result = await env.DBA.prepare(
    `INSERT INTO trade_reviews
        (trade_id, reviewer_id, reviewed_user_id, rating, comment, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(
    null,
    // No trade_id for profile reviews
    reviewer.user_id,
    userId,
    rating,
    comment || null,
    now
  ).run();
  const { updateUserStats: updateUserStats2 } = await Promise.resolve().then(() => (init_helpers(), helpers_exports));
  await updateUserStats2(env, userId);
  const ratingText = rating === 5 ? "excellent" : rating === 4 ? "good" : rating === 3 ? "okay" : rating === 2 ? "poor" : "bad";
  await env.DBA.prepare(
    "INSERT INTO trade_notifications (user_id, type, title, message, link, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(
    userId,
    "review_received",
    "New Review",
    `${reviewer.username} gave you a ${ratingText} review (${rating}/5 stars)`,
    `/profile/${userId}`,
    now
  ).run();
  return new Response(JSON.stringify({
    id: result.meta.last_row_id,
    message: "Review submitted successfully"
  }), {
    status: 201,
    headers: { "Content-Type": "application/json" }
  });
}
__name(handlePostReview, "handlePostReview");
async function onRequest15(context) {
  const { request, env } = context;
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    let response;
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/api/profile/").filter(Boolean);
    const pathSegments = pathParts[0] ? pathParts[0].split("/") : [];
    if (request.method === "GET") {
      response = await handleGetProfile(request, env);
    } else if (request.method === "POST" && pathSegments[1] === "review") {
      response = await handlePostReview(request, env);
    } else {
      response = new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" }
      });
    }
    Object.entries(corsHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    return response;
  } catch (error) {
    console.error("Profile API error:", error);
    console.error("Error stack:", error.stack);
    console.error("Request URL:", request.url);
    return new Response(JSON.stringify({
      error: "Internal server error",
      details: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}
__name(onRequest15, "onRequest15");
var init_path13 = __esm({
  "api/profile/[[path]].js"() {
    init_functionsRoutes_0_10531370690170583();
    __name2(handleGetProfile, "handleGetProfile");
    __name2(handlePostReview, "handlePostReview");
    __name2(onRequest15, "onRequest");
  }
});
var onRequestPost3;
var init_admin_login = __esm({
  "api/admin-login.js"() {
    init_functionsRoutes_0_10531370690170583();
    init_auth();
    onRequestPost3 = /* @__PURE__ */ __name2(async ({ request, env }) => {
      try {
        let key;
        try {
          const data = await request.json();
          key = data.key?.trim();
          if (!key) throw new Error("No key provided");
        } catch {
          return new Response(JSON.stringify({ error: "Invalid request body" }), { status: 400 });
        }
        const row = await env.DBH.prepare("SELECT name FROM admins WHERE key_hash = ?").bind(key).first().catch(() => null);
        if (!row) {
          return new Response(JSON.stringify({ error: "Invalid key" }), { status: 401 });
        }
        if (!env.SECRET_KEY) throw new Error("Missing SECRET_KEY in environment");
        const token = await createSession(row.name, env.SECRET_KEY);
        return new Response(JSON.stringify({ ok: true, name: row.name }), {
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": `session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`
          }
        });
      } catch (err) {
        console.error("admin-login error:", err);
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
      }
    }, "onRequestPost");
  }
});
var onRequestGet2;
var init_check_session = __esm({
  "api/check-session.js"() {
    init_functionsRoutes_0_10531370690170583();
    init_auth();
    onRequestGet2 = /* @__PURE__ */ __name2(async ({ request, env }) => {
      try {
        const cookieHeader = request.headers.get("Cookie") || "";
        const session = cookieHeader.split("; ").find((c) => c.startsWith("session="))?.split("=")[1];
        if (!session) {
          return new Response(JSON.stringify({ ok: false }), { status: 401 });
        }
        const payload = await verifySession(session, env.SECRET_KEY);
        if (!payload) {
          return new Response(JSON.stringify({ ok: false }), { status: 401 });
        }
        return new Response(JSON.stringify({ ok: true, name: payload.name }), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      } catch (err) {
        console.error("check-session error:", err);
        return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 500 });
      }
    }, "onRequestGet");
  }
});
async function onRequestGet3(context) {
  const DBH = context.env.DBH;
  try {
    const row = await DBH.prepare(`
      SELECT username, timestamp, version
      FROM history
      ORDER BY timestamp DESC
      LIMIT 1
    `).first();
    if (!row) {
      return new Response(`0|`, {
        status: 200,
        headers: {
          "Content-Type": "text/plain",
          "Cache-Control": "no-cache",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }
    return new Response(`${row.username}"@"${row.timestamp}|${row.version}`, {
      headers: {
        "Content-Type": "text/plain",
        "Cache-Control": "no-cache",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (err) {
    return new Response(`Error: ${err.message}`, { status: 500 });
  }
}
__name(onRequestGet3, "onRequestGet3");
var init_latest_version = __esm({
  "api/latest-version.js"() {
    init_functionsRoutes_0_10531370690170583();
    __name2(onRequestGet3, "onRequestGet");
  }
});
async function onRequestPost4() {
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": "session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
__name(onRequestPost4, "onRequestPost4");
var init_logout = __esm({
  "api/logout.js"() {
    init_functionsRoutes_0_10531370690170583();
    __name2(onRequestPost4, "onRequestPost");
  }
});
async function fetchRobloxProfile(userId, env, writeToScammerCache = true) {
  if (!userId || !/^\d+$/.test(userId)) {
    return null;
  }
  const now = Date.now();
  let cached = null;
  if (writeToScammerCache) {
    cached = await env.DB.prepare(
      "SELECT roblox_name, roblox_display_name, roblox_avatar FROM scammer_profile_cache WHERE user_id = ?"
    ).bind(userId).first();
    if (cached && cached.roblox_name && cached.roblox_display_name && cached.roblox_avatar) {
      return {
        name: cached.roblox_name,
        displayName: cached.roblox_display_name,
        avatar: cached.roblox_avatar
      };
    }
  }
  let fetchSuccess = false;
  let data = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const [userData, avatarData] = await Promise.all([
        fetch(`https://users.roblox.com/v1/users/${userId}`).then((r) => r.ok ? r.json() : null),
        fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=true`).then((r) => r.ok ? r.json() : null)
      ]);
      if (userData) {
        data = {
          name: userData.name,
          displayName: userData.displayName,
          avatar: avatarData?.data?.[0]?.imageUrl || null
        };
        fetchSuccess = true;
        break;
      }
    } catch (err) {
      console.warn(`Roblox fetch attempt ${attempt + 1} failed:`, err);
    }
    if (!fetchSuccess) {
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  if (!fetchSuccess || !data) {
    return null;
  }
  if (writeToScammerCache) {
    await env.DB.prepare(`
      INSERT INTO scammer_profile_cache (user_id, roblox_name, roblox_display_name, roblox_avatar)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        roblox_name = excluded.roblox_name,
        roblox_display_name = excluded.roblox_display_name,
        roblox_avatar = excluded.roblox_avatar
    `).bind(userId, data.name || null, data.displayName || null, data.avatar || null).run();
  }
  return data;
}
__name(fetchRobloxProfile, "fetchRobloxProfile");
async function fetchDiscordProfile(discordId, env, userId = null, writeToScammerCache = true) {
  if (!discordId || !/^\d+$/.test(discordId)) {
    return null;
  }
  const now = Date.now();
  let cached = null;
  if (writeToScammerCache) {
    if (userId) {
      cached = await env.DB.prepare(
        "SELECT discord_display_name FROM scammer_profile_cache WHERE user_id = ?"
      ).bind(userId).first();
    }
    if (!cached) {
      cached = await env.DB.prepare(
        "SELECT discord_display_name FROM scammer_profile_cache WHERE discord_id = ? LIMIT 1"
      ).bind(discordId).first();
    }
    if (cached && cached.discord_display_name) {
      return {
        displayName: cached.discord_display_name
      };
    }
  }
  let fetchSuccess = false;
  let data = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await fetch(`https://discord.com/api/v10/users/${discordId}`, {
        headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }
      });
      if (response.status === 429) {
        const retryAfter = await response.json();
        await new Promise((r) => setTimeout(r, (retryAfter.retry_after || 1) * 1e3));
        continue;
      }
      if (response.status === 404) {
        data = { displayName: null };
        fetchSuccess = true;
        break;
      }
      if (response.ok) {
        const userData = await response.json();
        const displayName = userData.global_name || userData.username || null;
        data = { displayName };
        fetchSuccess = true;
        break;
      }
    } catch (err) {
      console.warn(`Discord fetch attempt ${attempt + 1} failed:`, err);
    }
    if (!fetchSuccess) {
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  if (!fetchSuccess || !data) {
    return null;
  }
  if (writeToScammerCache) {
    if (userId) {
      await env.DB.prepare(`
        UPDATE scammer_profile_cache
        SET discord_id = ?, discord_display_name = ?
        WHERE user_id = ?
      `).bind(discordId, data.displayName, userId).run();
    } else {
      await env.DB.prepare(`
        UPDATE scammer_profile_cache
        SET discord_display_name = ?
        WHERE discord_id = ?
      `).bind(data.displayName, discordId).run();
    }
  }
  return data;
}
__name(fetchDiscordProfile, "fetchDiscordProfile");
async function logJobActivity(env, jobId, step, messageId = null, details = null) {
  const now = Date.now();
  try {
    const job = await env.DB.prepare(`
      SELECT logs FROM scammer_job_status WHERE job_id = ?
    `).bind(jobId).first();
    const logs = job?.logs ? JSON.parse(job.logs) : [];
    logs.push({
      timestamp: now,
      step,
      messageId,
      details
    });
    if (logs.length > 100) {
      logs.shift();
    }
    await env.DB.prepare(`
      UPDATE scammer_job_status 
      SET last_activity_at = ?, current_message_id = ?, current_step = ?, logs = ?
      WHERE job_id = ?
    `).bind(now, messageId, step, JSON.stringify(logs), jobId).run();
  } catch (err) {
    console.error(`Failed to log job activity:`, err);
  }
}
__name(logJobActivity, "logJobActivity");
async function enqueueScammerMessages(env, jobId) {
  const channelId = env.DISCORD_CHANNEL_ID;
  try {
    await logJobActivity(env, jobId, "starting", null, "Job started - fetching threads first");
    if (!env.DISCORD_BOT_TOKEN) {
      throw new Error("DISCORD_BOT_TOKEN not set");
    }
    if (!channelId) {
      throw new Error("DISCORD_CHANNEL_ID not set");
    }
    if (!env.SCAMMER_QUEUE) {
      throw new Error("SCAMMER_QUEUE binding not configured");
    }
    await logJobActivity(env, jobId, "fetching_threads", null, "Fetching all threads from channel");
    const allThreads = [];
    const activeRes = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/threads/active`,
      { headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } }
    );
    if (activeRes.ok) {
      const activeData = await activeRes.json();
      if (activeData.threads) allThreads.push(...activeData.threads);
    }
    await delay(500);
    let hasMore = true;
    let beforeTimestamp = null;
    while (hasMore) {
      const url = new URL(`https://discord.com/api/v10/channels/${channelId}/threads/archived/public`);
      if (beforeTimestamp) url.searchParams.set("before", beforeTimestamp);
      url.searchParams.set("limit", "100");
      const archivedRes = await fetch(url.toString(), {
        headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }
      });
      if (!archivedRes.ok) break;
      const archivedData = await archivedRes.json();
      if (archivedData.threads?.length) {
        allThreads.push(...archivedData.threads);
        const oldestThread = archivedData.threads[archivedData.threads.length - 1];
        beforeTimestamp = oldestThread.thread_metadata?.archive_timestamp;
      }
      hasMore = archivedData.has_more === true;
      await delay(500);
    }
    const knownThreadIds = new Set(allThreads.map((t) => t.id));
    await logJobActivity(env, jobId, "threads_indexed", null, `Indexed ${knownThreadIds.size} thread IDs`);
    await logJobActivity(env, jobId, "fetching_messages", null, "Fetching channel messages");
    let allMessages = [];
    let lastId = null;
    while (true) {
      const url = new URL(`https://discord.com/api/v10/channels/${channelId}/messages`);
      url.searchParams.set("limit", "100");
      if (lastId) url.searchParams.set("before", lastId);
      const response = await fetch(url.toString(), {
        headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }
      });
      if (response.status === 429) {
        const retryAfter = await response.json();
        await delay((retryAfter.retry_after || 1) * 1e3);
        continue;
      }
      if (!response.ok) {
        throw new Error(`Discord API error: ${response.status}`);
      }
      const messages = await response.json();
      if (messages.length === 0) break;
      allMessages.push(...messages);
      lastId = messages[messages.length - 1].id;
      await delay(500);
    }
    await logJobActivity(
      env,
      jobId,
      "messages_fetched",
      null,
      `Fetched ${allMessages.length} channel messages`
    );
    const messagesWithThread = allMessages.filter(
      (msg) => msg.thread?.id || knownThreadIds.has(msg.id)
    );
    await logJobActivity(
      env,
      jobId,
      "threads_identified",
      null,
      `${messagesWithThread.length} messages have threads (will be fetched by queue consumer)`
    );
    await env.DB.prepare(`
      UPDATE scammer_job_status 
      SET total_messages = ?, last_activity_at = ?
      WHERE job_id = ?
    `).bind(allMessages.length, Date.now(), jobId).run();
    const now = Date.now();
    const insertStmt = env.DB.prepare(`
      INSERT INTO scammer_job_messages (job_id, message_id, status, enqueued_at)
      VALUES (?, ?, ?, ?)
    `);
    for (let i = 0; i < allMessages.length; i += 100) {
      const chunk = allMessages.slice(i, i + 100);
      const statements = chunk.map(
        (msg) => insertStmt.bind(jobId, msg.id, "queued", now)
      );
      await env.DB.batch(statements);
    }
    await logJobActivity(
      env,
      jobId,
      "messages_tracked",
      null,
      `Tracked ${allMessages.length} messages`
    );
    const queueMessages = allMessages.map((msg) => {
      const threadId = msg.thread?.id || (knownThreadIds.has(msg.id) ? msg.id : null);
      return {
        body: {
          jobId,
          messageId: msg.id,
          channelId,
          message: msg,
          threadId
          // Just the ID - consumer will fetch evidence
        }
      };
    });
    for (let i = 0; i < queueMessages.length; i += 100) {
      const batch = queueMessages.slice(i, i + 100);
      await env.SCAMMER_QUEUE.sendBatch(batch);
    }
    const withThreads = queueMessages.filter((m) => m.body.threadId).length;
    await logJobActivity(
      env,
      jobId,
      "queued",
      null,
      `Queued ${allMessages.length} messages (${withThreads} have threads - evidence will be fetched by consumer)`
    );
    return {
      queued: allMessages.length,
      total: allMessages.length,
      threads: allThreads.length,
      withThreads,
      message: `Added ${allMessages.length} messages to queue. ${withThreads} have pre-fetched thread evidence.`
    };
  } catch (err) {
    await logJobActivity(env, jobId, "failed", null, `Failed: ${err.message}`);
    await env.DB.prepare(`
      UPDATE scammer_job_status 
      SET status = 'failed', error = ?, last_activity_at = ?
      WHERE job_id = ?
    `).bind(err.message, Date.now(), jobId).run();
    throw err;
  }
}
__name(enqueueScammerMessages, "enqueueScammerMessages");
async function onRequestGet4(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode");
  const userId = url.searchParams.get("userId");
  const isLiteMode = url.searchParams.get("mode") === "lite";
  const discordId = url.searchParams.get("discordId");
  const forceRefresh = url.searchParams.get("refresh") === "true";
  function getCdnUrl(hash) {
    let i = 31;
    for (let t = 0; t < 38; t++) {
      i ^= hash.charCodeAt(t);
    }
    return `https://t${(i % 8).toString()}.rbxcdn.com/${hash}`;
  }
  __name(getCdnUrl, "getCdnUrl");
  __name2(getCdnUrl, "getCdnUrl");
  if (mode === "discord-media") {
    const mediaUrl = url.searchParams.get("url");
    if (!mediaUrl) {
      return new Response(JSON.stringify({ error: "Media URL required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }
    if (!mediaUrl.startsWith("https://cdn.discordapp.com/") && !mediaUrl.startsWith("https://media.discordapp.net/")) {
      return new Response(JSON.stringify({ error: "Invalid Discord media URL" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }
    try {
      const mediaResponse = await fetch(mediaUrl, {
        headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }
      });
      if (!mediaResponse.ok) {
        return new Response(JSON.stringify({
          error: "Media not found",
          status: mediaResponse.status
        }), {
          status: mediaResponse.status,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }
      const contentType = mediaResponse.headers.get("content-type") || "application/octet-stream";
      const contentLength = mediaResponse.headers.get("content-length");
      const headers = {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=86400",
        // Cache for 24 hours
        "Accept-Ranges": "bytes"
        // Support range requests for video seeking
      };
      if (contentLength) {
        headers["Content-Length"] = contentLength;
      }
      return new Response(mediaResponse.body, { headers });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }
  }
  if (mode === "cdn-asset") {
    const hash = url.searchParams.get("hash");
    if (!hash) {
      return new Response(JSON.stringify({ error: "Hash required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }
    try {
      const cdnUrl = getCdnUrl(hash);
      console.log("Fetching CDN URL:", cdnUrl);
      const assetResponse = await fetch(cdnUrl);
      if (!assetResponse.ok) {
        console.error("CDN fetch failed:", assetResponse.status, cdnUrl);
        return new Response(JSON.stringify({
          error: "Asset not found",
          cdnUrl,
          status: assetResponse.status
        }), {
          status: 404,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }
      const contentType = assetResponse.headers.get("content-type") || "application/octet-stream";
      const assetData = await assetResponse.arrayBuffer();
      return new Response(assetData, {
        headers: {
          "Content-Type": contentType,
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=86400"
          // Cache for 24 hours
        }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }
  }
  if (mode === "badge") {
    const badgeId = url.searchParams.get("badgeId");
    if (!badgeId || !/^\d{9,}$/.test(badgeId)) {
      return new Response(JSON.stringify({ error: "Valid 9+ digit badge ID required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }
    try {
      const badgeResponse = await fetch(`https://badges.roblox.com/v1/badges/${badgeId}`);
      if (!badgeResponse.ok) {
        return new Response(JSON.stringify({ error: "Badge not found", status: badgeResponse.status }), {
          status: badgeResponse.status,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }
      const badgeData = await badgeResponse.json();
      return new Response(JSON.stringify(badgeData), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=3600"
          // Cache for 1 hour
        }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }
  }
  if (mode === "avatar-3d" && userId) {
    try {
      const avatar3dResponse = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-3d?userId=${userId}`);
      const avatar3dData = await avatar3dResponse.json();
      if (avatar3dData.state !== "Completed" || !avatar3dData.imageUrl) {
        return new Response(JSON.stringify({
          error: "Avatar not ready",
          state: avatar3dData.state
        }), {
          status: 404,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }
      const metadataResponse = await fetch(avatar3dData.imageUrl);
      const metadata = await metadataResponse.json();
      return new Response(JSON.stringify(metadata), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }
  }
  if (isLiteMode) {
    const [userData, avatarData] = await Promise.all([
      fetch(`https://users.roblox.com/v1/users/${userId}`).then((r) => r.ok ? r.json() : null),
      fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=true`).then((r) => r.ok ? r.json() : null)
    ]);
    if (!userData) throw new Error("Failed to fetch Roblox user data");
    return new Response(JSON.stringify({
      name: userData.name,
      displayName: userData.displayName,
      avatar: avatarData?.data?.[0]?.imageUrl || null
    }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
  }
  if (mode === "migrate-videos-to-stream" || mode === "migrate-videos-to-r2" || mode === "update-thread-evidence" || mode === "migrate-images-to-r2") {
    return new Response(JSON.stringify({
      error: "Deprecated. Use the queue-based system.",
      redirect: "/api/roblox-proxy?mode=discord-scammers&action=start"
    }), {
      status: 410,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
  if (mode === "thread-evidence" && userId) {
    try {
      const result = await env.DB.prepare(
        "SELECT thread_evidence FROM scammer_profile_cache WHERE user_id = ?"
      ).bind(userId).first();
      if (!result) {
        return new Response(JSON.stringify({
          error: "No thread evidence found for this user",
          thread_evidence: null,
          user_id: userId,
          debug: "User not found in database"
        }), {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }
      if (!result.thread_evidence) {
        return new Response(JSON.stringify({
          error: "No thread evidence found for this user",
          thread_evidence: null,
          user_id: userId,
          debug: "User found but thread_evidence is null"
        }), {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }
      const threadEvidence = JSON.parse(result.thread_evidence);
      return new Response(JSON.stringify({
        user_id: userId,
        thread_evidence: threadEvidence
      }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    } catch (err) {
      console.error("Thread evidence fetch error:", err);
      return new Response(JSON.stringify({
        error: err.message,
        user_id: userId,
        debug: err.stack
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }
  }
  if (url.pathname.endsWith("/api/roblox-proxy") && userId && mode !== "thread-evidence") {
    try {
      const robloxData = await fetchRobloxProfile(userId, env, false);
      if (!robloxData) {
        throw new Error("Failed to fetch Roblox user data");
      }
      let discordData = null;
      if (discordId) {
        discordData = await fetchDiscordProfile(discordId, env, null, false);
      }
      return new Response(JSON.stringify({
        name: robloxData.name,
        displayName: robloxData.displayName,
        avatar: robloxData.avatar || null,
        discordDisplayName: discordData?.displayName || null,
        discordAvatar: discordData?.avatar || null
      }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }
  if (mode === "discord-scammers") {
    try {
      const urlParams = new URL(request.url).searchParams;
      const action = urlParams.get("action");
      const jobId = urlParams.get("jobId");
      if (action === "start") {
        const runningJob = await env.DB.prepare(`
          SELECT job_id, started_at, messages_processed, total_messages
          FROM scammer_job_status
          WHERE status = 'running'
          ORDER BY started_at DESC
          LIMIT 1
        `).first();
        if (runningJob) {
          const runningTime = Date.now() - runningJob.started_at;
          const tenMinutes = 10 * 60 * 1e3;
          if (runningTime > tenMinutes) {
            await env.DB.prepare(`
              UPDATE scammer_job_status 
              SET status = 'failed', error = 'Cancelled - stuck for too long'
              WHERE job_id = ?
            `).bind(runningJob.job_id).run();
          } else {
            return new Response(JSON.stringify({
              error: "A job is already running",
              runningJob: {
                jobId: runningJob.job_id,
                startedAt: runningJob.started_at,
                messagesProcessed: runningJob.messages_processed,
                totalMessages: runningJob.total_messages,
                runningTimeMinutes: Math.round(runningTime / 1e3 / 60)
              },
              message: "Use ?action=status&jobId=" + runningJob.job_id + " to check progress, or ?action=cancel&jobId=" + runningJob.job_id + " to cancel it."
            }), {
              status: 409,
              // Conflict
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
              }
            });
          }
        }
        const tenMinutesAgo = Date.now() - 10 * 60 * 1e3;
        await env.DB.prepare(`
          UPDATE scammer_job_status 
          SET status = 'failed', error = 'Cancelled - stuck for too long'
          WHERE status = 'running' AND started_at < ?
        `).bind(tenMinutesAgo).run();
        const newJobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const now = Date.now();
        await env.DB.prepare(`
          INSERT INTO scammer_job_status (job_id, status, started_at, messages_processed, messages_seen, total_messages)
          VALUES (?, 'running', ?, 0, 0, 0)
        `).bind(newJobId, now).run();
        const queueResult = await enqueueScammerMessages(env, newJobId);
        return new Response(JSON.stringify({
          jobId: newJobId,
          status: "queued",
          queued: queueResult.queued,
          total: queueResult.total,
          message: `Added ${queueResult.queued} messages to queue. They will be processed automatically. Use ?action=status&jobId=${newJobId} to check progress.`
        }), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }
      if (action === "status") {
        if (jobId) {
          const jobStatus = await env.DB.prepare(`
            SELECT job_id, status, messages_processed, total_messages, started_at, completed_at, 
                   last_activity_at, current_message_id, current_step, error, logs
            FROM scammer_job_status
            WHERE job_id = ?
          `).bind(jobId).first();
          if (!jobStatus) {
            return new Response(JSON.stringify({ error: "Job not found" }), {
              status: 404,
              headers: { "Content-Type": "application/json" }
            });
          }
          if (jobStatus.logs) {
            try {
              jobStatus.logs = JSON.parse(jobStatus.logs);
            } catch (e) {
              jobStatus.logs = [];
            }
          } else {
            jobStatus.logs = [];
          }
          const messagesSkipped = (jobStatus.total_messages || 0) - (jobStatus.messages_processed || 0);
          jobStatus.summary = {
            total_messages: jobStatus.total_messages || 0,
            messages_processed: jobStatus.messages_processed || 0,
            messages_skipped: messagesSkipped,
            note: messagesSkipped > 0 ? `${messagesSkipped} messages were skipped (no Roblox profile URL found). This is normal - not all Discord messages contain scammer reports.` : "All messages processed successfully."
          };
          if (jobStatus.status === "running") {
            const now = Date.now();
            const runningTime = now - jobStatus.started_at;
            const timeSinceLastActivity = jobStatus.last_activity_at ? now - jobStatus.last_activity_at : runningTime;
            const tenMinutes = 10 * 60 * 1e3;
            if (runningTime > tenMinutes) {
              const stuckReason = `Job stuck - running for ${Math.round(runningTime / 1e3 / 60)} minutes, last activity ${Math.round(timeSinceLastActivity / 1e3 / 60)} minutes ago. Current step: ${jobStatus.current_step || "unknown"}, Current message: ${jobStatus.current_message_id || "none"}`;
              await env.DB.prepare(`
                UPDATE scammer_job_status 
                SET status = 'failed', error = ?
                WHERE job_id = ?
              `).bind(stuckReason, jobId).run();
              jobStatus.status = "failed";
              jobStatus.error = stuckReason;
            }
          }
          return new Response(JSON.stringify(jobStatus), {
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          });
        } else {
          const allJobs = await env.DB.prepare(`
            SELECT job_id, status, messages_processed, total_messages, started_at, completed_at, error
            FROM scammer_job_status
            ORDER BY started_at DESC
            LIMIT 20
          `).all();
          return new Response(JSON.stringify({ jobs: allJobs.results || [] }), {
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          });
        }
      }
      if (action === "cancel" && jobId) {
        const result = await env.DB.prepare(`
          UPDATE scammer_job_status 
          SET status = 'failed', error = 'Cancelled by user'
          WHERE job_id = ? AND status = 'running'
        `).bind(jobId).run();
        return new Response(JSON.stringify({
          success: result.changes > 0,
          message: result.changes > 0 ? "Job cancelled" : "Job not found or not running"
        }), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }
      if (action === "force-complete" && jobId) {
        const result = await env.DB.prepare(`
          UPDATE scammer_job_status 
          SET status = 'completed', completed_at = ?, error = 'Force completed by user'
          WHERE job_id = ? AND status IN ('running', 'completing')
        `).bind(Date.now(), jobId).run();
        const scammerCount = await env.DB.prepare(`
          SELECT COUNT(*) as count FROM scammer_profile_cache
        `).first();
        return new Response(JSON.stringify({
          success: result.changes > 0,
          message: result.changes > 0 ? `Job force-completed. You have ${scammerCount?.count || 0} scammers in the database.` : "Job not found or already completed",
          scammers_in_db: scammerCount?.count || 0
        }), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }
      if (action === "cleanup") {
        const tenMinutesAgo = Date.now() - 10 * 60 * 1e3;
        const result = await env.DB.prepare(`
          UPDATE scammer_job_status 
          SET status = 'failed', error = 'Cleaned up - stuck job'
          WHERE status IN ('running', 'completing') AND last_activity_at < ?
        `).bind(tenMinutesAgo).run();
        return new Response(JSON.stringify({
          cleaned: result.changes,
          message: `Cleaned up ${result.changes} stuck jobs`
        }), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }
      if (action === "debug" && jobId) {
        const jobStatus = await env.DB.prepare(`
          SELECT * FROM scammer_job_status WHERE job_id = ?
        `).bind(jobId).first();
        const messageCounts = await env.DB.prepare(`
          SELECT status, COUNT(*) as count 
          FROM scammer_job_messages 
          WHERE job_id = ?
          GROUP BY status
        `).bind(jobId).all();
        const scammerCount = await env.DB.prepare(`
          SELECT COUNT(*) as count FROM scammer_profile_cache
        `).first();
        const sampleMessages = await env.DB.prepare(`
          SELECT message_id, status, error, processed_at
          FROM scammer_job_messages 
          WHERE job_id = ?
          ORDER BY processed_at DESC
          LIMIT 10
        `).bind(jobId).all();
        return new Response(JSON.stringify({
          job: jobStatus,
          messagesByStatus: messageCounts.results || [],
          scammersInDb: scammerCount?.count || 0,
          sampleMessages: sampleMessages.results || [],
          tip: 'If all messages are still "queued", the queue consumer is not processing them. Check: 1) Consumer is deployed, 2) Consumer logs in Cloudflare dashboard'
        }, null, 2), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }
      const { results } = await env.DB.prepare(`
        SELECT 
          user_id,
          roblox_name,
          roblox_display_name,
          roblox_avatar,
          discord_id,
          discord_display_name,
          victims,
          items_scammed,
          roblox_alts,
          thread_evidence
        FROM scammer_profile_cache
        WHERE user_id IS NOT NULL 
        ORDER BY updated_at DESC
      `).all();
      const scammers = results.map((row) => ({
        user_id: row.user_id,
        robloxDisplay: row.roblox_display_name || null,
        robloxUser: row.roblox_name || null,
        avatar: row.roblox_avatar || "https://emwiki.com/imgs/plr.jpg",
        discordDisplay: row.discord_display_name || null,
        discordId: row.discord_id || null,
        victims: row.victims || null,
        itemsScammed: row.items_scammed || null,
        robloxAlts: row.roblox_alts ? JSON.parse(row.roblox_alts) : [],
        hasThreadEvidence: !!row.thread_evidence
      }));
      return new Response(JSON.stringify({
        scammers
      }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    } catch (err) {
      console.error("Discord Scammers Error:", err);
      return new Response(JSON.stringify({ error: err.message, stack: err.stack }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }
}
__name(onRequestGet4, "onRequestGet4");
var delay;
var init_roblox_proxy = __esm({
  "api/roblox-proxy.js"() {
    init_functionsRoutes_0_10531370690170583();
    __name2(fetchRobloxProfile, "fetchRobloxProfile");
    __name2(fetchDiscordProfile, "fetchDiscordProfile");
    delay = /* @__PURE__ */ __name2((ms) => new Promise((resolve) => setTimeout(resolve, ms)), "delay");
    __name2(logJobActivity, "logJobActivity");
    __name2(enqueueScammerMessages, "enqueueScammerMessages");
    __name2(onRequestGet4, "onRequestGet");
  }
});
async function onRequestPost5({ request, env }) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file) {
      return new Response(JSON.stringify({ error: "No file uploaded" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    const accountId = env.CF_ACCOUNT_ID || "d9fecb3357660ea0fcfee5b23d5dd2f6";
    const accountHash = env.CF_ACCOUNT_HASH || "I2Jsf9fuZwSztWJZaX0DJA";
    const apiToken = env.CF_IMAGES_API_TOKEN;
    if (!accountId || !apiToken) {
      return new Response(JSON.stringify({
        error: "Cloudflare Images not configured"
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
    const cfFormData = new FormData();
    cfFormData.append("file", file);
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiToken}`
        },
        body: cfFormData
      }
    );
    if (!response.ok) {
      const errorData = await response.text();
      console.error("Cloudflare Images API error:", errorData);
      return new Response(JSON.stringify({
        error: "Failed to upload image",
        details: errorData
      }), {
        status: response.status,
        headers: { "Content-Type": "application/json" }
      });
    }
    const data = await response.json();
    if (!data.success) {
      return new Response(JSON.stringify({
        error: "Upload failed",
        details: data.errors
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
    const imageId = data.result.id;
    const variants = data.result.variants || [];
    const publicVariant = variants.find((v) => v.includes("/public")) || variants[0] || "";
    const imageUrl = publicVariant || `https://imagedelivery.net/${accountHash}/${imageId}/public`;
    return new Response(JSON.stringify({
      success: true,
      url: imageUrl,
      id: imageId,
      variants
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({
      error: "Upload failed: " + err.message
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
__name(onRequestPost5, "onRequestPost5");
var init_upload2 = __esm({
  "api/upload.js"() {
    init_functionsRoutes_0_10531370690170583();
    __name2(onRequestPost5, "onRequestPost");
  }
});
async function replaceUserTotals2(kv, userId, totalSpent, purchases) {
  const userIdStr = String(userId);
  const purchaseKey = `purchase:${userIdStr}`;
  await kv.put(purchaseKey, JSON.stringify({
    userId: parseInt(userIdStr),
    totalSpent,
    purchases
  }));
  return { totalSpent, purchases };
}
__name(replaceUserTotals2, "replaceUserTotals2");
async function processRobloxTransactionsReplace(kv, transactions, allowedUniverseName) {
  const userTotals = /* @__PURE__ */ new Map();
  const foundUniverseNames = /* @__PURE__ */ new Set();
  let skippedCount = 0;
  let processedCount = 0;
  const targetUniverseName = allowedUniverseName || "\u{1F464} EMWIKI Account Linker \u{1F310}";
  for (const tx of transactions) {
    if (tx.transactionType !== "Sale" || tx.currency?.type !== "Robux") {
      skippedCount++;
      continue;
    }
    const universeName = tx.details?.place?.name;
    if (universeName) {
      foundUniverseNames.add(universeName);
    }
    if (universeName !== targetUniverseName) {
      skippedCount++;
      continue;
    }
    const userId = tx.agent?.id;
    if (!userId) {
      skippedCount++;
      continue;
    }
    const priceAfterTax = tx.currency?.amount || 0;
    if (priceAfterTax <= 0) {
      skippedCount++;
      continue;
    }
    const price = Math.round(priceAfterTax / 0.7);
    const userIdStr = String(userId);
    if (!userTotals.has(userIdStr)) {
      userTotals.set(userIdStr, { totalSpent: 0, purchases: 0 });
    }
    const totals = userTotals.get(userIdStr);
    totals.totalSpent += price;
    totals.purchases += 1;
    processedCount++;
  }
  const processed = [];
  for (const [userIdStr, totals] of userTotals.entries()) {
    await replaceUserTotals2(kv, userIdStr, totals.totalSpent, totals.purchases);
    processed.push({
      userId: userIdStr,
      totalSpent: totals.totalSpent,
      purchases: totals.purchases
    });
  }
  return {
    processed,
    debug: {
      totalTransactions: transactions.length,
      processedCount,
      skippedCount,
      targetUniverseName,
      foundUniverseNames: Array.from(foundUniverseNames)
      // Show all found universe names
    }
  };
}
__name(processRobloxTransactionsReplace, "processRobloxTransactionsReplace");
async function fetchUserTransactions(userId, robloxCookie, cursor = "") {
  try {
    const url = new URL(`https://apis.roblox.com/transaction-records/v1/users/${userId}/transactions`);
    if (cursor) {
      url.searchParams.set("cursor", cursor);
    }
    url.searchParams.set("limit", "100");
    url.searchParams.set("transactionType", "Sale");
    url.searchParams.set("itemPricingType", "PaidAndLimited");
    const cookieValue = robloxCookie.startsWith(".ROBLOSECURITY=") ? robloxCookie : `.ROBLOSECURITY=${robloxCookie}`;
    const headers = {
      "Cookie": cookieValue,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    };
    const response = await fetch(url.toString(), { headers });
    if (!response.ok) {
      console.error(`Failed to fetch transactions for user ${userId}: ${response.status} ${response.statusText}`);
      return null;
    }
    return await response.json();
  } catch (e) {
    console.error(`Error fetching transactions for user ${userId}:`, e);
    return null;
  }
}
__name(fetchUserTransactions, "fetchUserTransactions");
async function handleScheduledFetch(request, env, kv) {
  try {
    const ownerUserId = env.DONATIONS_OWNER_USER_ID;
    const robloxCookie = env.ROBLOX_COOKIE;
    const universeName = env.DONATIONS_UNIVERSE_NAME;
    if (!ownerUserId) {
      return new Response(JSON.stringify({ error: "DONATIONS_OWNER_USER_ID not configured" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }
    if (!robloxCookie) {
      return new Response(JSON.stringify({ error: "ROBLOX_COOKIE not configured" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }
    const targetUniverseName = universeName || "\u{1F464} EMWIKI Account Linker \u{1F310}";
    let allTransactions = [];
    let cursor = "";
    let hasMore = true;
    while (hasMore) {
      const data = await fetchUserTransactions(ownerUserId, robloxCookie, cursor);
      if (!data || !data.data || data.data.length === 0) {
        hasMore = false;
        break;
      }
      allTransactions.push(...data.data);
      cursor = data.nextPageCursor || null;
      hasMore = !!cursor;
      if (hasMore) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    const result = await processRobloxTransactionsReplace(kv, allTransactions, targetUniverseName);
    const processed = result.processed;
    const debug = result.debug;
    return new Response(JSON.stringify({
      status: "ok",
      ownerUserId,
      totalTransactions: allTransactions.length,
      processedUsers: processed.length,
      targetUniverseName: debug.targetUniverseName,
      results: processed,
      debug: {
        processedCount: debug.processedCount,
        skippedCount: debug.skippedCount,
        foundUniverseNames: debug.foundUniverseNames
      }
    }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (e) {
    console.error("Scheduled fetch error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
}
__name(handleScheduledFetch, "handleScheduledFetch");
async function handleWebhook(request, env, kv) {
  try {
    const data = await request.json();
    let transactions = [];
    if (Array.isArray(data)) {
      transactions = data;
    } else if (data.transactions && Array.isArray(data.transactions)) {
      transactions = data.transactions;
    } else if (data.userId && data.price !== void 0) {
      transactions = [data];
    } else if (data.transactionType === "Sale") {
      transactions = [data];
    } else {
      return new Response(JSON.stringify({ error: "Invalid webhook format" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }
    const processed = [];
    const seenTokens = /* @__PURE__ */ new Set();
    for (const tx of transactions) {
      let userId, price;
      if (tx.userId !== void 0 && tx.price !== void 0) {
        userId = tx.userId;
        price = tx.price;
        if (!userId || price <= 0) continue;
      } else if (tx.transactionType === "Sale" && tx.currency?.type === "Robux") {
        if (tx.purchaseToken && seenTokens.has(tx.purchaseToken)) {
          continue;
        }
        if (tx.purchaseToken) {
          seenTokens.add(tx.purchaseToken);
        }
        userId = tx.agent?.id;
        if (!userId) continue;
        const priceAfterTax = tx.currency?.amount || 0;
        if (priceAfterTax <= 0) continue;
        price = Math.round(priceAfterTax / 0.7);
      } else {
        continue;
      }
      const userIdStr = String(userId);
      const purchaseKey = `purchase:${userIdStr}`;
      const existing = await kv.get(purchaseKey);
      let totalSpent = price;
      let purchases = 1;
      if (existing) {
        try {
          const existingData = JSON.parse(existing);
          totalSpent = (existingData.totalSpent || 0) + price;
          purchases = (existingData.purchases || 0) + 1;
        } catch (e) {
          console.error("Failed to parse existing purchase data:", e);
        }
      }
      await replaceUserTotals2(kv, userId, totalSpent, purchases);
      processed.push({
        userId: userIdStr,
        price,
        totalSpent,
        purchases
      });
    }
    return new Response(JSON.stringify({
      status: "ok",
      processed: processed.length,
      transactions: processed
    }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (e) {
    console.error("Webhook processing error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
}
__name(handleWebhook, "handleWebhook");
async function onRequest16(context) {
  const { request, env } = context;
  const kv = env.DONATIONS_KV;
  const url = new URL(request.url);
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  const mode = url.searchParams.get("mode");
  if (mode === "fetch" && request.method === "GET") {
    return handleScheduledFetch(request, env, kv);
  }
  const isWebhook = url.searchParams.get("webhook") === "true" || url.pathname.endsWith("/webhook");
  if (isWebhook && request.method === "POST") {
    return handleWebhook(request, env, kv);
  }
  if (request.method === "POST") {
    try {
      const { userId, productId, price } = await request.json();
      if (!userId || !productId || typeof price !== "number") {
        return new Response(JSON.stringify({ error: "Missing or invalid fields" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      const userIdStr = String(userId);
      const purchaseKey = `purchase:${userIdStr}`;
      const existing = await kv.get(purchaseKey);
      let totalSpent = price;
      let purchases = 1;
      if (existing) {
        try {
          const data = JSON.parse(existing);
          totalSpent = (data.totalSpent || 0) + price;
          purchases = (data.purchases || 0) + 1;
        } catch (e) {
          console.error("Failed to parse existing purchase data:", e);
        }
      }
      const result = await replaceUserTotals2(kv, userId, totalSpent, purchases);
      return new Response(JSON.stringify({ status: "ok", ...result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }
  if (request.method === "GET") {
    try {
      const list = await kv.list({ prefix: "purchase:", limit: 1e3 });
      const users = await Promise.all(
        list.keys.map(async (entry) => {
          const raw = await kv.get(entry.name);
          if (!raw) return null;
          try {
            const data = JSON.parse(raw);
            const userId = data.userId;
            const res = await fetch(`https://emwiki.com/api/roblox-proxy?userId=${userId}&mode=lite`);
            const profile = res.ok ? await res.json() : {};
            return {
              userId,
              totalSpent: data.totalSpent || 0,
              purchases: data.purchases || 0,
              name: profile.name || null,
              displayName: profile.displayName || null,
              avatar: profile.avatar || null
            };
          } catch (err) {
            console.error("Failed to parse user data:", err);
            return null;
          }
        })
      );
      const filtered = users.filter(Boolean);
      filtered.sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0));
      const limit = parseInt(url.searchParams.get("limit") || "50");
      return new Response(JSON.stringify(filtered.slice(0, limit)), {
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }
  return new Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
__name(onRequest16, "onRequest16");
var init_donations = __esm({
  "api/donations.js"() {
    init_functionsRoutes_0_10531370690170583();
    __name2(replaceUserTotals2, "replaceUserTotals");
    __name2(processRobloxTransactionsReplace, "processRobloxTransactionsReplace");
    __name2(fetchUserTransactions, "fetchUserTransactions");
    __name2(handleScheduledFetch, "handleScheduledFetch");
    __name2(handleWebhook, "handleWebhook");
    __name2(onRequest16, "onRequest");
  }
});
async function onRequest17(context) {
  const { request } = context;
  const corsHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (request.method === "GET") {
    return await onRequestGet5(context, corsHeaders);
  }
  if (request.method === "POST") {
    return await onRequestPost6(context, corsHeaders);
  }
  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: corsHeaders
  });
}
__name(onRequest17, "onRequest17");
async function onRequestGet5(context, corsHeaders) {
  const DBH = context.env.DBH;
  try {
    const result = await DBH.prepare(`
      SELECT id, timestamp, username, diff, version
      FROM history
      ORDER BY timestamp DESC
      LIMIT 50
    `).all();
    const data = result?.results ?? [];
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: corsHeaders
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, stack: err.stack }), {
      status: 500,
      headers: corsHeaders
    });
  }
}
__name(onRequestGet5, "onRequestGet5");
async function onRequestPost6(context, corsHeaders) {
  const DBH = context.env.DBH;
  try {
    const body = await context.request.json();
    const { username, diff, version } = body;
    if (!diff) {
      return new Response(JSON.stringify({ error: "diff is required" }), {
        status: 400,
        headers: corsHeaders
      });
    }
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    const finalUsername = username || "unknown";
    const finalVersion = version || null;
    await DBH.prepare(`
      INSERT INTO history (timestamp, username, diff, version)
      VALUES (?, ?, ?, ?)
    `).bind(timestamp, finalUsername, diff, finalVersion).run();
    return new Response(JSON.stringify({
      success: true,
      message: "History entry saved"
    }), {
      status: 200,
      headers: corsHeaders
    });
  } catch (err) {
    return new Response(JSON.stringify({
      error: err.message,
      stack: err.stack
    }), {
      status: 500,
      headers: corsHeaders
    });
  }
}
__name(onRequestPost6, "onRequestPost6");
var init_history = __esm({
  "api/history.js"() {
    init_functionsRoutes_0_10531370690170583();
    __name2(onRequest17, "onRequest");
    __name2(onRequestGet5, "onRequestGet");
    __name2(onRequestPost6, "onRequestPost");
  }
});
async function onRequest18(context) {
  const { params, request, env } = context;
  const postId = params.id;
  const base = "https://emwiki.com";
  function isBot(ua) {
    return /bot|crawler|spider|facebookexternalhit|twitterbot|slackbot|discordbot|whatsapp/i.test(ua);
  }
  __name(isBot, "isBot");
  __name2(isBot, "isBot");
  const userAgent = request.headers.get("user-agent") || "";
  if (!isBot(userAgent)) {
    return Response.redirect(`${base}/gallery#post-${postId}`, 302);
  }
  try {
    const galleryItem = await env.DBA.prepare(`
      SELECT
        g.id,
        g.title,
        g.description,
        g.media_url,
        g.thumbnail_url,
        g.views,
        g.likes,
        g.created_at,
        u.username,
        u.display_name
      FROM gallery_items g
      LEFT JOIN users u ON g.user_id = u.user_id
      WHERE g.id = ? AND g.status = 1
    `).bind(postId).first();
    if (!galleryItem) {
      return new Response("Gallery post not found", { status: 404 });
    }
    const getMediaType2 = /* @__PURE__ */ __name2((url) => {
      if (!url) return "image";
      const ext = url.split(".").pop().toLowerCase();
      const videoExts = ["mp4", "webm", "mov"];
      return videoExts.includes(ext) ? "video" : "image";
    }, "getMediaType");
    const likes = JSON.parse(galleryItem.likes || "[]");
    const mediaType = getMediaType2(galleryItem.media_url);
    let viewsCount = galleryItem.views || 0;
    const title = escapeHtml2(galleryItem.title || "Gallery Post");
    const description = escapeHtml2(galleryItem.description || "");
    const author = escapeHtml2(galleryItem.display_name || galleryItem.username || "Unknown");
    const likesCount = likes.length;
    const imageUrl = mediaType === "video" && galleryItem.thumbnail_url ? galleryItem.thumbnail_url : galleryItem.media_url;
    const metaDescription = description ? `${description} \u2022 ${likesCount} likes \u2022 ${viewsCount} views` : `${likesCount} likes \u2022 ${viewsCount} views \u2022 Posted by ${author}`;
    return new Response(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} - Epic Wiki Gallery</title>

<!-- OpenGraph tags for Discord/Facebook -->
<meta property="og:type" content="article" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${metaDescription}" />
<meta property="og:image" content="${imageUrl}" />
<meta property="og:url" content="${base}/gallery/${postId}" />
<meta property="og:site_name" content="Epic Wiki Gallery" />

<!-- Twitter Card tags -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${title}" />
<meta name="twitter:description" content="${metaDescription}" />
<meta name="twitter:image" content="${imageUrl}" />

<!-- Additional metadata -->
<meta property="article:author" content="${author}" />
<meta property="article:published_time" content="${galleryItem.created_at}" />

<!-- Theme color for Discord embed -->
<meta name="theme-color" content="#667eea" />
</head>
<body>
<script>
  // Redirect to gallery page with hash for users with JS enabled
  window.location.href = '${base}/gallery#post-${postId}';
<\/script>
<noscript>
  <meta http-equiv="refresh" content="0; url=${base}/gallery#post-${postId}" />
</noscript>
</body>
</html>`, {
      headers: {
        "Content-Type": "text/html",
        "Cache-Control": "public, max-age=300"
        // Cache for 5 minutes
      }
    });
  } catch (error) {
    console.error("Gallery embed error:", error);
    return new Response(`Error loading gallery post: ${error.message}`, {
      status: 500,
      headers: { "Content-Type": "text/plain" }
    });
  }
}
__name(onRequest18, "onRequest18");
function escapeHtml2(text) {
  if (!text) return "";
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
__name(escapeHtml2, "escapeHtml2");
var init_id = __esm({
  "gallery/[id].js"() {
    init_functionsRoutes_0_10531370690170583();
    __name2(onRequest18, "onRequest");
    __name2(escapeHtml2, "escapeHtml");
  }
});
async function onRequest19(context) {
  const { params, request, env } = context;
  const userId = params.userId;
  const base = "https://emwiki.com";
  function isBot(ua) {
    return /bot|crawler|spider|facebookexternalhit|twitterbot|slackbot|discordbot|whatsapp/i.test(ua);
  }
  __name(isBot, "isBot");
  __name2(isBot, "isBot");
  const userAgent = request.headers.get("user-agent") || "";
  try {
    const user = await env.DBA.prepare(`
      SELECT
        user_id,
        username,
        display_name,
        avatar_url,
        role,
        created_at,
        last_online
      FROM users
      WHERE user_id = ?
    `).bind(userId).first();
    if (!user) {
      return new Response("User not found", { status: 404 });
    }
    let stats = null;
    try {
      stats = await env.DBA.prepare(`
        SELECT
          total_trades,
          successful_trades,
          average_rating,
          total_reviews
        FROM user_trade_stats
        WHERE user_id = ?
      `).bind(userId).first();
    } catch (e) {
      console.error("Failed to fetch user_trade_stats:", e);
      stats = null;
    }
    let roles;
    try {
      roles = user.role ? JSON.parse(user.role) : ["user"];
    } catch (e) {
      roles = ["user"];
    }
    const displayName = escapeHtml3(user.display_name || user.username);
    const username = escapeHtml3(user.username);
    const avatarUrl = user.avatar_url || "https://emwiki.com/imgs/placeholder.png";
    const totalTrades = stats?.total_trades || 0;
    const rating = stats?.average_rating || 0;
    const reviews = stats?.total_reviews || 0;
    const rolesBadges = roles.filter((r) => r !== "user").map((r) => r.toUpperCase()).join(", ");
    const rolesText = rolesBadges ? ` \u2022 ${rolesBadges}` : "";
    const metaDescription = `@${username}${rolesText} \u2022 ${totalTrades} trades \u2022 ${rating.toFixed(1)}\u2B50 rating (${reviews} reviews)`;
    if (isBot(userAgent)) {
      return new Response(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${displayName} - EMwiki</title>

<!-- OpenGraph tags for Discord/Facebook -->
<meta property="og:type" content="profile" />
<meta property="og:title" content="${displayName}" />
<meta property="og:description" content="${metaDescription}" />
<meta property="og:image" content="${avatarUrl}" />
<meta property="og:url" content="${base}/profile/${userId}" />
<meta property="og:site_name" content="EMwiki" />

<!-- Twitter Card tags -->
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="${displayName}" />
<meta name="twitter:description" content="${metaDescription}" />
<meta name="twitter:image" content="${avatarUrl}" />

<!-- Profile metadata -->
<meta property="profile:username" content="${username}" />

<!-- Theme color for Discord embed -->
<meta name="theme-color" content="#667eea" />
</head>
<body>
<h1>${displayName}</h1>
<p>${metaDescription}</p>
</body>
</html>`, {
        headers: {
          "Content-Type": "text/html",
          "Cache-Control": "public, max-age=300"
          // Cache for 5 minutes
        }
      });
    }
    try {
      const profileAsset = await env.ASSETS.fetch(`${base}/profile.html`);
      let html = await profileAsset.text();
      html = html.replace(
        /<title>.*?<\/title>/,
        `<title>${displayName} - EMwiki</title>`
      );
      html = html.replace(
        /<meta name="description" content=".*?">/,
        `<meta name="description" content="${metaDescription}">`
      );
      html = html.replace(
        /<meta property="og:title" content=".*?">/,
        `<meta property="og:title" content="${displayName}">`
      );
      if (!html.includes("og:description")) {
        html = html.replace(
          /<meta property="og:image"/,
          `<meta property="og:description" content="${metaDescription}">
    <meta property="og:image"`
        );
      } else {
        html = html.replace(
          /<meta property="og:description" content=".*?">/,
          `<meta property="og:description" content="${metaDescription}">`
        );
      }
      html = html.replace(
        /<meta property="og:image" content=".*?">/,
        `<meta property="og:image" content="${avatarUrl}">`
      );
      return new Response(html, {
        headers: {
          "Content-Type": "text/html",
          "Cache-Control": "public, max-age=60"
        }
      });
    } catch (assetError) {
      console.error("Failed to fetch profile.html from assets:", assetError);
      return Response.redirect(`${base}/profile.html`, 302);
    }
  } catch (error) {
    console.error("Profile embed error:", error);
    return new Response(`Error loading profile: ${error.message}`, {
      status: 500,
      headers: { "Content-Type": "text/plain" }
    });
  }
}
__name(onRequest19, "onRequest19");
function escapeHtml3(text) {
  if (!text) return "";
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
__name(escapeHtml3, "escapeHtml3");
var init_userId = __esm({
  "profile/[userId].js"() {
    init_functionsRoutes_0_10531370690170583();
    __name2(onRequest19, "onRequest");
    __name2(escapeHtml3, "escapeHtml");
  }
});
async function onRequest20(context) {
  const url = new URL(context.request.url);
  if (url.pathname.startsWith("/api/")) {
    return await context.next();
  }
  if ((url.pathname === "/profile" || url.pathname === "/profile.html") && url.searchParams.has("user")) {
    const userId = url.searchParams.get("user").replace(/\.0$/, "");
    return Response.redirect(`https://emwiki.com/profile/${userId}`, 301);
  }
  const item = url.searchParams.get("item");
  const userAgent = context.request.headers.get("user-agent")?.toLowerCase() || "";
  const isBot = userAgent.includes("discordbot") || userAgent.includes("bot");
  if (item && isBot) {
    return Response.redirect(`https://emwiki.com/api/embed/${encodeURIComponent(item)}`, 302);
  }
  return await context.next();
}
__name(onRequest20, "onRequest20");
var init_middleware = __esm({
  "_middleware.js"() {
    init_functionsRoutes_0_10531370690170583();
    __name2(onRequest20, "onRequest");
  }
});
var routes;
var init_functionsRoutes_0_10531370690170583 = __esm({
  "../.wrangler/tmp/pages-0ICVPy/functionsRoutes-0.10531370690170583.mjs"() {
    init_path();
    init_path2();
    init_path3();
    init_path4();
    init_path5();
    init_path6();
    init_path7();
    init_upload();
    init_upload();
    init_refresh_avatars();
    init_webhook();
    init_item();
    init_path8();
    init_path8();
    init_path8();
    init_path8();
    init_path9();
    init_path10();
    init_path11();
    init_path12();
    init_path13();
    init_admin_login();
    init_check_session();
    init_latest_version();
    init_logout();
    init_roblox_proxy();
    init_upload2();
    init_donations();
    init_history();
    init_id();
    init_userId();
    init_middleware();
    routes = [
      {
        routePath: "/api/forum/comments/:path*",
        mountPath: "/api/forum/comments",
        method: "",
        middlewares: [],
        modules: [onRequest]
      },
      {
        routePath: "/api/forum/posts/:path*",
        mountPath: "/api/forum/posts",
        method: "",
        middlewares: [],
        modules: [onRequest2]
      },
      {
        routePath: "/api/trades/listings/:path*",
        mountPath: "/api/trades/listings",
        method: "",
        middlewares: [],
        modules: [onRequest3]
      },
      {
        routePath: "/api/trades/messages/:path*",
        mountPath: "/api/trades/messages",
        method: "",
        middlewares: [],
        modules: [onRequest4]
      },
      {
        routePath: "/api/trades/notifications/:path*",
        mountPath: "/api/trades/notifications",
        method: "",
        middlewares: [],
        modules: [onRequest5]
      },
      {
        routePath: "/api/trades/offers/:path*",
        mountPath: "/api/trades/offers",
        method: "",
        middlewares: [],
        modules: [onRequest6]
      },
      {
        routePath: "/api/trades/reviews/:path*",
        mountPath: "/api/trades/reviews",
        method: "",
        middlewares: [],
        modules: [onRequest7]
      },
      {
        routePath: "/api/images/upload",
        mountPath: "/api/images",
        method: "OPTIONS",
        middlewares: [],
        modules: [onRequestOptions]
      },
      {
        routePath: "/api/images/upload",
        mountPath: "/api/images",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost]
      },
      {
        routePath: "/api/cron/refresh-avatars",
        mountPath: "/api/cron",
        method: "",
        middlewares: [],
        modules: [onRequest8]
      },
      {
        routePath: "/api/donations/webhook",
        mountPath: "/api/donations",
        method: "",
        middlewares: [],
        modules: [onRequest9]
      },
      {
        routePath: "/api/embed/:item",
        mountPath: "/api/embed",
        method: "",
        middlewares: [],
        modules: [onRequest10]
      },
      {
        routePath: "/api/gallery/:path*",
        mountPath: "/api/gallery",
        method: "DELETE",
        middlewares: [],
        modules: [onRequestDelete]
      },
      {
        routePath: "/api/gallery/:path*",
        mountPath: "/api/gallery",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet]
      },
      {
        routePath: "/api/gallery/:path*",
        mountPath: "/api/gallery",
        method: "OPTIONS",
        middlewares: [],
        modules: [onRequestOptions2]
      },
      {
        routePath: "/api/gallery/:path*",
        mountPath: "/api/gallery",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost2]
      },
      {
        routePath: "/api/auth/:path*",
        mountPath: "/api/auth",
        method: "",
        middlewares: [],
        modules: [onRequest11]
      },
      {
        routePath: "/api/demand/:path*",
        mountPath: "/api/demand",
        method: "",
        middlewares: [],
        modules: [onRequest12]
      },
      {
        routePath: "/api/images/:path*",
        mountPath: "/api/images",
        method: "",
        middlewares: [],
        modules: [onRequest13]
      },
      {
        routePath: "/api/items/:path*",
        mountPath: "/api/items",
        method: "",
        middlewares: [],
        modules: [onRequest14]
      },
      {
        routePath: "/api/profile/:path*",
        mountPath: "/api/profile",
        method: "",
        middlewares: [],
        modules: [onRequest15]
      },
      {
        routePath: "/api/admin-login",
        mountPath: "/api",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost3]
      },
      {
        routePath: "/api/check-session",
        mountPath: "/api",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet2]
      },
      {
        routePath: "/api/latest-version",
        mountPath: "/api",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet3]
      },
      {
        routePath: "/api/logout",
        mountPath: "/api",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost4]
      },
      {
        routePath: "/api/roblox-proxy",
        mountPath: "/api",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet4]
      },
      {
        routePath: "/api/upload",
        mountPath: "/api",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost5]
      },
      {
        routePath: "/api/donations",
        mountPath: "/api",
        method: "",
        middlewares: [],
        modules: [onRequest16]
      },
      {
        routePath: "/api/history",
        mountPath: "/api",
        method: "",
        middlewares: [],
        modules: [onRequest17]
      },
      {
        routePath: "/gallery/:id",
        mountPath: "/gallery",
        method: "",
        middlewares: [],
        modules: [onRequest18]
      },
      {
        routePath: "/profile/:userId",
        mountPath: "/profile",
        method: "",
        middlewares: [],
        modules: [onRequest19]
      },
      {
        routePath: "/",
        mountPath: "/",
        method: "",
        middlewares: [onRequest20],
        modules: []
      }
    ];
  }
});
init_functionsRoutes_0_10531370690170583();
init_functionsRoutes_0_10531370690170583();
init_functionsRoutes_0_10531370690170583();
init_functionsRoutes_0_10531370690170583();
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
__name2(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name2(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name2(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name2(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name2(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name2(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
__name2(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
__name2(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name2(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
__name2(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
__name2(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
__name2(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
__name2(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
__name2(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
__name2(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
__name2(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");
__name2(pathToRegexp, "pathToRegexp");
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
__name2(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name2(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name2(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name2((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
init_functionsRoutes_0_10531370690170583();
var drainBody = /* @__PURE__ */ __name2(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;
init_functionsRoutes_0_10531370690170583();
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
__name2(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name2(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = pages_template_worker_default;
init_functionsRoutes_0_10531370690170583();
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
__name2(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
__name2(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");
__name2(__facade_invoke__, "__facade_invoke__");
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  static {
    __name(this, "___Facade_ScheduledController__");
  }
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name2(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name2(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name2(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
__name2(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name2((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name2((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
__name2(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;

// ../../../AppData/Roaming/npm/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody2 = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default2 = drainBody2;

// ../../../AppData/Roaming/npm/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError2(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError2(e.cause)
  };
}
__name(reduceError2, "reduceError");
var jsonError2 = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError2(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default2 = jsonError2;

// .wrangler/tmp/bundle-dTa3PC/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__2 = [
  middleware_ensure_req_body_drained_default2,
  middleware_miniflare3_json_error_default2
];
var middleware_insertion_facade_default2 = middleware_loader_entry_default;

// ../../../AppData/Roaming/npm/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__2 = [];
function __facade_register__2(...args) {
  __facade_middleware__2.push(...args.flat());
}
__name(__facade_register__2, "__facade_register__");
function __facade_invokeChain__2(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__2(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__2, "__facade_invokeChain__");
function __facade_invoke__2(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__2(request, env, ctx, dispatch, [
    ...__facade_middleware__2,
    finalMiddleware
  ]);
}
__name(__facade_invoke__2, "__facade_invoke__");

// .wrangler/tmp/bundle-dTa3PC/middleware-loader.entry.ts
var __Facade_ScheduledController__2 = class ___Facade_ScheduledController__2 {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__2)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler2(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__2 === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__2.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__2) {
    __facade_register__2(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__2(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__2(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler2, "wrapExportedHandler");
function wrapWorkerEntrypoint2(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__2 === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__2.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__2) {
    __facade_register__2(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__2(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__2(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint2, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY2;
if (typeof middleware_insertion_facade_default2 === "object") {
  WRAPPED_ENTRY2 = wrapExportedHandler2(middleware_insertion_facade_default2);
} else if (typeof middleware_insertion_facade_default2 === "function") {
  WRAPPED_ENTRY2 = wrapWorkerEntrypoint2(middleware_insertion_facade_default2);
}
var middleware_loader_entry_default2 = WRAPPED_ENTRY2;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__2 as __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default2 as default
};
//# sourceMappingURL=functionsWorker-0.17996048090183137.js.map
