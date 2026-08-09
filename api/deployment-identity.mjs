const shaPattern = /^[0-9a-f]{40}$/;

export function GET() {
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.trim();

  if (!commit || !shaPattern.test(commit)) {
    return Response.json(
      { error: 'deployment_identity_unavailable' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  return Response.json(
    { commit },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
