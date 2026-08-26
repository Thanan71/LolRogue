import { useEffect, useRef, useState } from 'react';
import { playUIClick } from '@/audio';
import { Button, Field, PageHeader, PageShell, Panel, Stack } from '@/components/ui';
import { ROUTES } from '@/config/routes';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { fr } from '@/i18n/fr';
import { SupabaseDailyRunRepository } from '@/services/repositories/SupabaseDailyRunRepository';
import { supabase } from '@/services/supabaseClient';
import { useAudioStore } from '@/stores/audioStore';
import { useAuthStore } from '@/stores/authStore';
import {
  type BattleSpeed,
  type Difficulty,
  type Language,
  type TextSize,
  useSettingsStore,
} from '@/stores/settingsStore';

export function SettingsPage() {
  const navigate = useAppNavigate();
  const audio = useAudioStore();
  const settings = useSettingsStore();
  const isGuest = useAuthStore((state) => state.isGuest);
  const player = useAuthStore((state) => state.player);
  const [publicName, setPublicName] = useState(player?.public_display_name ?? '');
  const [leaderboardOptOut, setLeaderboardOptOut] = useState(player?.leaderboard_opt_out ?? false);
  const [privacyStatus, setPrivacyStatus] = useState<string | null>(null);
  const [savingPrivacy, setSavingPrivacy] = useState(false);
  const privacyRequestVersion = useRef(0);
  const difficultyLabel = {
    easy: fr.settings.easy,
    normal: fr.settings.normal,
    hard: fr.settings.hard,
  }[settings.difficulty];

  useEffect(() => {
    privacyRequestVersion.current += 1;
    setPublicName(player?.public_display_name ?? '');
    setLeaderboardOptOut(player?.leaderboard_opt_out ?? false);
    setPrivacyStatus(null);
    setSavingPrivacy(false);
    return () => {
      privacyRequestVersion.current += 1;
    };
  }, [player?.id, player?.leaderboard_opt_out, player?.public_display_name]);

  const saveLeaderboardPrivacy = async () => {
    const playerId = player?.id;
    if (!playerId) return;
    const requestVersion = privacyRequestVersion.current + 1;
    privacyRequestVersion.current = requestVersion;
    setSavingPrivacy(true);
    setPrivacyStatus(null);
    const result = await new SupabaseDailyRunRepository(supabase)
      .setLeaderboardPrivacy(publicName.trim() || null, leaderboardOptOut)
      .catch(() => ({ error: new Error('privacy request failed') }));
    if (
      privacyRequestVersion.current !== requestVersion ||
      useAuthStore.getState().player?.id !== playerId
    ) {
      return;
    }
    setPrivacyStatus(result.error ? fr.settings.privacySaveError : fr.settings.privacySaved);
    setSavingPrivacy(false);
  };

  return (
    <PageShell width="content">
      <PageHeader
        title={fr.settings.title}
        subtitle="Adapte le rythme, le confort de lecture et les préférences de jeu."
        leading={
          <Button
            variant="ghost"
            onClick={() => {
              playUIClick();
              navigate(ROUTES.MENU);
            }}
          >
            {fr.common.backToMenu}
          </Button>
        }
      />
      <section className="settings-overview" aria-label={fr.settings.panel}>
        <Panel className="settings-card settings-card--audio">
          <div className="settings-panel__intro">
            <span className="settings-panel__eyebrow">Audio</span>
            <h2>Ambiance sonore</h2>
            <p>Ajuste les effets sans interrompre ta partie.</p>
          </div>
          <div className="settings-form">
            <Field
              label={
                <label htmlFor="sfx-volume">
                  {fr.settings.sfxVolume} — {audio.sfxVolume}%
                </label>
              }
            >
              <div className="settings-form__control-row">
                <input
                  id="sfx-volume"
                  type="range"
                  min="0"
                  max="100"
                  value={audio.sfxVolume}
                  onChange={(event) => audio.setSfxVolume(Number(event.target.value))}
                  aria-valuetext={`${audio.sfxVolume}%`}
                />
                <Button variant="ghost" onClick={audio.toggleSfxMute} aria-pressed={audio.sfxMuted}>
                  {audio.sfxMuted ? fr.settings.unmute : fr.settings.mute}
                </Button>
              </div>
            </Field>
          </div>
        </Panel>

        <Panel className="settings-card settings-card--gameplay">
          <div className="settings-panel__intro">
            <span className="settings-panel__eyebrow">Combat</span>
            <h2>Rythme de jeu</h2>
            <p>La difficulté s’applique au prochain run. La vitesse agit immédiatement.</p>
          </div>
          <div className="settings-form settings-form--two-columns">
            <Field label={<label htmlFor="language">{fr.settings.language}</label>}>
              <select
                id="language"
                value={settings.language}
                onChange={(event) => {
                  const language = event.target.value as Language;
                  settings.setLanguage(language);
                  window.location.reload();
                }}
              >
                <option value="fr-FR">{fr.settings.french}</option>
                <option value="en-US">{fr.settings.english}</option>
              </select>
            </Field>
            <Field label={<label htmlFor="difficulty">{fr.settings.difficulty}</label>}>
              <select
                id="difficulty"
                value={settings.difficulty}
                onChange={(event) => settings.setDifficulty(event.target.value as Difficulty)}
              >
                <option value="easy">{fr.settings.easy}</option>
                <option value="normal">{fr.settings.normal}</option>
                <option value="hard">{fr.settings.hard}</option>
              </select>
            </Field>
            <Field label={<label htmlFor="battle-speed">{fr.settings.battleSpeed}</label>}>
              <select
                id="battle-speed"
                value={settings.battleSpeed}
                onChange={(event) =>
                  settings.setBattleSpeed(Number(event.target.value) as BattleSpeed)
                }
              >
                <option value={1}>1×</option>
                <option value={2}>2×</option>
                <option value={3}>3×</option>
              </select>
            </Field>
          </div>
          <div className="settings-preview" aria-live="polite">
            <span className="settings-preview__pulse" aria-hidden="true" />
            <span>
              Difficulté <strong>{difficultyLabel}</strong> · animations{' '}
              <strong>{settings.battleSpeed}×</strong>
            </span>
          </div>
        </Panel>

        <Panel className="settings-card settings-card--accessibility">
          <div className="settings-panel__intro">
            <span className="settings-panel__eyebrow">Accessibilité</span>
            <h2>Lecture et commandes</h2>
            <p>Préserve les informations de combat même lorsque les effets sont désactivés.</p>
          </div>
          <div className="settings-form">
            <Field label={<label htmlFor="text-size">{fr.settings.textSize}</label>}>
              <select
                id="text-size"
                value={settings.textSize}
                onChange={(event) => settings.setTextSize(event.target.value as TextSize)}
              >
                <option value="small">{fr.settings.small}</option>
                <option value="medium">{fr.settings.medium}</option>
                <option value="large">{fr.settings.large}</option>
              </select>
            </Field>
            <Field label={<label htmlFor="particles">{fr.settings.particles}</label>}>
              <label className="settings-toggle" htmlFor="particles">
                <input
                  id="particles"
                  type="checkbox"
                  checked={settings.particlesEnabled}
                  onChange={(event) => settings.setParticlesEnabled(event.target.checked)}
                />
                <span className="settings-toggle__track" aria-hidden="true" />
                <span>{settings.particlesEnabled ? fr.common.enabled : fr.common.disabled}</span>
              </label>
            </Field>
            <Field
              label={<label htmlFor="keyboard-shortcuts">{fr.settings.keyboardShortcuts}</label>}
            >
              <label className="settings-toggle" htmlFor="keyboard-shortcuts">
                <input
                  id="keyboard-shortcuts"
                  type="checkbox"
                  checked={settings.keyboardShortcutsEnabled}
                  onChange={(event) => settings.setKeyboardShortcutsEnabled(event.target.checked)}
                />
                <span className="settings-toggle__track" aria-hidden="true" />
                <span>
                  {settings.keyboardShortcutsEnabled ? fr.common.enabled : fr.common.disabled}
                </span>
              </label>
            </Field>
          </div>
        </Panel>
      </section>
      {!isGuest && player && (
        <Panel aria-label={fr.settings.leaderboardPrivacy}>
          <Stack className="settings-form">
            <div className="settings-panel__intro">
              <span className="settings-panel__eyebrow">Compte connecté</span>
              <h2>{fr.settings.leaderboardPrivacy}</h2>
              <p>{fr.settings.leaderboardPrivacyHelp}</p>
            </div>
            <Field
              label={<label htmlFor="public-leaderboard-name">{fr.settings.publicName}</label>}
            >
              <input
                id="public-leaderboard-name"
                type="text"
                value={publicName}
                minLength={3}
                maxLength={32}
                pattern="[A-Za-zÀ-ÿ0-9 _.-]{3,32}"
                autoComplete="nickname"
                onChange={(event) => setPublicName(event.target.value)}
              />
            </Field>
            <label>
              <input
                type="checkbox"
                checked={leaderboardOptOut}
                onChange={(event) => setLeaderboardOptOut(event.target.checked)}
              />{' '}
              {fr.settings.hideFromLeaderboard}
            </label>
            <Button disabled={savingPrivacy} onClick={() => void saveLeaderboardPrivacy()}>
              {savingPrivacy ? fr.settings.savingPrivacy : fr.settings.savePrivacy}
            </Button>
            {privacyStatus && <p role="status">{privacyStatus}</p>}
          </Stack>
        </Panel>
      )}
    </PageShell>
  );
}
