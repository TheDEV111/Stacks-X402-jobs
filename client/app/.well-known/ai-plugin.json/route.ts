import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const baseUrl = new URL(request.url).origin;

  return NextResponse.json({
    schema_version: "v1",
    name_for_human: "x402 Skills Marketplace",
    name_for_model: "x402_skills",
    description_for_human:
      "Discover and execute pay-per-use AI skills with STX micropayments on Stacks.",
    description_for_model:
      "Use this plugin to list skills and execute a selected skill endpoint. Calls may require x402 payment flow.",
    auth: {
      type: "none",
    },
    api: {
      type: "openapi",
      url: `${baseUrl}/api/openapi`,
      is_user_authenticated: false,
    },
    logo_url: `${baseUrl}/logo-icon.svg`,
    contact_email: process.env.SUPPORT_EMAIL || "devhenryno@gmail.com",
    legal_info_url: `${baseUrl}/docs`,
  });
}
