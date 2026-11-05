export { auth as middleware } from "@/lib/auth";
export const config = { matcher: ["/dashboard/:path*", "/workspace/:path*", "/settings/:path*", "/admin/:path*"] };
