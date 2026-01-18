import { onRequest as __api_forum_comments___path___js_onRequest } from "C:\\Users\\ADMIN\\Desktop\\EpicCatalogue\\emwiki\\functions\\api\\forum\\comments\\[[path]].js"
import { onRequest as __api_forum_posts___path___js_onRequest } from "C:\\Users\\ADMIN\\Desktop\\EpicCatalogue\\emwiki\\functions\\api\\forum\\posts\\[[path]].js"
import { onRequest as __api_trades_listings___path___js_onRequest } from "C:\\Users\\ADMIN\\Desktop\\EpicCatalogue\\emwiki\\functions\\api\\trades\\listings\\[[path]].js"
import { onRequest as __api_trades_messages___path___js_onRequest } from "C:\\Users\\ADMIN\\Desktop\\EpicCatalogue\\emwiki\\functions\\api\\trades\\messages\\[[path]].js"
import { onRequest as __api_trades_notifications___path___js_onRequest } from "C:\\Users\\ADMIN\\Desktop\\EpicCatalogue\\emwiki\\functions\\api\\trades\\notifications\\[[path]].js"
import { onRequest as __api_trades_offers___path___js_onRequest } from "C:\\Users\\ADMIN\\Desktop\\EpicCatalogue\\emwiki\\functions\\api\\trades\\offers\\[[path]].js"
import { onRequest as __api_trades_reviews___path___js_onRequest } from "C:\\Users\\ADMIN\\Desktop\\EpicCatalogue\\emwiki\\functions\\api\\trades\\reviews\\[[path]].js"
import { onRequestOptions as __api_images_upload_js_onRequestOptions } from "C:\\Users\\ADMIN\\Desktop\\EpicCatalogue\\emwiki\\functions\\api\\images\\upload.js"
import { onRequestPost as __api_images_upload_js_onRequestPost } from "C:\\Users\\ADMIN\\Desktop\\EpicCatalogue\\emwiki\\functions\\api\\images\\upload.js"
import { onRequest as __api_cron_refresh_avatars_js_onRequest } from "C:\\Users\\ADMIN\\Desktop\\EpicCatalogue\\emwiki\\functions\\api\\cron\\refresh-avatars.js"
import { onRequest as __api_donations_webhook_js_onRequest } from "C:\\Users\\ADMIN\\Desktop\\EpicCatalogue\\emwiki\\functions\\api\\donations\\webhook.js"
import { onRequest as __api_embed__item__js_onRequest } from "C:\\Users\\ADMIN\\Desktop\\EpicCatalogue\\emwiki\\functions\\api\\embed\\[item].js"
import { onRequestDelete as __api_gallery___path___js_onRequestDelete } from "C:\\Users\\ADMIN\\Desktop\\EpicCatalogue\\emwiki\\functions\\api\\gallery\\[[path]].js"
import { onRequestGet as __api_gallery___path___js_onRequestGet } from "C:\\Users\\ADMIN\\Desktop\\EpicCatalogue\\emwiki\\functions\\api\\gallery\\[[path]].js"
import { onRequestOptions as __api_gallery___path___js_onRequestOptions } from "C:\\Users\\ADMIN\\Desktop\\EpicCatalogue\\emwiki\\functions\\api\\gallery\\[[path]].js"
import { onRequestPost as __api_gallery___path___js_onRequestPost } from "C:\\Users\\ADMIN\\Desktop\\EpicCatalogue\\emwiki\\functions\\api\\gallery\\[[path]].js"
import { onRequest as __api_auth___path___js_onRequest } from "C:\\Users\\ADMIN\\Desktop\\EpicCatalogue\\emwiki\\functions\\api\\auth\\[[path]].js"
import { onRequest as __api_demand___path___js_onRequest } from "C:\\Users\\ADMIN\\Desktop\\EpicCatalogue\\emwiki\\functions\\api\\demand\\[[path]].js"
import { onRequest as __api_images___path___js_onRequest } from "C:\\Users\\ADMIN\\Desktop\\EpicCatalogue\\emwiki\\functions\\api\\images\\[[path]].js"
import { onRequest as __api_items___path___js_onRequest } from "C:\\Users\\ADMIN\\Desktop\\EpicCatalogue\\emwiki\\functions\\api\\items\\[[path]].js"
import { onRequest as __api_profile___path___js_onRequest } from "C:\\Users\\ADMIN\\Desktop\\EpicCatalogue\\emwiki\\functions\\api\\profile\\[[path]].js"
import { onRequestPost as __api_admin_login_js_onRequestPost } from "C:\\Users\\ADMIN\\Desktop\\EpicCatalogue\\emwiki\\functions\\api\\admin-login.js"
import { onRequestGet as __api_check_session_js_onRequestGet } from "C:\\Users\\ADMIN\\Desktop\\EpicCatalogue\\emwiki\\functions\\api\\check-session.js"
import { onRequestGet as __api_latest_version_js_onRequestGet } from "C:\\Users\\ADMIN\\Desktop\\EpicCatalogue\\emwiki\\functions\\api\\latest-version.js"
import { onRequestPost as __api_logout_js_onRequestPost } from "C:\\Users\\ADMIN\\Desktop\\EpicCatalogue\\emwiki\\functions\\api\\logout.js"
import { onRequestGet as __api_roblox_proxy_js_onRequestGet } from "C:\\Users\\ADMIN\\Desktop\\EpicCatalogue\\emwiki\\functions\\api\\roblox-proxy.js"
import { onRequestPost as __api_upload_js_onRequestPost } from "C:\\Users\\ADMIN\\Desktop\\EpicCatalogue\\emwiki\\functions\\api\\upload.js"
import { onRequest as __api_donations_js_onRequest } from "C:\\Users\\ADMIN\\Desktop\\EpicCatalogue\\emwiki\\functions\\api\\donations.js"
import { onRequest as __api_history_js_onRequest } from "C:\\Users\\ADMIN\\Desktop\\EpicCatalogue\\emwiki\\functions\\api\\history.js"
import { onRequest as __gallery__id__js_onRequest } from "C:\\Users\\ADMIN\\Desktop\\EpicCatalogue\\emwiki\\functions\\gallery\\[id].js"
import { onRequest as __profile__userId__js_onRequest } from "C:\\Users\\ADMIN\\Desktop\\EpicCatalogue\\emwiki\\functions\\profile\\[userId].js"
import { onRequest as ___middleware_js_onRequest } from "C:\\Users\\ADMIN\\Desktop\\EpicCatalogue\\emwiki\\functions\\_middleware.js"

