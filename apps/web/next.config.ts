import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@pinocchio/shared", "@pinocchio/core", "@pinocchio/canvas", "@pinocchio/plan"],
  allowedDevOrigins: ["127.0.0.1"]
};

export default nextConfig;
