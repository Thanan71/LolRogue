import { createClient } from 'npm:@supabase/supabase-js@2.110.8';
import { resolveAuthorityVerifier } from './authority-version-resolver.generated.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const JSON_HEADERS = { ...CORS_HEADERS, 'Content-Type': 'application/json' };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VERIFY_RETRY_AFTER_SECONDS = 5;

type JsonRecord = Record<string, unknown>;

function json(status: number, body: JsonRecord, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  });
}

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.entries(value as JsonRecord)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(',')}}`;
}

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function retryAfterSeconds(leaseExpiresAt: unknown): number {
  if (typeof leaseExpiresAt !== 'string') return VERIFY_RETRY_AFTER_SECONDS;
  const remainingMs = Date.parse(leaseExpiresAt) - Date.now();
  if (!Number.isFinite(remainingMs)) return VERIFY_RETRY_AFTER_SECONDS;
  return Math.max(1, Math.ceil(remainingMs / 1_000));
}

async function persistRejection(
  admin: ReturnType<typeof createClient<any>>,
  attemptId: string,
  leaseToken: string,
  rejectionCode: string,
): Promise<boolean> {
  const { data, error } = await admin.rpc(
    'reject_run_verification' as never,
    {
      p_attempt_id: attemptId,
      p_lease_token: leaseToken,
      p_rejection_code: rejectionCode,
    } as never,
  );
  const result = record(data);
  return !error && result?.status === 'rejected';
}

function buildVerifiedResult(snapshot: JsonRecord): JsonRecord | null {
  const team = Array.isArray(snapshot.team) ? snapshot.team : null;
  const championStats = Array.isArray(snapshot.championStats) ? snapshot.championStats : null;
  const biomes = stringArray(snapshot.biomesVisited) ? snapshot.biomesVisited : null;
  const augments = stringArray(snapshot.augmentIds) ? snapshot.augmentIds : null;
  const rawLedger = record(snapshot.ledger);
  const rawGold = record(rawLedger?.gold);
  const rawChampions = record(rawLedger?.champions);
  const rawItems = Array.isArray(rawLedger?.items) ? rawLedger.items : null;
  if (
    !team ||
    !championStats ||
    !biomes ||
    !augments ||
    !rawLedger ||
    rawLedger.version !== 1 ||
    !rawGold ||
    typeof rawGold.earned !== 'number' ||
    typeof rawGold.spent !== 'number' ||
    !rawChampions ||
    !rawItems ||
    typeof snapshot.won !== 'boolean' ||
    typeof snapshot.runLevel !== 'number' ||
    typeof snapshot.totalWavesCompleted !== 'number' ||
    typeof snapshot.gold !== 'number'
  ) {
    return null;
  }

  const members = team.map((rawMember) => {
    const member = record(rawMember);
    if (
      !member ||
      typeof member.championId !== 'string' ||
      typeof member.level !== 'number' ||
      (member.currentHp !== null && typeof member.currentHp !== 'number')
    ) {
      return null;
    }
    const stats =
      championStats.map(record).find((entry) => entry?.championId === member.championId) ?? null;
    if (!stats || !stringArray(stats.itemsCollected)) return null;
    const stat = (key: string) =>
      Math.max(0, Math.round(typeof stats[key] === 'number' ? stats[key] : 0));
    return {
      champion_id: member.championId,
      final_level: Math.trunc(member.level),
      final_hp: Math.max(0, Math.round((member.currentHp as number | null) ?? 0)),
      kills: stat('kills'),
      assists: stat('assists'),
      damage_dealt: stat('totalDamage'),
      damage_to_shields: stat('damageToShields'),
      damage_received: stat('damageReceived'),
      healing_done: stat('healingDone'),
      healing_received: stat('healingReceived'),
      overhealing: stat('overhealing'),
      shielding_done: stat('shieldingDone'),
      shielding_absorbed: stat('shieldingAbsorbed'),
      deaths: stat('deaths'),
      items_collected: stats.itemsCollected,
    };
  });
  if (members.some((member) => member === null)) return null;

  const itemEvents = rawItems.map((rawEvent) => {
    const event = record(rawEvent);
    if (
      !event ||
      typeof event.sequence !== 'number' ||
      typeof event.action !== 'string' ||
      typeof event.source !== 'string' ||
      typeof event.itemId !== 'string' ||
      typeof event.instanceId !== 'string' ||
      (event.championId !== null && typeof event.championId !== 'string') ||
      typeof event.goldAmount !== 'number' ||
      (event.nodeId !== null && typeof event.nodeId !== 'string') ||
      typeof event.wave !== 'number'
    ) {
      return null;
    }
    return {
      sequence: Math.trunc(event.sequence),
      action: event.action,
      source: event.source,
      item_id: event.itemId,
      instance_id: event.instanceId,
      champion_id: event.championId,
      gold_amount: Math.max(0, Math.round(event.goldAmount)),
      node_id: event.nodeId,
      wave: Math.max(1, Math.trunc(event.wave)),
    };
  });
  if (itemEvents.some((event) => event === null)) return null;

  const championLedger = Object.fromEntries(
    (members as JsonRecord[]).map((member) => [
      member.champion_id,
      {
        kills: member.kills,
        assists: member.assists,
        damage_dealt: member.damage_dealt,
        damage_to_shields: member.damage_to_shields,
        damage_received: member.damage_received,
        healing_done: member.healing_done,
        healing_received: member.healing_received,
        overhealing: member.overhealing,
        shielding_done: member.shielding_done,
        shielding_absorbed: member.shielding_absorbed,
        deaths: member.deaths,
      },
    ]),
  );
  const goldEarned = Math.max(0, Math.round(rawGold.earned));
  const goldSpent = Math.max(0, Math.round(rawGold.spent));
  const goldBalance = Math.max(0, Math.round(snapshot.gold));
  return {
    verified: true,
    won: snapshot.won,
    run_level: Math.trunc(snapshot.runLevel),
    waves_completed: Math.trunc(snapshot.totalWavesCompleted),
    biomes_visited: biomes,
    gold_earned: goldEarned,
    gold_spent: goldSpent,
    gold_balance: goldBalance,
    augment_ids: augments,
    team_members: members,
    ledger: {
      version: 1,
      champions: championLedger,
      gold: { earned: goldEarned, spent: goldSpent },
      items: itemEvents,
      next_item_event_sequence: Math.max(
        1,
        Math.trunc(
          typeof rawLedger.nextItemEventSequence === 'number'
            ? rawLedger.nextItemEventSequence
            : itemEvents.length + 1,
        ),
      ),
    },
  };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (request.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json(500, { error: 'server_configuration_error' });
  }

  const authorization = request.headers.get('Authorization') ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return json(401, { error: 'authentication_required' });

  const caller = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
    error: userError,
  } = await caller.auth.getUser(token);
  if (userError || !user) return json(401, { error: 'invalid_access_token' });

  let body: JsonRecord | null = null;
  try {
    body = record(await request.json());
  } catch {
    return json(400, { error: 'invalid_json_body' });
  }
  const attemptId = body?.attempt_id;
  if (typeof attemptId !== 'string' || !UUID_PATTERN.test(attemptId)) {
    return json(400, { error: 'invalid_attempt_id' });
  }

  // Resolve ownership with the caller's JWT before acquiring a service-role
  // lease. This prevents a guessed UUID from leasing another user's attempt.
  const { data: callerStatus, error: statusError } = await caller.rpc(
    'get_run_attempt_status' as never,
    { p_attempt_id: attemptId } as never,
  );
  const status = record(callerStatus);
  if (statusError || !status) return json(404, { error: 'run_attempt_not_found' });
  const effectiveStatus = status;
  if (effectiveStatus.status === 'verified' && record(effectiveStatus.response)) {
    return json(200, { response: effectiveStatus.response as JsonRecord });
  }
  if (effectiveStatus.status === 'rejected') {
    return json(422, {
      error: 'run_verification_rejected',
      rejection_code: effectiveStatus.rejection_code ?? 'verification_rejected',
    });
  }
  if (effectiveStatus.status === 'expired') return json(410, { error: 'run_attempt_expired' });
  if (effectiveStatus.status !== 'finished') {
    return json(409, {
      error: 'run_attempt_not_sealed',
      message: 'The run journal has not been sealed yet.',
      retryable: true,
    });
  }
  if (
    typeof effectiveStatus.engine_version !== 'string' ||
    typeof effectiveStatus.gameplay_content_hash !== 'string'
  ) {
    return json(500, { error: 'invalid_attempt_version_contract' });
  }
  if (
    !(await resolveAuthorityVerifier(
      effectiveStatus.engine_version,
      effectiveStatus.gameplay_content_hash,
    ))
  ) {
    return json(
      503,
      {
        error: 'unsupported_attempt_version',
        message: 'The verifier for this run version is temporarily unavailable.',
        retryable: true,
        retry_after_seconds: VERIFY_RETRY_AFTER_SECONDS,
      },
      { 'Retry-After': String(VERIFY_RETRY_AFTER_SECONDS) },
    );
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: claimData, error: claimError } = await admin.rpc(
    'claim_run_verification' as never,
    // A stable worker id lets a retry resume its own lease after a network
    // interruption instead of blocking itself for the full lease duration.
    { p_attempt_id: attemptId, p_worker_id: attemptId } as never,
  );
  const claim = record(claimData);
  if (claimError || !claim) return json(500, { error: 'verification_claim_failed' });
  if (claim.status === 'verified' && record(claim.response)) {
    return json(200, { response: claim.response as JsonRecord });
  }
  if (claim.status === 'rejected') {
    return json(422, {
      error: 'run_verification_rejected',
      rejection_code: claim.rejection_code ?? 'verification_rejected',
    });
  }
  if (claim.status === 'expired') return json(410, { error: 'run_attempt_expired' });
  if (claim.claimed !== true) {
    const retryAfter = retryAfterSeconds(claim.lease_expires_at);
    return json(
      409,
      {
        error: 'verification_in_progress',
        message: 'Verification is already in progress.',
        retryable: true,
        retry_after_seconds: retryAfter,
      },
      { 'Retry-After': String(retryAfter) },
    );
  }
  if (
    claim.user_id !== user.id ||
    typeof claim.lease_token !== 'string' ||
    typeof claim.engine_version !== 'string' ||
    typeof claim.gameplay_content_hash !== 'string' ||
    typeof claim.run_uuid !== 'string' ||
    typeof claim.seed !== 'number' ||
    (claim.mode !== 'normal' && claim.mode !== 'daily') ||
    typeof claim.difficulty !== 'string' ||
    !stringArray(claim.initial_team) ||
    !stringArray(claim.rune_ids) ||
    !record(claim.enhancement_snapshot) ||
    (claim.engine_version === 'run-engine-v8' && !record(claim.mastery_snapshot)) ||
    !Array.isArray(claim.commands)
  ) {
    if (
      typeof claim.lease_token !== 'string' ||
      !(await persistRejection(admin, attemptId, claim.lease_token, 'invalid_attempt_contract'))
    ) {
      return json(500, { error: 'verification_rejection_commit_failed' });
    }
    return json(422, {
      error: 'run_verification_rejected',
      rejection_code: 'invalid_attempt_contract',
    });
  }
  const verifier = await resolveAuthorityVerifier(
    claim.engine_version,
    claim.gameplay_content_hash,
  );
  if (!verifier) {
    return json(
      503,
      {
        error: 'unsupported_attempt_version',
        message: 'The verifier for this run version is temporarily unavailable.',
        retryable: true,
        retry_after_seconds: VERIFY_RETRY_AFTER_SECONDS,
      },
      { 'Retry-After': String(VERIFY_RETRY_AFTER_SECONDS) },
    );
  }

  const commands = claim.commands.map((rawCommand) => {
    const command = record(rawCommand);
    return command &&
      typeof command.sequence === 'number' &&
      typeof command.kind === 'string' &&
      record(command.payload)
      ? {
          sequence: command.sequence,
          kind: command.kind,
          payload: command.payload,
        }
      : null;
  });
  if (commands.some((command) => command === null)) {
    if (!(await persistRejection(admin, attemptId, claim.lease_token, 'invalid_claimed_journal'))) {
      return json(500, { error: 'verification_rejection_commit_failed' });
    }
    return json(422, {
      error: 'run_verification_rejected',
      rejection_code: 'invalid_claimed_journal',
    });
  }

  const verification = verifier.verify(
    {
      runUuid: claim.run_uuid,
      seed: claim.seed,
      team: claim.initial_team.map((championId) => ({ championId })),
      runeIds: claim.rune_ids,
      difficulty: claim.difficulty,
      mode: claim.mode,
      enhancementSnapshot: claim.enhancement_snapshot,
      masterySnapshot: record(claim.mastery_snapshot) ? claim.mastery_snapshot : {},
    },
    commands,
    { requireTerminal: true },
  );

  if (!verification.ok || !verification.result) {
    const code =
      typeof verification.error?.code === 'string'
        ? verification.error.code.slice(0, 100)
        : 'verification_failed';
    if (!(await persistRejection(admin, attemptId, claim.lease_token, code))) {
      return json(500, { error: 'verification_rejection_commit_failed' });
    }
    return json(422, {
      error: 'run_verification_rejected',
      rejection_code: code,
      command_index: verification.error?.commandIndex ?? null,
    });
  }

  const snapshot = record(verification.result.snapshot);
  const verifiedResult = snapshot ? buildVerifiedResult(snapshot) : null;
  if (!verifiedResult) {
    if (!(await persistRejection(admin, attemptId, claim.lease_token, 'invalid_verifier_result'))) {
      return json(500, { error: 'verification_rejection_commit_failed' });
    }
    return json(422, {
      error: 'run_verification_rejected',
      rejection_code: 'invalid_verifier_result',
    });
  }
  const resultHash = await sha256(verifiedResult);
  const { data: completionData, error: completionError } = await admin.rpc(
    'complete_run_verification' as never,
    {
      p_attempt_id: attemptId,
      p_lease_token: claim.lease_token,
      p_result: verifiedResult,
      p_result_hash: resultHash,
    } as never,
  );
  const completion = record(completionData);
  if (completionError || !completion) {
    return json(500, { error: 'verified_progression_commit_failed' });
  }
  if (completion.status === 'rejected') {
    return json(422, {
      error: 'run_verification_rejected',
      rejection_code: completion.rejection_code ?? 'result_rejected',
    });
  }
  const response = record(completion.response) ?? completion;
  return json(200, { response });
});