export const routes = [
    {
      routePath: "/api/forum/comments/:path*",
      mountPath: "/api/forum/comments",
      method: "",
      middlewares: [],
      modules: [__api_forum_comments___path___js_onRequest],
    },
  {
      routePath: "/api/forum/posts/:path*",
      mountPath: "/api/forum/posts",
      method: "",
      middlewares: [],
      modules: [__api_forum_posts___path___js_onRequest],
    },
  {
      routePath: "/api/trades/listings/:path*",
      mountPath: "/api/trades/listings",
      method: "",
      middlewares: [],
      modules: [__api_trades_listings___path___js_onRequest],
    },
  {
      routePath: "/api/trades/messages/:path*",
      mountPath: "/api/trades/messages",
      method: "",
      middlewares: [],
      modules: [__api_trades_messages___path___js_onRequest],
    },
  {
      routePath: "/api/trades/notifications/:path*",
      mountPath: "/api/trades/notifications",
      method: "",
      middlewares: [],
      modules: [__api_trades_notifications___path___js_onRequest],
    },
  {
      routePath: "/api/trades/offers/:path*",
      mountPath: "/api/trades/offers",
      method: "",
      middlewares: [],
      modules: [__api_trades_offers___path___js_onRequest],
    },
  {
      routePath: "/api/trades/reviews/:path*",
      mountPath: "/api/trades/reviews",
      method: "",
      middlewares: [],
      modules: [__api_trades_reviews___path___js_onRequest],
    },
  {
      routePath: "/api/images/upload",
      mountPath: "/api/images",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_images_upload_js_onRequestOptions],
    },
  {
      routePath: "/api/images/upload",
      mountPath: "/api/images",
      method: "POST",
      middlewares: [],
      modules: [__api_images_upload_js_onRequestPost],
    },
  {
      routePath: "/api/cron/refresh-avatars",
      mountPath: "/api/cron",
      method: "",
      middlewares: [],
      modules: [__api_cron_refresh_avatars_js_onRequest],
    },
  {
      routePath: "/api/donations/webhook",
      mountPath: "/api/donations",
      method: "",
      middlewares: [],
      modules: [__api_donations_webhook_js_onRequest],
    },
  {
      routePath: "/api/embed/:item",
      mountPath: "/api/embed",
      method: "",
      middlewares: [],
      modules: [__api_embed__item__js_onRequest],
    },
  {
      routePath: "/api/gallery/:path*",
      mountPath: "/api/gallery",
      method: "DELETE",
      middlewares: [],
      modules: [__api_gallery___path___js_onRequestDelete],
    },
  {
      routePath: "/api/gallery/:path*",
      mountPath: "/api/gallery",
      method: "GET",
      middlewares: [],
      modules: [__api_gallery___path___js_onRequestGet],
    },
  {
      routePath: "/api/gallery/:path*",
      mountPath: "/api/gallery",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_gallery___path___js_onRequestOptions],
    },
  {
      routePath: "/api/gallery/:path*",
      mountPath: "/api/gallery",
      method: "POST",
      middlewares: [],
      modules: [__api_gallery___path___js_onRequestPost],
    },
  {
      routePath: "/api/auth/:path*",
      mountPath: "/api/auth",
      method: "",
      middlewares: [],
      modules: [__api_auth___path___js_onRequest],
    },
  {
      routePath: "/api/demand/:path*",
      mountPath: "/api/demand",
      method: "",
      middlewares: [],
      modules: [__api_demand___path___js_onRequest],
    },
  {
      routePath: "/api/images/:path*",
      mountPath: "/api/images",
      method: "",
      middlewares: [],
      modules: [__api_images___path___js_onRequest],
    },
  {
      routePath: "/api/items/:path*",
      mountPath: "/api/items",
      method: "",
      middlewares: [],
      modules: [__api_items___path___js_onRequest],
    },
  {
      routePath: "/api/profile/:path*",
      mountPath: "/api/profile",
      method: "",
      middlewares: [],
      modules: [__api_profile___path___js_onRequest],
    },
  {
      routePath: "/api/admin-login",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_admin_login_js_onRequestPost],
    },
  {
      routePath: "/api/check-session",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_check_session_js_onRequestGet],
    },
  {
      routePath: "/api/latest-version",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_latest_version_js_onRequestGet],
    },
  {
      routePath: "/api/logout",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_logout_js_onRequestPost],
    },
  {
      routePath: "/api/roblox-proxy",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_roblox_proxy_js_onRequestGet],
    },
  {
      routePath: "/api/upload",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_upload_js_onRequestPost],
    },
  {
      routePath: "/api/donations",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_donations_js_onRequest],
    },
  {
      routePath: "/api/history",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_history_js_onRequest],
    },
  {
      routePath: "/gallery/:id",
      mountPath: "/gallery",
      method: "",
      middlewares: [],
      modules: [__gallery__id__js_onRequest],
    },
  {
      routePath: "/profile/:userId",
      mountPath: "/profile",
      method: "",
      middlewares: [],
      modules: [__profile__userId__js_onRequest],
    },
  {
      routePath: "/",
      mountPath: "/",
      method: "",
      middlewares: [___middleware_js_onRequest],
      modules: [],
    },
  ]