import { Button, PageFooter, PageHeader, PageShell, Panel, Stack } from '@/components/ui';
import { ROUTES } from '@/config/routes';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { fr } from '@/i18n/fr';

const credits = [
  { section: fr.credits.design, entries: ['Équipe LolRogue'] },
  { section: fr.credits.technologies, entries: ['React 18', 'TypeScript', 'Vite', 'Zustand'] },
  {
    section: fr.credits.inspiration,
    entries: ['League of Legends — Riot Games', 'Communauté Pokémon Rogue'],
  },
  { section: fr.credits.assets, entries: ['Riot Games — League of Legends Data Dragon'] },
];

export function CreditsPage() {
  const navigate = useAppNavigate();
  return (
    <PageShell width="narrow">
      <PageHeader title={fr.credits.title} subtitle={fr.credits.subtitle} />
      <Stack>
        {credits.map((group) => (
          <Panel key={group.section}>
            <h2>{group.section}</h2>
            {group.entries.map((entry) => (
              <p key={entry}>{entry}</p>
            ))}
          </Panel>
        ))}
        <p className="ui-legal-copy">{fr.credits.legal}</p>
      </Stack>
      <PageFooter>
        <Button variant="ghost" onClick={() => navigate(ROUTES.MENU)}>
          {fr.common.backToMenu}
        </Button>
      </PageFooter>
    </PageShell>
  );
}
