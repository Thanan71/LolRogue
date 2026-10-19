# ARCH-S4 — Cohortes et CLI du moteur 0.2.5

Le moteur courant dispose de sa baseline dédiée `config/authority-cohort-baselines-0.2.5.json`. La baseline `0.2.0` reste inchangée et reproductible avec le bundle historique conservé dans le registre. Les fixtures historiques v15 à v22 et leurs commandes explicites restent disponibles.

Le générateur sémantique reçoit l'identité enregistrée du moteur demandé et résout son bundle. Il ne réutilise plus l'identité de la fixture courante pour reproduire `0.2.0`. La fixture courante demeure stricte : un autre moteur ou hash est rejeté avant simulation. Le CLI conserve `balance repro` pour le moteur courant ; la reproduction des baselines historiques passe par `baseline check --engine`.

Commandes validées avec Node 24.19.0 le 13 octobre 2026 :

```bash
npm run balance -- baseline generate --engine 0.2.5 --output config/authority-cohort-baselines-0.2.5.json
npm run balance -- baseline check --engine 0.2.0
npm run balance -- baseline check --engine 0.2.5
```

Les deux vérifications reproduisent intégralement leurs artefacts. Une comparaison indépendante confirme que l'ancien fichier `0.2.0` est identique octet par octet à `HEAD` et que les **45 cellules × 30 seeds** possèdent les mêmes sources, seeds, scénarios, strates et rapports entre `0.2.0` et `0.2.5`. Seules l'identité du moteur et son hash changent.

Le catalogue CLI inclut les trois artefacts Veigar v22, 0.2.0 et 0.2.5. Les commandes collectives conservent les anciennes vérifications et ajoutent les nouveaux artefacts dans l'ordre du registre. L'équivalence du manifeste npm historique est testée dans son contexte figé 0.2.0 ; des assertions séparées prouvent les defaults 0.2.5, les 10 baselines publiées et les trois artefacts Veigar actuels.

**129 tests dans 2 fichiers** passent : `scriptCli.test.mjs` et `authorityCohortExecutionCli.test.ts`. Les typechecks app/scripts, Biome ciblé et `git diff --check` passent. Le contrôle de source confirme le hash courant `9009950fe0b1c6944a26486e65b0bb0f1379129b42d7499f2bf1c0a8ce3391fa` après les modifications de fixtures.

Logs de preuve : `/tmp/lolrogue-arch-s4-cohort-0.2.0-check.log`, `/tmp/lolrogue-arch-s4-cohort-0.2.5-check.log`, `/tmp/lolrogue-arch-s4-cohort-cli-tests.log` et `/tmp/lolrogue-arch-s4-cohort-source-hash.log`. La validation intégrée et la CI reprennent les contrôles collectifs ; cette tranche ne déploie ni migrations ni backend.
