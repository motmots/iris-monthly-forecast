import type { NextConfig } from "next";

// `/forecast/monthly` used to redirect to `/forecast/distribution?h=1M`. It is a
// real route again (the stored weekly worker run, see docs/DECISIONS.md §4), so
// the redirect is gone — a permanent redirect left here would shadow the page.
const nextConfig: NextConfig = {};

export default nextConfig;
