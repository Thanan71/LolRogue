import { Button, PageFooter, PageHeader, PageShell, Panel, Stack } from '@/components/ui';
import { ROUTES } from '@/config/routes';
import { useAppNavigate } from '@/hooks/useAppNavigate';

const credits = [
  { section: 'Game Design & Development', entries: ['LolRogue Team'] },
  { section: 'Built With', entries: ['React 18', 'TypeScript', 'Vite', 'Zustand'] },
  {
    section: 'Inspiration',
    entries: ['League of Legends — Riot Games', 'Pokémon Rogue community'],
  },
  { section: 'Art & Assets', entries: ['Riot Games — League of Legends Data Dragon'] },
];

export function CreditsPage() {
  const navigate = useAppNavigate();
  return (
    <PageShell width="narrow">
      <PageHeader title="Credits" subtitle="Acknowledgements" />
      <Stack>
        {credits.map((group) => (
          <Panel key={group.section}>
            <h2>{group.section}</h2>
            {group.entries.map((entry) => (
              <p key={entry}>{entry}</p>
            ))}
          </Panel>
        ))}
        <p className="ui-legal-copy">
          LolRogue is a non-commercial fan project inspired by League of Legends (© Riot Games).
          League of Legends and related assets are trademarks of Riot Games, Inc. This project is
          not affiliated with or endorsed by Riot Games.
        </p>
      </Stack>
      <PageFooter>
        <Button variant="ghost" onClick={() => navigate(ROUTES.MENU)}>
          Back to Menu
        </Button>
      </PageFooter>
    </PageShell>
  );
}
