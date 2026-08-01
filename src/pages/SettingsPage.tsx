import { playUIClick } from '@/audio';
import { Button, Field, PageFooter, PageHeader, PageShell, Panel, Stack } from '@/components/ui';
import { ROUTES } from '@/config/routes';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { useAudioStore } from '@/stores/audioStore';
import { fr } from '@/i18n/fr';
import {
  type BattleSpeed,
  type Difficulty,
  type TextSize,
  useSettingsStore,
} from '@/stores/settingsStore';

export function SettingsPage() {
  const navigate = useAppNavigate();
  const audio = useAudioStore();
  const settings = useSettingsStore();

  return (
    <PageShell width="narrow">
      <PageHeader title={fr.settings.title} subtitle={fr.settings.subtitle} />
      <Panel aria-label={fr.settings.panel}>
        <Stack className="settings-form">
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
          <Field label={<label htmlFor="particles">{fr.settings.particles}</label>}>
            <select
              id="particles"
              value={settings.particlesEnabled ? 'enabled' : 'disabled'}
              onChange={(event) => settings.setParticlesEnabled(event.target.value === 'enabled')}
            >
              <option value="enabled">{fr.common.enabled}</option>
              <option value="disabled">{fr.common.disabled}</option>
            </select>
          </Field>
          <Field
            label={<label htmlFor="keyboard-shortcuts">{fr.settings.keyboardShortcuts}</label>}
          >
            <select
              id="keyboard-shortcuts"
              value={settings.keyboardShortcutsEnabled ? 'enabled' : 'disabled'}
              onChange={(event) =>
                settings.setKeyboardShortcutsEnabled(event.target.value === 'enabled')
              }
            >
              <option value="enabled">{fr.common.enabled}</option>
              <option value="disabled">{fr.common.disabled}</option>
            </select>
          </Field>
        </Stack>
      </Panel>
      <PageFooter>
        <Button
          variant="ghost"
          onClick={() => {
            playUIClick();
            navigate(ROUTES.MENU);
          }}
        >
          {fr.common.backToMenu}
        </Button>
      </PageFooter>
    </PageShell>
  );
}
