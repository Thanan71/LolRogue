import {
  ChampionAccessBadge,
  ChampionAccessControls,
  ChampionPurchaseAction,
  ChampionRotationBonus,
} from '@/components/ChampionEconomy';
import { getChampionEconomyContent } from '@/i18n/championEconomyContent';
import { localizeChampion } from '@/i18n/content';
import { formatChampionTag } from '@/i18n/format';
import { runPreparationCopy } from '@/i18n/runPreparationContent';
import type { StarterSelectionController } from '../hooks/useStarterSelection';
import { ChampionCard } from './ChampionCard';

const starterCopy = runPreparationCopy.starter;

const economyCopy = getChampionEconomyContent();

export function StarterCatalog({ controller }: { controller: StarterSelectionController }) {
  const {
    visibleChoices,
    choices,
    search,
    setSearch,
    searchRef,
    setCatalogPage,
    roleFilter,
    setRoleFilter,
    roles,
    economyRoster,
    accessFilter,
    setAccessFilter,
    accessSort,
    setAccessSort,
    pagedCatalog,
    selectedStarterIds,
    resumableStart,
    economyNotLoaded,
    economy,
    starterSlotLimit,
    toggleStarter,
    setPreviewChampion,
    isDaily,
    starterPersonalization,
    starterRerollsUsed,
    rerollStarterOffer,
  } = controller;
  return (
    <section className="starter-select__catalog" aria-labelledby="starter-catalog-title">
      <div className="starter-select__catalog-heading">
        <h2 id="starter-catalog-title">{starterCopy.catalogTitle}</h2>
        <p role="status">{starterCopy.results(visibleChoices.length, choices.length)}</p>
      </div>
      <div className="starter-select__search-controls">
        <label htmlFor="starter-search">
          {starterCopy.searchLabel}
          <input
            id="starter-search"
            ref={searchRef}
            type="search"
            value={search}
            placeholder={starterCopy.searchPlaceholder}
            onChange={(event) => {
              setSearch(event.target.value);
              setCatalogPage(1);
            }}
          />
        </label>
        <label htmlFor="starter-role">
          {starterCopy.roleLabel}
          <select
            id="starter-role"
            value={roleFilter}
            onChange={(event) => {
              setRoleFilter(event.target.value);
              setCatalogPage(1);
            }}
          >
            <option value="all">{starterCopy.allRoles}</option>
            {roles.map((role) => (
              <option key={role} value={role}>
                {formatChampionTag(role)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {economyRoster && (
        <ChampionAccessControls
          filter={accessFilter}
          onFilter={(value) => {
            setAccessFilter(value);
            setCatalogPage(1);
          }}
          sort={accessSort}
          onSort={(value) => {
            setAccessSort(value);
            setCatalogPage(1);
          }}
        />
      )}
      <div className="starter-select__grid">
        {pagedCatalog.champions.map((champ) => (
          <div
            className="champion-economy-card"
            key={champ.id}
            id={`starter-economy-${champ.id}`}
            tabIndex={-1}
          >
            <ChampionCard
              champion={champ}
              selected={selectedStarterIds.includes(champ.id)}
              disabled={
                resumableStart !== null ||
                economyNotLoaded ||
                (economyRoster && economy.getAccess(champ.id) === 'locked') ||
                (!selectedStarterIds.includes(champ.id) &&
                  selectedStarterIds.length >= starterSlotLimit)
              }
              onSelect={() => toggleStarter(champ.id)}
            />
            {economyRoster && (
              <div className="champion-economy-card__status">
                <ChampionAccessBadge
                  championId={champ.id}
                  snapshot={economy.snapshot}
                  access={economy.getAccess(champ.id)}
                  serverNow={economy.serverNow}
                />
                <ChampionRotationBonus championId={champ.id} />
              </div>
            )}
            <div className="champion-economy-card__actions">
              <button
                className="champion-economy-card__details"
                type="button"
                aria-label={economyCopy.details(localizeChampion(champ).name)}
                onClick={() => setPreviewChampion(champ)}
              >
                {starterCopy.detailsShort}
              </button>
              {economyRoster && ['locked', 'owned'].includes(economy.getAccess(champ.id)) && (
                <ChampionPurchaseAction
                  championId={champ.id}
                  championName={localizeChampion(champ).name}
                  returnFocusId={`starter-choice-${champ.id}`}
                  onBeforePurchase={() => {
                    setAccessFilter('all');
                    setRoleFilter('all');
                    setSearch(localizeChampion(champ).name);
                    setCatalogPage(1);
                  }}
                />
              )}
            </div>
          </div>
        ))}
      </div>
      {visibleChoices.length === 0 && (
        <div className="starter-select__empty">
          <p role="status">{starterCopy.noResults}</p>
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setRoleFilter('all');
              setAccessFilter('available');
              setCatalogPage(1);
            }}
          >
            {starterCopy.clearFilters}
          </button>
        </div>
      )}
      {pagedCatalog.pageCount > 1 && (
        <nav className="starter-select__pagination" aria-label={starterCopy.paginationLabel}>
          <button
            type="button"
            disabled={pagedCatalog.page === 1}
            onClick={() => setCatalogPage(pagedCatalog.page - 1)}
          >
            {starterCopy.previousPage}
          </button>
          <span role="status">{starterCopy.page(pagedCatalog.page, pagedCatalog.pageCount)}</span>
          <button
            type="button"
            disabled={pagedCatalog.page === pagedCatalog.pageCount}
            onClick={() => setCatalogPage(pagedCatalog.page + 1)}
          >
            {starterCopy.nextPage}
          </button>
        </nav>
      )}
      {!isDaily && !resumableStart && !economyRoster && starterPersonalization.rerolls > 0 && (
        <button
          type="button"
          className="starter-select__back"
          disabled={starterRerollsUsed >= starterPersonalization.rerolls}
          onClick={() => {
            rerollStarterOffer();
            setCatalogPage(1);
          }}
        >
          {starterCopy.rerollRoster(starterPersonalization.rerolls - starterRerollsUsed)}
        </button>
      )}
    </section>
  );
}
