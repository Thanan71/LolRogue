import { playUIClick } from '@/audio';
import { Button, Field, PageFooter, PageHeader, PageShell, Panel, Stack } from '@/components/ui';
import { ROUTES } from '@/config/routes';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { useAudioStore } from '@/stores/audioStore';
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
      <PageHeader title="Settings" subtitle="Game configuration" />
      <Panel aria-label="Game settings">
        <Stack className="settings-form">
          <Field label={<label htmlFor="sfx-volume">SFX Volume — {audio.sfxVolume}%</label>}>
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
                {audio.sfxMuted ? 'Unmute' : 'Mute'}
              </Button>
            </div>
          </Field>
          <Field label={<label htmlFor="difficulty">Difficulty</label>}>
            <select
              id="difficulty"
              value={settings.difficulty}
              onChange={(event) => settings.setDifficulty(event.target.value as Difficulty)}
            >
              <option value="easy">Easy</option>
              <option value="normal">Normal</option>
              <option value="hard">Hard</option>
            </select>
          </Field>
          <Field label={<label htmlFor="text-size">Text Size</label>}>
            <select
              id="text-size"
              value={settings.textSize}
              onChange={(event) => settings.setTextSize(event.target.value as TextSize)}
            >
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
            </select>
          </Field>
          <Field label={<label htmlFor="battle-speed">Battle Speed</label>}>
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
          <Field label={<label htmlFor="particles">Particles</label>}>
            <select
              id="particles"
              value={settings.particlesEnabled ? 'enabled' : 'disabled'}
              onChange={(event) => settings.setParticlesEnabled(event.target.value === 'enabled')}
            >
              <option value="enabled">Enabled</option>
              <option value="disabled">Disabled</option>
            </select>
          </Field>
          <Field label={<label htmlFor="keyboard-shortcuts">Keyboard shortcuts</label>}>
            <select
              id="keyboard-shortcuts"
              value={settings.keyboardShortcutsEnabled ? 'enabled' : 'disabled'}
              onChange={(event) =>
                settings.setKeyboardShortcutsEnabled(event.target.value === 'enabled')
              }
            >
              <option value="enabled">Enabled</option>
              <option value="disabled">Disabled</option>
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
          Back to Menu
        </Button>
      </PageFooter>
    </PageShell>
  );
}
